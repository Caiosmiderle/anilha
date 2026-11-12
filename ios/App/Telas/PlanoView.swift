import AnilhaCore
import SwiftUI

/// Aba Plano: as fichas e o calendário com força e corrida. O plano da semana e a edição de
/// ficha entram aqui nas próximas entregas; até lá, o site cuida disso.
struct PlanoView: View {
    let conta: ContaStore
    let today: String
    @AppStorage("anilha.planoParte") private var parte = Parte.fichas.rawValue

    enum Parte: String, CaseIterable, Identifiable {
        case fichas, calendario
        var id: String { rawValue }
        var nome: String { self == .fichas ? "Fichas" : "Calendário" }
    }

    var body: some View {
        Group {
            if parte == Parte.calendario.rawValue {
                CalendarioView(conta: conta, today: today)
            } else {
                FichasView(conta: conta)
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("Parte do plano", selection: $parte) {
                    ForEach(Parte.allCases) { p in Text(p.nome).tag(p.rawValue) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 260)
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
