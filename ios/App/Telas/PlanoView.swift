import AnilhaCore
import SwiftUI

/// Aba Plano: semana, fichas, calendário e entrada para gerar um plano novo offline.
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
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink { ExerciciosView(conta: conta) } label: {
                    Label("Exercícios", systemImage: "books.vertical")
                }
                .accessibilityHint("Abre o catálogo de exercícios")
            }
            ToolbarItem(placement: .principal) {
                Picker("Parte do plano", selection: $parte) {
                    ForEach(Parte.allCases) { p in Text(p.nome).tag(p.rawValue) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 300)
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { PlanoNovoView(conta: conta, today: today) } label: {
                    Label("Plano novo", systemImage: "arrow.triangle.2.circlepath")
                }
                .accessibilityHint("Revise as respostas e o plano antes de trocar as fichas")
            }
        }
    }
}

/// Endereços do site do Anilha para o que fica só no site (app híbrido).
enum Site {
    static let base = "https://anilha-eight.vercel.app"
    static func url(_ caminho: String) -> URL { URL(string: base + caminho)! }
}
