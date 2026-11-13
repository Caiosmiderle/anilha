import AnilhaCore
import SwiftUI

/// Conta, treino offline e sincronização com as mesmas RPCs do PWA.
@main
struct AnilhaApp: App {
    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if ModoDemo.solicitado { DemoView(tela: ModoDemo.tela) }
            else { ContaRaiz() }
            #else
            ContaRaiz()
            #endif
        }
    }
}

private struct ContaRaiz: View {
    @State private var conta = ContaStore()
    @State private var linkAberto = false
    @State private var linkFalhou: String?
    @State private var fichaAberta: String?
    @State private var confirmarSaida = false
    @AppStorage(Aparencia.chave) private var aparencia = Aparencia.sistema.rawValue
    @Environment(\.scenePhase) private var fase

    var body: some View {
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
                // Quatro abas, decisão do Caio (app híbrido): Hoje, Plano, Histórico e Você.
                TabView {
                    Tab("Hoje", systemImage: "sun.max") {
                        NavigationStack {
                            TimelineView(.periodic(from: .now, by: 60)) { context in
                                HojeView(conta: conta, today: LocalDay.today(context.date))
                            }
                        }
                    }
                    Tab("Plano", systemImage: "calendar") {
                        NavigationStack {
                            TimelineView(.periodic(from: .now, by: 60)) { context in
                                PlanoView(conta: conta, today: LocalDay.today(context.date))
                            }
                        }
                    }
                    Tab("Histórico", systemImage: "clock.arrow.circlepath") {
                        NavigationStack { HistoricoView(conta: conta) }
                    }
                    Tab("Você", systemImage: "person.crop.circle") {
                        NavigationStack { VoceView(conta: conta, pedirSaida: { confirmarSaida = true }) }
                    }
                }
                .id(conta.dono)
            }
        }
        .tint(Tema.marca)
        .preferredColorScheme(Aparencia(rawValue: aparencia)?.esquema)
        .sheet(item: Binding(get: { conta.sessaoAberta.map { SessaoApresentada(id: $0) } },
                             set: { conta.sessaoAberta = $0?.id })) { session in
            NavigationStack {
                TreinoView(conta: conta, sessionID: session.id)
            }
        }
        .environment(\.locale, Locale(identifier: "pt_BR"))
        .task { await conta.abrir() }
        .onChange(of: fase) { _, fase in
            if fase == .active {
                Task { await conta.atualizar() }
            }
        }
        .sheet(item: Binding(get: { fichaAberta.map { SessaoApresentada(id: $0) } },
                             set: { fichaAberta = $0?.id })) { ficha in
            NavigationStack {
                if let row = conta.dados.routines.first(where: { $0.id == ficha.id }) {
                    FichaView(conta: conta, ficha: row)
                }
            }
        }
        .onOpenURL { url in
            guard url.scheme == "anilha" else { return }
            // Never echo URL parameters: links can contain credentials or personal information.
            abrir(LinkAnilha.ler(url))
        }
        .alert("Link do Anilha recebido", isPresented: $linkAberto) { Button("OK", role: .cancel) {} }
        .alert("Não deu para abrir", isPresented: Binding(get: { linkFalhou != nil }, set: { if !$0 { linkFalhou = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(linkFalhou ?? "") }
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

private struct SessaoApresentada: Identifiable { let id: String }

extension ContaRaiz {
    /// Link do CRUNNING: abre o treino feito ou a ficha, se já estiverem neste iPhone.
    fileprivate func abrir(_ link: LinkAnilha) {
        guard conta.dono != nil else {
            linkFalhou = "Entre na sua conta e toque no link de novo."
            return
        }
        switch link {
        case .treino(let id):
            if conta.dados.active("sessions").contains(where: { $0.id == id }) {
                fichaAberta = nil
                conta.sessaoAberta = id
            } else {
                linkFalhou = "Esse treino ainda não está neste iPhone. Puxe para atualizar no Hoje e toque no link de novo."
            }
        case .ficha(let id):
            if conta.dados.routines.contains(where: { $0.id == id }) {
                conta.sessaoAberta = nil
                fichaAberta = id
            } else {
                linkFalhou = "Essa ficha não está neste iPhone. Puxe para atualizar no Hoje e toque no link de novo."
            }
        case .outro:
            linkAberto = true
        }
    }
}
