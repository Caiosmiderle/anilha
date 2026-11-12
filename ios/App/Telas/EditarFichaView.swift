import AnilhaCore
import SwiftUI

struct EditarFichaView: View {
    let conta: ContaStore
    @State private var original: ReadRow?
    @State private var antigos: [ReadRow]
    @State private var ficha: ReadRow
    @State private var items: [ReadRow]
    @State private var adicionando = false
    @State private var editando: ReadRow?
    @State private var confirmarApagar = false
    @State private var confirmarSair = false
    @Environment(\.dismiss) private var dismiss

    init(conta: ContaStore, ficha: ReadRow? = nil) {
        self.conta = conta
        _original = State(initialValue: ficha)
        _antigos = State(initialValue: ficha.map { conta.dados.items($0.id) } ?? [])
        _ficha = State(initialValue: ficha ?? RoutineEditing.blank(position: conta.dados.routines.count))
        _items = State(initialValue: ficha.map { conta.dados.items($0.id) } ?? [])
    }
    private var exercicios: [String: ReadRow] { conta.dados.exercises(catalog: conta.catalogo) }
    private var alterada: Bool { original == nil || ficha != original || items != antigos }
    private var nome: Binding<String> {
        Binding(get: { ficha.string("name") ?? "" }, set: { ficha.fields["name"] = .string(String($0.prefix(80))) })
    }
    private var divisao: Binding<String> {
        Binding(get: { ficha.string("split_key") ?? "livre" }, set: { ficha.fields["split_key"] = .string($0) })
    }
    var body: some View {
        List {
            Section {
                TextField("Nome do treino", text: nome).accessibilityLabel("Nome do treino")
                Picker("Tipo de treino", selection: divisao) {
                    ForEach(Planning.splits, id: \.id) { Text($0.name).tag($0.id) }
                }
            } footer: {
                Text("Mudanças valem para os próximos treinos. O primeiro exercício com carga começa com aquecimento.")
            }.listRowBackground(Tema.superficie)
            Section("Exercícios") {
                ForEach(items) { item in
                    Button { editando = item } label: {
                        HStack(spacing: 12) {
                            DiscoExercicio(grupo: exercicios[item.string("exercise_id") ?? ""]?.string("primary_group"))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(exercicios[item.string("exercise_id") ?? ""]?.string("name") ?? "Exercício indisponível").font(.headline)
                                Text("\(Int(item.number("sets") ?? 3)) séries de \(Int(item.number("target_min") ?? 0)) a \(Int(item.number("target_max") ?? 0)) · \(Int(item.number("rest_sec") ?? 0)) s")
                                    .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                                if item.string("superset") != nil { Text("Bi-set").font(.caption).foregroundStyle(Tema.marcaForte) }
                            }
                        }.frame(minHeight: 44)
                    }.buttonStyle(.plain).accessibilityHint("Abre séries, repetições, descanso e nota")
                        .listRowBackground(Tema.superficie)
                }
                .onMove { from, to in
                    items.move(fromOffsets: from, toOffset: to)
                    items = RoutineEditing.unpairBroken(items)
                }
                .onDelete { indices in
                    items.remove(atOffsets: indices)
                    items = RoutineEditing.unpairBroken(items)
                }
                Button { adicionando = true } label: { Label("Adicionar exercício", systemImage: "plus") }
                    .frame(minHeight: 44).listRowBackground(Tema.superficie)
            }
            avisos
            if original != nil {
                Button("Apagar ficha", role: .destructive) { confirmarApagar = true }
                    .frame(minHeight: 44).listRowBackground(Tema.superficie)
            }
            if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo) }
        }
        .scrollContentBackground(.hidden).background { FundoAnilha() }
        .navigationTitle(original == nil ? "Nova ficha" : "Editar ficha").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") { if alterada { confirmarSair = true } else { dismiss() } }
            }
            ToolbarItem(placement: .primaryAction) {
                Button("Salvar") {
                    if conta.salvarFicha(ficha, original: original, antigos: antigos, items: items) { dismiss() }
                }.disabled((ficha.string("name") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            ToolbarItem(placement: .bottomBar) { EditButton().disabled(items.isEmpty) }
        }
        .interactiveDismissDisabled(alterada)
        .confirmationDialog("Descartar alterações?", isPresented: $confirmarSair, titleVisibility: .visible) {
            Button("Descartar", role: .destructive) { dismiss() }
            Button("Continuar editando", role: .cancel) { }
        }
        .alert("Apagar esta ficha?", isPresented: $confirmarApagar) {
            Button("Apagar ficha", role: .destructive) {
                if let original, conta.apagarFicha(original, antigos: antigos) { dismiss() }
            }
            Button("Cancelar", role: .cancel) { }
        } message: { Text("A ficha e seus exercícios serão apagados em todos os aparelhos após sincronizar. Os treinos feitos continuam no histórico.") }
        .sheet(isPresented: $adicionando) {
            NavigationStack {
                ExerciciosView(conta: conta, excluir: Set(items.compactMap { $0.string("exercise_id") }), aoEscolher: { ex in
                    let params = conta.dados.active("profiles").first?.object("onboarding") ?? ReadRow(fields: [:])
                    items.append(RoutineEditing.added(ex, params: params).changing(["id": .string(Workout.id())]))
                    adicionando = false
                })
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fechar") { adicionando = false } } }
            }
        }
        .sheet(item: $editando) { item in
            NavigationStack {
                EditarItemFicha(item: item, exercicio: exercicios[item.string("exercise_id") ?? ""]) { edited in
                    if let index = items.firstIndex(where: { $0.id == item.id }) { items[index] = edited }
                    editando = nil
                } remover: {
                    items.removeAll { $0.id == item.id }
                    items = RoutineEditing.unpairBroken(items)
                    editando = nil
                }
            }
        }
    }
    @ViewBuilder private var avisos: some View {
        if let original, let binding = try? RoutineReview.binding(conta.dados, routineID: original.id, today: LocalDay.today()) {
            let riscos = WorkoutAnalysis.risks(ReadRow(fields: ["slot": .number(0)]),
                binding: binding.changing(["items": .array([.object([:])])]), afterItems: items, afterRoutine: ficha)
            if !riscos.isEmpty {
                Section("Volume da semana") {
                    ForEach(Array(riscos.enumerated()), id: \.offset) { _, risco in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(risco.string("text") ?? "")
                            Text(risco.string("source") ?? "").font(.caption).foregroundStyle(Tema.tintaSuave)
                        }.listRowBackground(Tema.marcaFundo)
                    }
                }
            }
            if original.string("origin") == "plano" {
                Text("Esta ficha é do plano e muda quando você gera um plano novo.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
        }
    }
}

private struct EditarItemFicha: View {
    @State var item: ReadRow
    let exercicio: ReadRow?
    let salvar: (ReadRow) -> Void
    let remover: () -> Void
    @Environment(\.dismiss) private var dismiss
    private var tempo: Bool { exercicio?.string("measure") == "time" }
    private func numero(_ key: String, padrao: Double = 0) -> Binding<Int> {
        Binding(get: { Int(item.number(key) ?? padrao) }, set: { item.fields[key] = .number(Double($0)) })
    }
    var body: some View {
        Form {
            Section {
                Stepper("Séries, \(numero("sets").wrappedValue)", value: numero("sets", padrao: 3), in: 1...10)
                Stepper("Aquecimento, \(numero("warmup_sets").wrappedValue)", value: numero("warmup_sets"), in: 0...3)
                Stepper("Mínimo\(tempo ? " (s)" : " de reps"), \(numero("target_min").wrappedValue)", value: numero("target_min"), in: 1...(tempo ? 600 : 50), step: tempo ? 5 : 1)
                Stepper("Máximo\(tempo ? " (s)" : " de reps"), \(numero("target_max").wrappedValue)", value: numero("target_max"), in: 1...(tempo ? 600 : 50), step: tempo ? 5 : 1)
                Stepper("Descanso (s), \(numero("rest_sec").wrappedValue)", value: numero("rest_sec"), in: 0...300, step: 15)
                TextField("Nota", text: Binding(get: { item.string("note") ?? "" }, set: { item.fields["note"] = $0.isEmpty ? .null : .string($0) }), axis: .vertical)
            }.listRowBackground(Tema.superficie)
            Button("Tirar do treino", role: .destructive, action: remover).frame(minHeight: 44)
        }
        .scrollContentBackground(.hidden).background { FundoAnilha() }
        .navigationTitle(exercicio?.string("name") ?? "Exercício").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("Salvar exercício") { salvar(item) } }
        }
    }
}
