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
            let context = try WorkoutAnalysis.context(dados, sessionID: id, catalog: catalogo, planned: planned, appliedRules: rules)
            let binding = try WorkoutAnalysis.binding(dados, sessionID: id)
            let auth = try await cliente.auth.session
            try conferir(owner, epoch)
            guard auth.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
            // Persist the attempt before sending. An interrupted request requires an explicit retry.
            try cache.guardarAnalise(ReadRow(fields: ["status": .string("requesting")]), sessionID: id, dono: owner)
            try recarregar()
            var request = URLRequest(url: Configuracao.supabaseURL.appendingPathComponent("functions/v1/analise-treino"))
            request.httpMethod = "POST"; request.timeoutInterval = 45
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

    func sair() async {
        guard !ocupado else { return }
        ocupado = true; limpezaPendente = true; erro = nil
        geracao = UUID(); tarefaSync?.cancel(); tarefaSync = nil
        descanso.atualizar(fim: nil)
        dono = nil; dados = ReadData(); atualizadoEm = nil; sincronizando = false
        analises = [:]; analisando = []; analisesNaoGravadas = [:]
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
    static func demonstracao(descanso: Bool) throws -> ContaStore {
        let store = ContaStore(dadosDemonstracao: try ModoDemo.dados(descanso: descanso))
        guard let url = Bundle.main.url(forResource: "exercises", withExtension: "json") else {
            throw WorkoutAnalysis.Failure.invalidSession
        }
        store.catalogo = try JSONDecoder().decode([ReadRow].self, from: Data(contentsOf: url))
        store.carregando = false
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
        return store
    }
}
#endif
