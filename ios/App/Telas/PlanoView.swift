import AnilhaCore
import SwiftUI

/// Aba Plano: as fichas e o calendário com força e corrida. O plano da semana e a edição de
/// ficha entram aqui nas próximas entregas; até lá, o site cuida disso.
struct PlanoView: View {
    let conta: ContaStore
    let today: String
    @AppStorage("anilha.planoParte") private var parte = Parte.semana.rawValue

    enum Parte: String, CaseIterable, Identifiable {
        case semana, fichas, calendario
        var id: String { rawValue }
        var nome: String {
            switch self {
            case .semana: "Semana"
            case .fichas: "Fichas"
            case .calendario: "Mês"
            }
        }
    }

    var body: some View {
        Group {
            switch Parte(rawValue: parte) ?? .semana {
            case .semana: SemanaPlanoView(conta: conta, today: today)
            case .fichas: FichasView(conta: conta)
            case .calendario: CalendarioView(conta: conta, today: today)
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("Parte do plano", selection: $parte) {
                    ForEach(Parte.allCases) { p in Text(p.nome).tag(p.rawValue) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 300)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Link(destination: Site.url("/plano")) {
                    Label("Editar no site", systemImage: "safari")
                }
                .accessibilityHint("Abre o plano no site do Anilha")
            }
        }
    }
}

/// Endereços do site do Anilha para o que fica só no site (app híbrido).
enum Site {
    static let base = "https://anilha-eight.vercel.app"
    static func url(_ caminho: String) -> URL { URL(string: base + caminho)! }
}
