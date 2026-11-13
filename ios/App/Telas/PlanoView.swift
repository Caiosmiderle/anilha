import AnilhaCore
import SwiftUI

/// Aba Plano: semana, fichas, calendário e entrada para gerar um plano novo offline.
struct PlanoView: View {
    let conta: ContaStore
    let today: String
    @AppStorage("anilha.planoParte") private var parte = Parte.semana.rawValue
    @State private var abrirPlanoNovo = false
    @State private var abrirExercicios = false

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
            // Two bare icons (a shelf that looked like a chart, circular arrows that looked like
            // "refresh") became one menu where every option has its name.
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Plano novo", systemImage: "arrow.triangle.2.circlepath") { abrirPlanoNovo = true }
                    Button("Catálogo de exercícios", systemImage: "books.vertical") { abrirExercicios = true }
                } label: {
                    Label("Opções do plano", systemImage: "ellipsis.circle")
                }
            }
        }
        .navigationDestination(isPresented: $abrirPlanoNovo) { PlanoNovoView(conta: conta, today: today) }
        .navigationDestination(isPresented: $abrirExercicios) { ExerciciosView(conta: conta) }
    }
}

/// Endereços do site do Anilha para o que fica só no site (app híbrido).
enum Site {
    static let base = "https://anilha-eight.vercel.app"
    static func url(_ caminho: String) -> URL { URL(string: base + caminho)! }
}
