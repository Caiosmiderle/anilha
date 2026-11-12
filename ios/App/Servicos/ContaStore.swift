import AnilhaCore
import AnilhaCache
import Foundation
import Observation
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
    private var cache: CacheLeitura?
    private var chaveiro = ChaveiroSessao()
    private var cliente: SupabaseClient?
    private var geracao = UUID()
    private var tarefaSync: Task<Void, Never>?

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
            if let session = client.auth.currentSession {
                dono = session.user.id.uuidString.lowercased()
                dados = try local.ler(dono!)
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
            dados = ReadData(); atualizadoEm = nil
            await atualizar()
        } catch { erro = "Não deu para entrar. O código pode ter expirado. Confira a conexão e tente de novo." }
    }

    func atualizar() async {
        if let tarefaSync { await tarefaSync.value; return }
        guard let dono, let cliente, let cache, !limpezaPendente else { return }
        let epoch = geracao
        let task = Task { await self.puxar(dono: dono, cliente: cliente, cache: cache, epoch: epoch) }
        tarefaSync = task
        await task.value
        if geracao == epoch { tarefaSync = nil }
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
            var cycle = ReadSync.PullCycle()
            for _ in 0..<200 {
                try conferir(owner, epoch)
                // Refresh only for network work. An expired cached session still opens offline data.
                let session = try await cliente.auth.session
                try conferir(owner, epoch)
                guard session.user.id.uuidString.lowercased() == owner else { throw ReadSync.Failure.accountChanged }
                let since = try cache.cursor(owner).cursor
                let page = try await pull(since: since, token: session.accessToken)
                try conferir(owner, epoch)
                try ReadSync.validate(page, since: since, owner: owner)
                if cycle.shouldRebuild(since: since, horizon: page.horizon) {
                    // Read-only client has no pending writes to preserve. Rebuild after purged tombstones.
                    try cache.apagar(); dados = ReadData(); atualizadoEm = nil
                    continue
                }
                try cache.aplicar(page, dono: owner, since: since)
                dados = try cache.ler(owner)
                atualizadoEm = try cache.cursor(owner).atualizadoEm
                if !page.more { aviso = "Dados atualizados."; return }
            }
            throw ReadSync.Failure.tooManyPages
        } catch {
            guard geracao == epoch, dono == owner else { return }
            aviso = "Não foi possível atualizar. Você pode consultar o que já foi baixado."
            if cliente.auth.currentSession == nil {
                aviso = "Sua sessão expirou. Saia e entre novamente para atualizar. Os dados baixados continuam disponíveis."
            }
        }
    }

    // Fixed-token read RPC, like accountRpc in the PWA. No request can adopt a new account's JWT.
    private func pull(since: Int64, token: String) async throws -> PullPage {
        struct Params: Encodable { let since: Int64; let max_rows = 500 }
        var request = URLRequest(url: Configuracao.supabaseURL.appendingPathComponent("rest/v1/rpc/sync_pull"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue(Configuracao.supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Params(since: since))
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ReadSync.Failure.invalidPage
        }
        return try JSONDecoder().decode(PullPage.self, from: data)
    }

    func sair() async {
        guard !ocupado else { return }
        ocupado = true; limpezaPendente = true; erro = nil
        geracao = UUID(); tarefaSync?.cancel(); tarefaSync = nil
        dono = nil; dados = ReadData(); atualizadoEm = nil; sincronizando = false
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
