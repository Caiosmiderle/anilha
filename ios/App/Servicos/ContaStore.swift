import AnilhaCore
import AnilhaCache
import Foundation
import Observation
import Network
import Supabase

@MainActor @Observable
final class ContaStore {
    private(set) var dono: String?
    private(set) var dados = ReadData()
    private(set) var catalogo: [ReadRow] = []
    private(set) var carregando = true
    private(set) var ocupado = false
    private(set) var sincronizando = false
    private(set) var limpezaPendente = false
    private(set) var falhaAbertura = false
    private(set) var erro: String?
    private(set) var aviso = "Puxe para atualizar."
    private(set) var atualizadoEm: Date?
    private(set) var pendentes = 0
    private(set) var rejeitadas = 0
    private(set) var analises: [String: ReadRow] = [:]
    private(set) var admin = false
    private(set) var consentimento: ReadRow?
    var saudePermitida: Bool { History.healthOn(consentimento) }
    var saudePendente: Bool {
        guard let consentimento else { return false }
        return consentimento.fields["saude"] == .null
    }
    private(set) var analisando: Set<String> = []
    private var analisesNaoGravadas: [String: ReadRow] = [:]
    var sessaoAberta: String?
    @ObservationIgnored private lazy var descanso = DescansoLocal()
    private var repetirSync = false
    private var monitor: NWPathMonitor?
    private var tinhaRede = false
    var online: Bool { tinhaRede }
    private var cache: CacheLeitura?
    @ObservationIgnored private lazy var chaveiro = ChaveiroSessao()
    private var cliente: SupabaseClient?
    private var geracao = UUID()
    private var tarefaSync: Task<Void, Never>?
    private(set) var chatEntries: [ReadRow] = []
    private var chatHistory: [ReadRow] = []
    private var chatContext: String?
    private var chatEpoch = UUID()
    private(set) var chatStage: String?
    private(set) var chatError: String?
    var chatFull: Bool { chatHistory.count >= 32 }

    init() {
        _ = descanso
        _ = chaveiro
    }

    #if DEBUG
    private init(dadosDemonstracao: ReadData) {
        dados = dadosDemonstracao
    }
    #endif

    private func novoCliente() -> SupabaseClient {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 40
        return SupabaseClient(supabaseURL: Configuracao.supabaseURL, supabaseKey: Configuracao.supabaseKey,
            options: SupabaseClientOptions(
                auth: .init(storage: chaveiro, storageKey: "anilha-session", emitLocalSessionAsInitialSession: true),
                global: .init(session: URLSession(configuration: config))))
    }

