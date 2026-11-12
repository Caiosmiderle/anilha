import AnilhaCore
import SwiftUI

/// Conta, treino offline e sincronização com as mesmas RPCs do PWA.
@main
struct AnilhaApp: App {
    @State private var conta = ContaStore()
    @State private var linkAberto = false
    @State private var confirmarSaida = false
    @Environment(\.scenePhase) private var fase

    var body: some Scene {
        WindowGroup {
            Group {
                if conta.carregando {
                    ProgressView("Abrindo o Anilha...")
                } else if conta.limpezaPendente {
                    VStack(spacing: 16) {
                        Text(conta.erro ?? "Limpando os dados deste iPhone...")
                        Button("Tentar sair novamente") { Task { await conta.sair() } }.disabled(conta.ocupado)
                    }.padding()
                } else if conta.falhaAbertura {
                    VStack(spacing: 16) {
                        Text(conta.erro ?? "Não foi possível abrir o app.")
                        Button("Tentar novamente") { Task { await conta.tentarAbrir() } }
                    }.padding()
                } else if conta.dono == nil {
                    NavigationStack { EntrarView(conta: conta) }
                } else {
                    TabView {
                        NavigationStack {
                            TimelineView(.periodic(from: .now, by: 60)) { context in
                                HojeView(conta: conta, today: LocalDay.today(context.date))
                            }
                            .toolbar { menuConta }
                        }
                            .tabItem { Label("Hoje", systemImage: "calendar") }
                        NavigationStack { FichasView(conta: conta).toolbar { menuConta } }
                            .tabItem { Label("Fichas", systemImage: "list.bullet.rectangle") }
                        NavigationStack { HistoricoView(conta: conta).toolbar { menuConta } }
                            .tabItem { Label("Histórico", systemImage: "clock") }
                    }
                    .id(conta.dono)
                }
            }
            .tint(Tema.marca)
            .sheet(item: Binding(get: { conta.sessaoAberta.map { SessaoApresentada(id: $0) } },
                                 set: { conta.sessaoAberta = $0?.id })) { session in
                NavigationStack {
                    TreinoView(conta: conta, sessionID: session.id)
                        .toolbar { Button("Minimizar") { conta.sessaoAberta = nil } }
                }
            }
            .foregroundStyle(Tema.tinta)
            .task { await conta.abrir() }
            .onChange(of: fase) { _, fase in
                if fase == .active {
                    Task { await conta.atualizar() }
                }
            }
            .onOpenURL { url in
                guard url.scheme == "anilha" else { return }
                // Never echo URL parameters: links can contain credentials or personal information.
                linkAberto = true
            }
            .alert("Link do Anilha recebido", isPresented: $linkAberto) { Button("OK", role: .cancel) {} }
            .confirmationDialog("Sair e apagar os dados baixados deste iPhone?", isPresented: $confirmarSaida,
                                titleVisibility: .visible) {
                Button("Sair e apagar dados locais", role: .destructive) { Task { await conta.sair() } }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text(conta.pendentes + conta.rejeitadas > 0
                    ? "Há \(conta.pendentes + conta.rejeitadas) alterações que ainda não foram salvas na conta. Sair apaga esse treino deste iPhone. Cancele e puxe para atualizar antes de sair."
                    : "O cache deste iPhone será apagado. Seus dados já enviados continuam na conta.")
            }
        }
    }

    @ToolbarContentBuilder private var menuConta: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                NavigationLink("Sobre o app") { SobreView() }
                Button("Sair da conta", role: .destructive) { confirmarSaida = true }.disabled(conta.ocupado)
            } label: { Label("Conta", systemImage: "person.crop.circle") }
        }
    }
}

private struct SessaoApresentada: Identifiable { let id: String }
