import AnilhaCore
import SwiftUI
import UIKit

/// Aba Você, no padrão dos Ajustes do CRUNNING: sincronização, preferências deste iPhone, o que
/// continua no site (app híbrido), sobre o app e sair da conta.
struct VoceView: View {
    let conta: ContaStore
    let pedirSaida: () -> Void
    @AppStorage(Aparencia.chave) private var aparencia = Aparencia.sistema.rawValue
    @AppStorage("anilha.jogoDescanso") private var jogo = RestCardGame.blackjack.rawValue

    private var versao: String {
        let info = Bundle.main.infoDictionary ?? [:]
        return "\(info["CFBundleShortVersionString"] as? String ?? "?") (\(info["CFBundleVersion"] as? String ?? "?"))"
    }

    var body: some View {
        List {
            CabecalhoAnilha(titulo: "Você", selo: "Conta e ajustes", icone: "person.crop.circle")
                .listRowBackground(Color.clear).listRowSeparator(.hidden).entradaAnilha(0)

            Section {
                StatusSyncView(conta: conta)
                Button {
                    Task { await conta.atualizar() }
                } label: {
                    Label("Atualizar agora", systemImage: "arrow.triangle.2.circlepath")
                }
                .disabled(conta.sincronizando)
            } header: {
                Text("Sincronização")
            } footer: {
                Text("O treino fica salvo neste iPhone e sobe para a sua conta quando houver internet.")
            }

            Section("Neste iPhone") {
                Picker(selection: $aparencia) {
                    ForEach(Aparencia.allCases) { a in Text(a.nome).tag(a.rawValue) }
                } label: {
                    Label("Aparência", systemImage: "circle.lefthalf.filled")
                }
                Picker(selection: $jogo) {
                    ForEach(RestCardGame.allCases, id: \.rawValue) { g in Text(g.rawValue).tag(g.rawValue) }
                } label: {
                    Label("Jogo do descanso", systemImage: "suit.spade")
                }
                if let ajustes = URL(string: UIApplication.openNotificationSettingsURLString) {
                    Link(destination: ajustes) {
                        Label("Aviso do fim do descanso", systemImage: "bell.badge")
                    }
                }
            }

            Section("Seu treino") {
                NavigationLink {
                    PerfilTreinoView(conta: conta, today: LocalDay.today())
                } label: {
                    Label("Perfil de treino", systemImage: "figure.strengthtraining.traditional")
                }
            }

            Section {
                linkSite("Conexão com o CRUNNING", icone: "link", caminho: "/voce/conexoes/crunning")
                linkSite("Amigos e grupos", icone: "person.2", caminho: "/amigos")
                linkSite("Mensagens", icone: "bubble.left.and.bubble.right", caminho: "/mensagens")
                linkSite("Privacidade", icone: "hand.raised", caminho: "/voce/privacidade")
                linkSite("Seus dados", icone: "tray.and.arrow.down", caminho: "/voce/dados")
                linkSite("Créditos", icone: "info.circle", caminho: "/voce/creditos")
            } header: {
                Text("No site")
            } footer: {
                Text("Estas partes continuam no site do Anilha e abrem no navegador, com a mesma conta.")
            }

            Section {
                NavigationLink {
                    SobreView()
                } label: {
                    LabeledContent {
                        Text(versao).monospacedDigit()
                    } label: {
                        Label("Sobre o app", systemImage: "iphone")
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    pedirSaida()
                } label: {
                    Label("Sair da conta", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .disabled(conta.ocupado)
            } footer: {
                Text("Sair apaga o que foi baixado neste iPhone. O que já foi enviado continua na sua conta.")
            }
        }
        .scrollContentBackground(.hidden)
        .background { FundoAnilha() }
        .navigationTitle("Você").navigationBarTitleDisplayMode(.inline)
        .refreshable { await conta.atualizar() }
    }

    private func linkSite(_ titulo: String, icone: String, caminho: String) -> some View {
        Link(destination: Site.url(caminho)) {
            HStack {
                Label(titulo, systemImage: icone)
                Spacer()
                Image(systemName: "arrow.up.right.square").foregroundStyle(Tema.tintaSuave).accessibilityHidden(true)
            }
        }
        .accessibilityHint("Abre no site do Anilha")
    }
}

/// Claro, escuro ou o do sistema, só neste iPhone.
enum Aparencia: String, CaseIterable, Identifiable {
    case sistema, claro, escuro
    static let chave = "anilha.aparencia"
    var id: String { rawValue }
    var nome: String {
        switch self {
        case .sistema: "Do sistema"
        case .claro: "Claro"
        case .escuro: "Escuro"
        }
    }
    var esquema: ColorScheme? {
        switch self {
        case .sistema: nil
        case .claro: .light
        case .escuro: .dark
        }
    }
}
