import AnilhaCore
import SwiftUI

/// Trocar exercício no treino, como no site: até 6 substitutos do mesmo grupo, cada um com o
/// motivo, e o grupo inteiro só em "Ver todos". A busca procura no catálogo todo.
struct TrocaExercicioView: View {
    let conta: ContaStore
    let atual: ReadRow
    /// Exercícios que já estão no treino; o atual sempre fica de fora.
    let noTreino: [String]
    let escolher: (ReadRow) -> Void
    let cancelar: () -> Void
    @State private var busca = ""
    @State private var grupoTodo = false

    private static let rotulo = ["costas": "Costas", "peito": "Peito", "pernas": "Pernas", "ombros": "Ombros",
                                 "bracos": "Braços", "core": "Abdômen"]

    private var biblioteca: [ReadRow] {
        Array(conta.dados.exercises(catalog: conta.catalogo).values).filter { !$0.deleted && $0.bool("archived") != true }
    }
    private var sugestoes: [Substitutes.Suggestion] {
        let onboarding = conta.dados.active("profiles").first?.object("onboarding")
        return Substitutes.suggest(atual, library: biblioteca, catalog: conta.catalogo,
                                   excludeIds: noTreino, available: onboarding.flatMap { lista($0, "equipment") },
                                   spareJoints: conta.saudePermitida ? onboarding.flatMap { lista($0, "spare_joints") } : nil,
                                   level: onboarding?.string("level"))
    }
    private var outros: [ReadRow] {
        let fora = Set(noTreino + [atual.id]), grupo = atual.string("primary_group")
        return biblioteca.filter { e in
            !fora.contains(e.id) && (busca.isEmpty ? e.string("primary_group") == grupo
                                     : (e.string("name") ?? "").localizedStandardContains(busca))
        }.sorted { ($0.string("name") ?? "").localizedCompare($1.string("name") ?? "") == .orderedAscending }
    }

    var body: some View {
        List {
            if busca.isEmpty && !grupoTodo {
                Section {
                    let lista = sugestoes
                    if lista.isEmpty {
                        Text("Nenhum substituto do mesmo grupo. Veja todos ou busque pelo nome.").foregroundStyle(Tema.tintaSuave)
                    }
                    ForEach(lista, id: \.exercise.id) { s in
                        Button { escolher(s.exercise) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.exercise.string("name") ?? "Exercício").foregroundStyle(Tema.tinta)
                                Text(s.reason).font(.footnote).foregroundStyle(Tema.tintaSuave)
                            }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                } header: { Text("No lugar de \(atual.string("name") ?? "exercício")") }
                Section {
                    Button("Ver todos de \((Self.rotulo[atual.string("primary_group") ?? ""] ?? "este grupo").lowercased())") { grupoTodo = true }
                }
            } else {
                Section(busca.isEmpty ? "Todos de \((Self.rotulo[atual.string("primary_group") ?? ""] ?? "este grupo").lowercased())" : "Resultados") {
                    if grupoTodo && busca.isEmpty { Button("Voltar aos sugeridos") { grupoTodo = false } }
                    if outros.isEmpty { Text("Nenhum exercício encontrado.").foregroundStyle(Tema.tintaSuave) }
                    ForEach(outros) { e in
                        Button(e.string("name") ?? "Exercício") { escolher(e) }.foregroundStyle(Tema.tinta)
                    }
                }
            }
        }
        .searchable(text: $busca, prompt: "Buscar em todos os exercícios")
        .navigationTitle("Trocar exercício").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cancelar() } }
        }
    }
    private func lista(_ row: ReadRow, _ key: String) -> [String]? {
        guard case .array(let a) = row.fields[key] else { return nil }
        return a.compactMap { if case .string(let s) = $0 { return s }; return nil }
    }
}