    func abrir() async {
        guard carregando else { return }
        falhaAbertura = false
        defer { carregando = false }
        do {
            let url = Bundle.main.url(forResource: "exercises", withExtension: "json")
            guard let url else { throw ReadSync.Failure.invalidPage }
            catalogo = try JSONDecoder().decode([ReadRow].self, from: Data(contentsOf: url))
            let local = try CacheLeitura()
            cache = local
            // Check Keychain access before SDK's forgiving storage loader. Locked is not signed out.
            _ = try chaveiro.retrieve(key: "anilha-session")
            let client = novoCliente()
            cliente = client
            if monitor == nil {
                let monitor = NWPathMonitor()
                self.monitor = monitor
                monitor.pathUpdateHandler = { [weak self] path in
                    let online = path.status == .satisfied
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        let reconectou = online && !self.tinhaRede
                        self.tinhaRede = online
                        if reconectou { await self.atualizar() }
                    }
                }
                monitor.start(queue: DispatchQueue(label: "anilha.rede"))
            }
            if let session = client.auth.currentSession {
                dono = session.user.id.uuidString.lowercased()
                try local.preparar(dono!)
                try local.limparChat(dono!)
                try recarregar()
                atualizadoEm = try local.cursor(dono!).atualizadoEm
                Task { await atualizar() }
            } else { try local.apagar() }
        } catch {
            falhaAbertura = true
            erro = "Não foi possível abrir os dados locais. Desbloqueie o iPhone e tente novamente."
        }
    }

    func tentarAbrir() async {
        carregando = true; erro = nil
        await abrir()
    }

    func enviarCodigo(_ email: String) async -> Bool {
        guard !ocupado, let cliente, cache != nil, !limpezaPendente else { return false }
        ocupado = true; erro = nil
        defer { ocupado = false }
        do {
            try await cliente.auth.signInWithOTP(email: email, shouldCreateUser: true)
            return true
        } catch { erro = "Não deu para enviar o código. Confira a conexão ou espere um pouco e tente de novo."; return false }
    }

    func verificar(_ email: String, codigo: String) async {
        guard !ocupado, let cliente, let cache, !limpezaPendente else { return }
        ocupado = true; erro = nil
        defer { ocupado = false }
        do {
            let response = try await cliente.auth.verifyOTP(email: email, token: codigo, type: .email)
            guard let session = response.session else { throw ReadSync.Failure.accountChanged }
            // The SDK logs storage failures instead of throwing them. Confirm persistence before
            // presenting a logged-in account; session bytes never leave the Keychain path.
            guard let savedData = try chaveiro.retrieve(key: "anilha-session"),
                  let saved = try? JSONDecoder().decode(Session.self, from: savedData),
                  saved.user.id == session.user.id, saved.refreshToken == session.refreshToken else {
                erro = "Não foi possível guardar a sessão. Desbloqueie o iPhone e peça um código novo."
                return
            }
            try cache.apagar()
            geracao = UUID()
            dono = session.user.id.uuidString.lowercased()
            try cache.preparar(dono!)
            dados = ReadData(); atualizadoEm = nil
            await atualizar()
        } catch { erro = "Não deu para entrar. O código pode ter expirado. Confira a conexão e tente de novo." }
    }

    func atualizar() async {
        if let tarefaSync { repetirSync = true; await tarefaSync.value; return }
        guard let dono, let cliente, let cache, !limpezaPendente else { return }
        let epoch = geracao
        let task = Task { await self.puxar(dono: dono, cliente: cliente, cache: cache, epoch: epoch) }
        tarefaSync = task
        await task.value
        if geracao == epoch {
            tarefaSync = nil
            if repetirSync { repetirSync = false; await atualizar() }
            await analisarPendentes()
        }
    }

    private func conferir(_ owner: String, _ epoch: UUID) throws {
        guard !Task.isCancelled, geracao == epoch, dono == owner, !limpezaPendente else {
            throw ReadSync.Failure.accountChanged
        }
    }
    private func puxar(dono owner: String, cliente: SupabaseClient, cache: CacheLeitura, epoch: UUID) async {
        sincronizando = true
        aviso = "Atualizando..."
        defer { if geracao == epoch { sincronizando = false } }
        do {
            // Refresh before sending queued health data. Offline uses the last persisted answer.
            if let session = try? await cliente.auth.session {
                try conferir(owner, epoch)
                guard session.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
                if let consent: ReadRow = try? await rpc("consent_state", body: Data("{}".utf8), token: session.accessToken) {
                    try conferir(owner, epoch)
                    try cache.guardarConsentimento(consent, dono: owner)
                    try recarregar()
                }
            }
            for _ in 0..<100 {
                try conferir(owner, epoch)
                let batch = try cache.lote(owner)
                if batch.changes.isEmpty { break }
                let session = try await cliente.auth.session
                try conferir(owner, epoch)
                guard session.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
                let result: PushResult = try await rpc("sync_push", body: JSONEncoder().encode(PushPayload(changes: batch.changes)), token: session.accessToken)
                try conferir(owner, epoch)
                try cache.confirmar(batch, dono: owner, rejeitadas: Set(result.rejected.map { "\($0.table):\($0.id)" }))
                try recarregar()
            }
            for index in 0..<200 {
                try conferir(owner, epoch)
                // Refresh only for network work. An expired cached session still opens offline data.
                let session = try await cliente.auth.session
                try conferir(owner, epoch)
                guard session.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
                let since = try cache.cursor(owner).cursor
                let page = try await pull(since: since, token: session.accessToken)
                try conferir(owner, epoch)
                try ReadSync.validate(page, since: since, owner: owner)
                let horizon = page.horizon ?? 0
                if index == 0, horizon > (try cache.horizonte(owner)) {
                    let retentionCursor = try cache.cursorRetencao(owner)
                    if retentionCursor > 0 && horizon > retentionCursor {
                        let ids: [String: [String]] = try await rpc("sync_ids", body: Data("{}".utf8), token: session.accessToken)
                        try conferir(owner, epoch)
                        try cache.limparPurgadas(ids, dono: owner, horizon: horizon)
                    } else { try cache.marcarHorizonte(owner, horizon: horizon) }
                }
                try cache.aplicar(page, dono: owner, since: since)
                try recarregar()
                atualizadoEm = try cache.cursor(owner).atualizadoEm
                if !page.more {
                    aviso = rejeitadas > 0 ? "Há envios recusados pelo servidor. Confira os dados antes de sair da conta." : pendentes > 0 ? "Há alterações aguardando envio." : "Dados atualizados."
                    return
                }
            }
            throw ReadSync.Failure.tooManyPages
        } catch {
            guard geracao == epoch, dono == owner else { return }
            aviso = "Sem sincronização agora. Seu treino está salvo neste iPhone. Puxe para tentar novamente."
            if cliente.auth.currentSession == nil {
                aviso = "Sua sessão expirou. Saia e entre novamente para atualizar. Os dados baixados continuam disponíveis."
            }
        }
    }

    // Fixed-token read RPC, like accountRpc in the PWA. No request can adopt a new account's JWT.
    private func pull(since: Int64, token: String) async throws -> PullPage {
        struct Params: Encodable { let since: Int64; let max_rows = 500 }
        return try await rpc("sync_pull", body: JSONEncoder().encode(Params(since: since)), token: token)
    }
    private struct PushResult: Decodable, Sendable {
        struct Rejection: Decodable, Sendable { let table: String; let id: String }
        let applied: Int
        let stale: Int
        let rejected: [Rejection]
    }
    private func rpc<T: Decodable & Sendable>(_ name: String, body: Data, token: String) async throws -> T {
        var request = URLRequest(url: Configuracao.supabaseURL.appendingPathComponent("rest/v1/rpc/\(name)"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue(Configuracao.supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ReadSync.Failure.invalidPage
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func recarregar() throws {
        guard let dono, let cache else { return }
        dados = try cache.ler(dono)
        analises = try cache.metadados(dono).merging(analisesNaoGravadas) { _, memory in memory }
        let healthBefore = saudePermitida
        consentimento = analises["consent"]
        if healthBefore && !saudePermitida { limparChat(); chatError = "A conversa foi limpa porque a permissão de saúde mudou." }
        pendentes = try cache.pendentes(dono); rejeitadas = try cache.rejeitadas(dono)
        descanso.atualizar(fim: avisosDescanso ? ativa.flatMap(Workout.restEnd) : nil)
    }
    var ativa: ReadRow? { dados.active("sessions").first { $0.string("status") == "active" } }
    func gravar(_ changes: [PushChange], metadata: [String: ReadRow] = [:]) -> Bool {
        guard let dono, let cache, !limpezaPendente else { return false }
        do {
            try cache.gravar(changes, dono: dono, catalog: catalogo, metadata: metadata)
            try recarregar(); erro = nil
            aviso = "Salvo neste iPhone. \(pendentes) alterações aguardando envio."
            return true
        } catch { erro = "Não foi possível salvar. Tente novamente antes de fechar o app."; return false }
    }
    func permitirSaude() async {
        guard !ocupado, let dono, let cliente, let cache, !limpezaPendente else { return }
        let epoch = geracao
        ocupado = true
        defer { ocupado = false }
        do {
            let session = try await cliente.auth.session
            try conferir(dono, epoch)
            guard session.user.id.uuidString.lowercased() == dono else { throw ReadSync.Failure.accountChanged }
            let params = ReadRow(fields: ["p_kind": .string("saude"), "p_version": .string("2026-10-19"), "p_granted": .bool(true)])
            let consent: ReadRow = try await rpc("record_consent", body: JSONEncoder().encode(params), token: session.accessToken)
            try conferir(dono, epoch)
            try cache.guardarConsentimento(consent, dono: dono)
            try recarregar(); erro = nil
            await atualizar()
        } catch {
            guard geracao == epoch else { return }
            erro = "Não deu para salvar agora. Conecte e tente de novo."
        }
    }
    func salvarCorpo(_ row: ReadRow, today: String) -> Bool {
        do {
            let change = try History.bodyChange(row, consent: consentimento, today: today)
            if gravar([change]) { Task { await atualizar() }; return true }
        } catch { erro = "Confira a data, o peso (20 a 400 kg), a cintura (30 a 250 cm) e a permissão de saúde." }
        return false
    }
    func comecar(_ ficha: ReadRow) {
        do { try recarregar() }
        catch { erro = "Não foi possível abrir o treino salvo. Tente novamente antes de começar outro."; return }
        if let ativa { sessaoAberta = ativa.id; return }
        let items = dados.items(ficha.id)
        let exercises = dados.exercises(catalog: catalogo)
        guard let atual = dados.routines.first(where: { $0.id == ficha.id }), !items.isEmpty,
              items.allSatisfy({ exercises[$0.string("exercise_id") ?? ""] != nil }) else {
            erro = "Esta ficha tem exercícios indisponíveis. Atualize ou ajuste no PWA."; return
        }
        if gravar(Workout.start(dados, routine: atual, catalog: catalogo, today: LocalDay.today(), now: Date.now.timeIntervalSince1970 * 1000)) {
            sessaoAberta = ativa?.id
        }
    }
    func rascunhoSalvo(_ setID: String) -> ReadRow? {
        guard let dono, let cache else { return nil }
        do { return try cache.rascunho(dono, set: setID) }
        catch { erro = "Não foi possível ler o rascunho desta série."; return nil }
    }
    func salvarFicha(_ row: ReadRow, original: ReadRow?, antigos: [ReadRow], items: [ReadRow]) -> Bool {
        guard let dono, let cache, !limpezaPendente else { return false }
        do {
            try cache.salvarFicha(row, original: original, oldItems: antigos, after: items, dono: dono,
                                  catalog: Array(dados.exercises(catalog: catalogo).values))
            try recarregar(); erro = nil
            Task { await atualizar() }
            return true
        } catch { erro = "Não foi possível salvar. Confira os campos e reabra a ficha se ela mudou em outro aparelho."; return false }
    }
    func apagarFicha(_ original: ReadRow, antigos: [ReadRow]) -> Bool {
        guard let dono, let cache, !limpezaPendente else { return false }
        do {
            try cache.apagarFicha(original, oldItems: antigos, dono: dono)
            try recarregar(); erro = nil
            Task { await atualizar() }
            return true
        } catch { erro = "Não foi possível apagar. Reabra a ficha e tente novamente."; return false }
    }
    func sugestaoIgnorada(sessionID: String, itemID: String) -> Bool {
        analises["dismissed:\(sessionID)"]?.bool(itemID) == true
    }
    func ignorarSugestao(sessionID: String, itemID: String) -> Bool {
        guard let dono, let cache, !limpezaPendente else { return false }
        do {
            try cache.ignorarSugestao(sessionID: sessionID, itemID: itemID, dono: dono, catalog: catalogo)
            try recarregar(); erro = nil
            Task { await atualizar() }
            return true
        } catch { erro = "Não foi possível ignorar a sugestão. Tente novamente."; return false }
    }
    func guardarRascunho(_ row: ReadRow) {
        guard let dono, let cache else { return }
        do { try cache.guardarRascunho(row, dono: dono) }
        catch { erro = "Não foi possível guardar o ajuste. Tente novamente antes de fechar." }
    }
    func permitirAvisos() async -> Bool {
        guard avisosDescanso else { return false }
        let permitido = await descanso.permitir()
        descanso.atualizar(fim: ativa.flatMap(Workout.restEnd))
        return permitido
    }
    private var avisosDescanso: Bool { dados.active("profiles").first?.object("reminders").bool("rest") != false }
    func concluir(_ session: ReadRow) -> Bool {
        var changes = Workout.finish(dados, session: session, now: Date.now.timeIntervalSince1970 * 1000)
        guard !changes.isEmpty else { return false }
        var preview = dados
        for change in changes {
            var rows = preview.tables[change.table] ?? []
            rows.removeAll { $0.id == change.row.id }; rows.append(change.row)
            preview.tables[change.table] = rows
        }
        changes += Workout.records(preview, session: session.id, catalog: catalogo)
        let saved = gravar(changes, metadata: ["analysis:\(session.id)": ReadRow(fields: ["status": .string("pending")])])
        if saved { Task { await analisar(session.id, automatico: true) } }
        return saved
    }

    private func analisarPendentes() async {
        guard tinhaRede else { return }
        let ids = analises.filter { $0.key.hasPrefix("analysis:") && $0.value.string("status") == "pending" }.map { String($0.key.dropFirst(9)) }.sorted()
        for id in ids { await analisar(id, automatico: true) }
    }
    func analisar(_ id: String, automatico: Bool = false) async {
        guard let owner = dono, let cache, let cliente, !limpezaPendente, !analisando.contains(id),
              analises["analysis:\(id)"]?.object("reply").string("summary") == nil,
              !automatico || analises["analysis:\(id)"]?.string("status") == "pending" else { return }
        guard tinhaRede else { return }
        let epoch = geracao
        analisando.insert(id)
        defer { if geracao == epoch { analisando.remove(id) } }
        var sent = false
        do {
            try recarregar()
            let planned = analises.filter { $0.key.hasPrefix("analysis-plan:") }.reduce(into: [String: ReadRow]()) { $0[String($1.key.dropFirst(14))] = $1.value }
            let rules = analises.filter { $0.key.hasPrefix("analysis-rule:") }.reduce(into: [String: String]()) { $0[String($1.key.dropFirst(14))] = $1.value.string("rule") }
            let context = try WorkoutAnalysis.context(dados, sessionID: id, catalog: catalogo, planned: planned, appliedRules: rules, analyses: analises.filter { $0.key.hasPrefix("analysis:") }.map(\.value))
            let binding = try WorkoutAnalysis.binding(dados, sessionID: id)
            let auth = try await cliente.auth.session
            try conferir(owner, epoch)
            guard auth.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
            // Persist the attempt before sending. An interrupted request requires an explicit retry.
            try cache.guardarAnalise(ReadRow(fields: ["status": .string("requesting")]), sessionID: id, dono: owner)
            try recarregar()
            var request = URLRequest(url: Configuracao.supabaseURL.appendingPathComponent("functions/v1/analise-treino"))
            request.httpMethod = "POST"; request.timeoutInterval = 125
            request.setValue(Configuracao.supabaseKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(ReadRow(fields: ["context": .object(context.fields)]))
            let config = URLSessionConfiguration.ephemeral; config.urlCache = nil
            let transport = URLSession(configuration: config)
            defer { transport.invalidateAndCancel() }
            sent = true
            let (bytes, response) = try await transport.data(for: request)
            try conferir(owner, epoch)
            guard let http = response as? HTTPURLResponse else { throw ReadSync.Failure.invalidPage }
            if http.statusCode == 429 {
                try cache.guardarAnalise(ReadRow(fields: ["status": .string("failed"), "error": .string("Você chegou ao limite de hoje do Waltér. Amanhã tem mais.")]), sessionID: id, dono: owner)
                try recarregar(); return
            }
            var responseRow = try JSONDecoder().decode(ReadRow.self, from: bytes)
            let usage = WorkoutAnalysis.usage(responseRow.object("usage"))
            responseRow.fields.removeValue(forKey: "usage")
            guard (200..<300).contains(http.statusCode), let reply = WorkoutAnalysis.parseReply(responseRow, slots: context.array("items").count, catalog: catalogo) else { throw ReadSync.Failure.invalidPage }
            let saved = ReadRow(fields: ["status": .string("proposed"), "reply": .object(reply.fields), "context": .object(context.fields), "binding": .object(binding.fields), "usage": usage.map { .object($0.fields) } ?? .null])
            // Keep an in-memory copy if the disk is temporarily unavailable; do not call the model again.
            analisesNaoGravadas["analysis:\(id)"] = saved
            analises["analysis:\(id)"] = saved
            do {
                try cache.guardarAnalise(saved, sessionID: id, dono: owner)
                analisesNaoGravadas.removeValue(forKey: "analysis:\(id)")
                try recarregar()
            }
            catch { erro = "A análise chegou, mas não foi possível guardá-la. Tente guardar novamente antes de fechar." }
        } catch {
            guard geracao == epoch, dono == owner else { return }
            let pending = !sent && (!tinhaRede || (error as? URLError)?.code == .notConnectedToInternet)
            do {
                try cache.guardarAnalise(ReadRow(fields: ["status": .string(pending ? "pending" : "failed"), "error": .string(pending ? "Sem internet. A análise aguarda conexão." : "Não foi possível analisar agora. Tente novamente. Uma tentativa enviada conta no limite diário.")]), sessionID: id, dono: owner)
                try recarregar()
            } catch { erro = "Não foi possível guardar o estado da análise." }
        }
    }
    func guardarAnalise(_ saved: ReadRow, id: String) -> Bool {
        guard let dono, let cache else { return false }
        do { try cache.guardarAnalise(saved, sessionID: id, dono: dono); analisesNaoGravadas.removeValue(forKey: "analysis:\(id)"); try recarregar(); return true }
        catch { erro = "Não foi possível guardar a análise."; return false }
    }
    func analisePrecisaGravar(_ id: String) -> Bool { analisesNaoGravadas["analysis:\(id)"] != nil }
    func revisaoPrecisaGravar(_ id: String) -> Bool { analisesNaoGravadas["review:\(id)"] != nil }
    func conferirAdmin() async {
        guard let owner = dono, let cliente else { admin = false; return }
        let epoch = geracao
        do {
            let auth = try await cliente.auth.session
            try conferir(owner, epoch)
            guard auth.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
            let result: Bool = try await rpc("is_admin", body: Data("{}".utf8), token: auth.accessToken)
            try conferir(owner, epoch); admin = result
        } catch { if geracao == epoch { admin = false } }
    }
    func revisarFicha(_ id: String) async {
        let key = "review:\(id)", today = LocalDay.today()
        guard admin, let owner = dono, let cliente, let cache, online, !analisando.contains(key) else { return }
        let epoch = geracao
        analisando.insert(key)
        defer { if geracao == epoch { analisando.remove(key) } }
        do {
            try recarregar()
            let version = RoutineReview.version(dados, routineID: id)
            if let saved = analises[key], saved.object("version") == version, saved.object("reply").string("resumo") != nil {
                try cache.guardarRevisao(saved, routineID: id, dono: owner)
                analisesNaoGravadas.removeValue(forKey: key); try recarregar(); return
            }
            let context = try RoutineReview.context(dados, routineID: id, today: today, catalog: catalogo, analyses: analises.filter { $0.key.hasPrefix("analysis:") }.map(\.value))
            let binding = try RoutineReview.binding(dados, routineID: id, today: today)
            let auth = try await cliente.auth.session
            try conferir(owner, epoch)
            guard auth.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
            try cache.guardarRevisao(ReadRow(fields: ["status": .string("requesting"), "version": .object(version.fields)]), routineID: id, dono: owner)
            try recarregar()
            var request = URLRequest(url: Configuracao.supabaseURL.appendingPathComponent("functions/v1/revisao-ficha"))
            request.httpMethod = "POST"; request.timeoutInterval = 125
            request.setValue(Configuracao.supabaseKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(ReadRow(fields: ["context": .object(context.fields)]))
            let config = URLSessionConfiguration.ephemeral; config.urlCache = nil
            let transport = URLSession(configuration: config)
            defer { transport.invalidateAndCancel() }
            let (bytes, response) = try await transport.data(for: request)
            try conferir(owner, epoch)
            var raw = try JSONDecoder().decode(ReadRow.self, from: bytes)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                erro = raw.string("error") ?? "Não foi possível revisar agora."; return
            }
            let usage = WorkoutAnalysis.usage(raw.object("usage")); raw.fields.removeValue(forKey: "usage")
            guard let reply = RoutineReview.parseReply(raw, slots: context.array("items").count, catalog: catalogo) else { throw ReadSync.Failure.invalidPage }
            let saved = ReadRow(fields: ["routineID": .string(id), "version": .object(version.fields), "context": .object(context.fields), "binding": .object(binding.fields), "reply": .object(reply.fields),
                "usage": usage.map { .object($0.fields) } ?? .null, "decisions": .array(reply.array("ajustes").map { _ in .object(["status": .string("proposed")]) })])
            analisesNaoGravadas[key] = saved; analises[key] = saved
            try cache.guardarRevisao(saved, routineID: id, dono: owner)
            analisesNaoGravadas.removeValue(forKey: key); try recarregar(); erro = nil
        } catch {
            guard geracao == epoch, dono == owner else { return }
            erro = "Não foi possível concluir ou guardar a revisão. Tente novamente. Uma tentativa enviada conta no limite diário."
        }
    }
    func decidirRevisao(_ id: String, index: Int, action: String) {
        guard admin, let dono, let cache else { return }
        do { try cache.decidirRevisao(routineID: id, index: index, action: action, dono: dono, catalog: catalogo, today: LocalDay.today()); try recarregar(); erro = nil; Task { await atualizar() } }
        catch { erro = "Não foi possível mudar a ficha. Ela pode ter mudado depois da revisão ou deste ajuste." }
    }
    func salvarAjuste(_ saved: ReadRow, id: String) {
        guard let dono, let cache else { return }
        do { try cache.salvarAjuste(saved, sessionID: id, dono: dono, catalog: catalogo); try recarregar(); erro = nil; Task { await atualizar() } }
        catch { erro = "O ajuste não foi salvo. Confira os parâmetros. Se a ficha mudou depois da análise, preserve a edição mais recente e ajuste no PWA." }
    }
    func desfazerAjuste(_ id: String) {
        guard let dono, let cache else { return }
        do { try cache.desfazerAjuste(sessionID: id, dono: dono); try recarregar(); erro = nil; Task { await atualizar() } }
        catch { erro = "Não deu para voltar: os dados podem ter mudado depois deste ajuste." }
    }

    func limparChat() {
        chatEpoch = UUID(); chatHistory = []; chatEntries = []; chatContext = nil; chatStage = nil; chatError = nil
        if let dono, let cache {
            do { try cache.limparChat(dono); analises = analises.filter { !$0.key.hasPrefix("chat:") } }
            catch { chatError = "Não foi possível limpar as propostas guardadas. Tente novamente." }
        }
    }
    func enviarChat(_ ask: String) async {
        guard let owner = dono, let cliente, let cache, !limpezaPendente, chatStage == nil, !chatFull else { return }
        guard online else { chatError = "Sem internet. Sua conversa continua neste iPhone. Conecte para enviar."; return }
        let text = ask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.utf16.count <= 2000 else { return }
        let epoch = geracao, turn = chatEpoch
        chatStage = "Lendo seu pedido"; chatError = nil
        defer { if chatEpoch == turn { chatStage = nil } }
        do {
            try recarregar()
            guard chatEpoch == turn else { return }
            let ctx = try AgentChat.context(dados, consent: consentimento, today: LocalDay.today())
            let version = AgentChat.contextText(ctx, catalog: catalogo)
            let result = try await AgentChat.run(history: chatHistory, ask: text, context: ctx, withContext: chatContext != version, catalog: catalogo,
                stage: { [weak self] value in self?.chatStage = value }, call: { [weak self] messages in
                    guard let self else { throw CancellationError() }
                    try self.conferir(owner, epoch)
                    guard self.chatEpoch == turn else { throw CancellationError() }
                    let auth = try await cliente.auth.session
                    try self.conferir(owner, epoch)
                    guard self.chatEpoch == turn, auth.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
                    var request = URLRequest(url: Configuracao.supabaseURL.appendingPathComponent("functions/v1/agente"))
                    request.httpMethod = "POST"; request.timeoutInterval = 45
                    request.setValue(Configuracao.supabaseKey, forHTTPHeaderField: "apikey")
                    request.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONEncoder().encode(ReadRow(fields: ["messages": AgentChat.rows(messages)]))
                    let config = URLSessionConfiguration.ephemeral; config.urlCache = nil
                    let transport = URLSession(configuration: config)
                    defer { transport.invalidateAndCancel() }
                    let (bytes, response) = try await transport.data(for: request)
                    try self.conferir(owner, epoch)
                    guard self.chatEpoch == turn else { throw CancellationError() }
                    let raw = try JSONDecoder().decode(ReadRow.self, from: bytes)
                    guard let http = response as? HTTPURLResponse else { throw ReadSync.Failure.invalidPage }
                    if http.statusCode == 429 { throw ChatFailure.message("Você chegou ao limite de hoje do Waltér. Amanhã tem mais.") }
                    guard (200..<300).contains(http.statusCode) else { throw ChatFailure.message(AgentChat.displayText(raw.string("error") ?? "O Waltér não respondeu agora. Tente novamente.")) }
                    return raw
                })
            try conferir(owner, epoch)
            guard chatEpoch == turn else { return }
            var cards: [ReadRow] = []
            for proposal in result.proposals {
                let id = Workout.id()
                var card = proposal.changing(["id": .string(id)])
                if proposal.string("kind") == "ficha" {
                    // Bind to the context used for this turn, never silently to newer data.
                    let current = try AgentChat.context(dados, consent: consentimento, today: LocalDay.today())
                    if current != ctx { card.fields["unavailable"] = .bool(true) }
                    else {
                        do { try cache.guardarPropostaChat(proposal, id: id, routineID: proposal.object("before").id, dono: owner, today: LocalDay.today()) }
                        catch { card.fields["unavailable"] = .bool(true); chatError = "A proposta chegou, mas não foi possível guardá-la para Salvar. Faça um novo pedido." }
                    }
                }
                cards.append(card)
            }
            chatHistory = result.messages; chatContext = version
            chatEntries += [ReadRow(fields: ["id": .string(Workout.id()), "role": .string("user"), "text": .string(AgentChat.displayText(text))]),
                ReadRow(fields: ["id": .string(Workout.id()), "role": .string("assistant"), "text": .string(result.text), "cards": AgentChat.rows(cards)])]
            try recarregar()
        } catch {
            guard geracao == epoch, dono == owner, chatEpoch == turn else { return }
            if case ChatFailure.message(let message) = error { chatError = message }
            else if (error as? URLError)?.code == .notConnectedToInternet { chatError = "Sem internet. Conecte e envie novamente." }
            else { chatError = "Não foi possível concluir o pedido. Tente novamente. Tentativas enviadas contam no limite diário." }
        }
    }
    func decidirChat(_ id: String, action: String) {
        guard let dono, let cache, chatStage == nil, !limpezaPendente else { return }
        do {
            try cache.decidirChat(id, action: action, dono: dono, catalog: catalogo, today: LocalDay.today())
            try recarregar(); chatContext = nil; chatError = nil
            Task { await atualizar() }
        } catch { chatError = "Não foi possível mudar a ficha. Ela pode ter mudado depois da proposta. Suas edições foram preservadas." }
    }
    private enum ChatFailure: Error { case message(String) }

    func sair() async {
        guard !ocupado else { return }
        ocupado = true; limpezaPendente = true; erro = nil
        geracao = UUID(); tarefaSync?.cancel(); tarefaSync = nil
        limparChat()
        descanso.atualizar(fim: nil)
        dono = nil; dados = ReadData(); atualizadoEm = nil; sincronizando = false
        analises = [:]; consentimento = nil; analisando = []; analisesNaoGravadas = [:]; admin = false
        pendentes = 0; rejeitadas = 0; sessaoAberta = nil; repetirSync = false
        defer { ocupado = false }
        do {
            // Immediate local sign-out, including offline. Seal the old client's storage before
            // any suspension, so a late refresh cannot recreate its session in Keychain.
            try chaveiro.apagarEEncerrar()
            if let cliente { await cliente.auth.stopAutoRefresh() }
            try cache?.apagar()
            chaveiro = ChaveiroSessao(); cliente = novoCliente()
            limpezaPendente = false; aviso = "Puxe para atualizar."
        } catch { erro = "Não foi possível limpar a sessão. Desbloqueie o iPhone e tente sair novamente." }
    }
}

#if DEBUG
extension ContaStore {
    /// Memory-only presentation fixture. Never call abrir, atualizar or a write from this root.
    static func demonstracao(descanso: Bool, pronto: Bool = false) throws -> ContaStore {
        let store = ContaStore(dadosDemonstracao: try ModoDemo.dados(descanso: descanso, pronto: pronto))
        guard let url = Bundle.main.url(forResource: "exercises", withExtension: "json") else {
            throw WorkoutAnalysis.Failure.invalidSession
        }
        store.catalogo = try JSONDecoder().decode([ReadRow].self, from: Data(contentsOf: url))
        store.carregando = false
        store.consentimento = ReadRow(fields: ["saude": .object(["granted": .bool(true), "version": .string("2026-10-19")])])
        store.aviso = "Demonstração · dados fictícios em memória"
        let context = try WorkoutAnalysis.context(store.dados, sessionID: "demo-done", catalog: store.catalogo)
        let binding = try WorkoutAnalysis.binding(store.dados, sessionID: "demo-done")
        let reply = try JSONDecoder().decode(ReadRow.self, from: Data(ModoDemo.resposta.utf8))
        guard WorkoutAnalysis.parseReply(reply, slots: context.array("items").count, catalog: store.catalogo) != nil else {
            throw WorkoutAnalysis.Failure.invalidAdjustment
        }
        _ = try WorkoutAnalysis.changes(reply.object("adjustment"), binding: binding, catalog: store.catalogo)
        store.analises["analysis:demo-done"] = ReadRow(fields: [
            "status": .string("proposed"), "reply": .object(reply.fields),
            "context": .object(context.fields), "binding": .object(binding.fields),
            "usage": .object(["model": .string("claude-haiku-5-5"), "input_tokens": .number(2345), "output_tokens": .number(210)])
        ])
        let reviewContext = try RoutineReview.context(store.dados, routineID: "demo-routine", today: "2026-11-12", catalog: store.catalogo)
        let reviewBinding = try RoutineReview.binding(store.dados, routineID: "demo-routine", today: "2026-11-12")
        let reviewReply = try JSONDecoder().decode(ReadRow.self, from: Data(ModoDemo.revisao.utf8))
        guard RoutineReview.parseReply(reviewReply, slots: reviewContext.array("items").count, catalog: store.catalogo) != nil else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        store.analises["review:demo-routine"] = ReadRow(fields: ["routineID": .string("demo-routine"), "version": .object(RoutineReview.version(store.dados, routineID: "demo-routine").fields),
            "context": .object(reviewContext.fields), "binding": .object(reviewBinding.fields), "reply": .object(reviewReply.fields), "decisions": .array([.object(["status": .string("proposed")])]),
            "usage": .object(["model": .string("claude-sonnet-5-5"), "input_tokens": .number(2000), "output_tokens": .number(1000)])])
        let chatContext = try AgentChat.context(store.dados, consent: store.consentimento, today: "2026-11-12")
        let chatInput = ReadRow(fields: ["ficha_id": .string("demo-back"), "mudancas": .array([.object(["tipo": .string("descanso"), "exercicio_id": .string("puxada-frente"), "descanso_segundos": .number(120)])])])
        let proposal = AgentChat.execute("editar_ficha", input: chatInput, context: chatContext, catalog: store.catalogo).object("proposal").changing(["id": .string("demo-chat")])
        guard proposal.string("kind") == "ficha" else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        store.chatEntries = [ReadRow(fields: ["id": .string("demo-chat-user"), "role": .string("user"), "text": .string("Quero descansar dois minutos na puxada.")]),
            ReadRow(fields: ["id": .string("demo-chat-answer"), "role": .string("assistant"), "text": .string("Revise o descanso da ficha. Só muda quando você salvar."), "cards": AgentChat.rows([proposal])])]
        store.tinhaRede = true
        return store
    }
}
#endif
