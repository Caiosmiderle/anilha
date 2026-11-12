import AnilhaCore
import SwiftUI

/// Etapa 3A: conta e consulta offline. Nenhuma escrita de treino no servidor.
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
