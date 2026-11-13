import AnilhaCore
import SwiftUI

struct TreinoView: View {
    let conta: ContaStore
    let sessionID: String
    var focoInicial = true
    var jogoInicial: RestCardGame? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var confirmarApagar = false
    @State private var corrigindo: ReadRow?
    private var session: ReadRow? { conta.dados.active("sessions").first { $0.id == sessionID } }

    var body: some View {
        Group {
            if let session {
                if session.string("status") == "active" {
                    ExecucaoTreino(conta: conta, session: session, focoInicial: focoInicial,
                                   jogoInicial: jogoInicial)
                } else {
                    List {
                        StatusSyncView(conta: conta).listRowBackground(Tema.fundo)
                        if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo) }
                        Section {
                            SeloAnilha(texto: "Treino concluído", icone: "checkmark.circle.fill")
                            Text("Seu treino, registrado").font(.title.bold())
                            Text("Planejado e feito por exercício").font(.subheadline)
                        }.listRowBackground(Tema.superficie)
                        CartaoAnaliseTreino(conta: conta, sessionID: sessionID)
                        ForEach(Workout.items(conta.dados, sessionID)) { item in
                            let exercise = conta.dados.exercises(catalog: conta.catalogo)[item.string("exercise_id") ?? ""]
                            let sets = Workout.sets(conta.dados, item.id).filter { $0.number("completed_at") != nil }
                            Section {
                                Text("Planejado: \(Int(item.number("planned_sets") ?? 0)) séries. Feito: \(sets.filter { $0.string("kind") == "work" }.count).")
                                    .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                                Text("Faixa planejada: \(Int(item.number("target_min") ?? 0)) a \(Int(item.number("target_max") ?? 0)) \(exercise?.string("measure") == "time" ? "segundos" : "repetições")")
                                    .font(.footnote).foregroundStyle(Tema.tintaSuave)
                                if item.string("status") == "skipped" { Text("Exercício pulado") }
                                if let original = item.string("original_exercise_id") {
                                    Text("No lugar de \(conta.dados.exercises(catalog: conta.catalogo)[original]?.string("name") ?? "exercício original")").font(.footnote)
                                }
                                ForEach(sets) { set in
                                    Button { corrigindo = set } label: {
                                        HStack {
                                            Text(resumoSerie(set, lb: conta.dados.active("profiles").first?.string("unit") == "lb"))
                                                .font(.subheadline).monospacedDigit().foregroundStyle(Tema.tinta)
                                            Spacer()
                                            Image(systemName: "pencil").font(.footnote).foregroundStyle(Tema.tintaSuave)
                                        }.frame(minHeight: 44).contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityHint("Corrigir esta série")
                                }
                            } header: {
                                HStack {
                                    DiscoExercicio(grupo: exercise?.string("primary_group"))
                                    Text(exercise?.string("name") ?? "Exercício indisponível").font(.headline).foregroundStyle(Tema.tinta)
                                }.textCase(nil)
                            }.listRowBackground(Tema.superficie)
                        }
                        Section {
                            Button("Apagar treino", systemImage: "trash", role: .destructive) { confirmarApagar = true }
                                .frame(minHeight: 44)
                                .accessibilityHint("Pede confirmação antes de apagar")
                        }.listRowBackground(Tema.superficie)
                        Button("Voltar") { dismiss() }.buttonStyle(.glass)
                    }
                    .sheet(item: $corrigindo) { set in
                        CorrigirSerie(conta: conta, set: set, measure: conta.dados.exercises(catalog: conta.catalogo)[set.string("exercise_id") ?? ""]?.string("measure") ?? "weight_reps")
                    }
                    .confirmationDialog("Apagar este treino?", isPresented: $confirmarApagar, titleVisibility: .visible) {
                        Button("Apagar treino", role: .destructive) { apagar() }
                        Button("Manter treino", role: .cancel) {}
                    } message: {
                        Text("Some do histórico neste iPhone e no site. Os recordes deste treino são recalculados.")
                    }
                    .scrollContentBackground(.hidden).background { FundoAnilha() }
                    .navigationTitle("Treino concluído").navigationBarTitleDisplayMode(.inline)
                    .refreshable { await conta.atualizar() }
                }
            } else { Text("Sessão indisponível. Atualize os dados.") }
        }
    }

    /// Same as Apagar treino on the site: tombstones through the queue, records recomputed.
    private func apagar() {
        let changes = Workout.deleteSession(conta.dados, session: sessionID, catalog: conta.catalogo)
        guard !changes.isEmpty, conta.gravar(changes) else { return }
        dismiss()
        Task { await conta.atualizar() }
    }
}

func relogioTreino(_ seconds: Double) -> String {
    let value = max(0, Int(seconds))
    if value >= 3600 { return String(format: "%d:%02d:%02d", value / 3600, value / 60 % 60, value % 60) }
    return String(format: "%02d:%02d", value / 60, value % 60)
}

func formatarCarga(_ kg: Double, lb: Bool) -> String {
    "\((kg * (lb ? Progression.lbPerKg : 1)).formatted(.number.precision(.fractionLength(0...2)))) \(lb ? "lb" : "kg")"
}
func resumoSerie(_ set: ReadRow, lb: Bool) -> String {
    let value = set.number("seconds") ?? set.number("reps") ?? 0
    let unit = set.number("seconds") != nil ? "s" : "rep"
    let load = set.number("load_kg").map { " com \(formatarCarga($0, lb: lb))" } ?? ""
    return "\(set.string("kind") == "warmup" ? "Aquecimento: " : "")\(Int(value)) \(unit)\(load)"
}
func textoSugestao(_ kind: String) -> String {
    switch kind {
    case "increase": "Carga sugerida maior. Volte ao piso da faixa."
    case "decrease": "Carga sugerida menor após duas sessões abaixo do piso."
    case "confirm": "Repita a carga. Confirme o topo em outra sessão."
    case "reps_first": "Some repetições antes de subir a carga. O próximo salto é grande."
    case "hold_effort": "Repita com mais folga antes de subir."
    case "retrain": "Após a pausa, repita a carga ou reduza um passo."
    case "progress_variation": "Progrida a variação ou adicione carga."
    case "first_time": "Primeira vez: ajuste os valores. Esta sessão vira a base."
    case "hold_below": "Mantenha e tente reencontrar o piso da faixa."
    default: "Mantenha a carga e some repetições até o topo."
    }
}

/// Fix a set of a finished workout, like SetEditSheet on the site: load, reps or seconds and
/// effort, or delete the set. Records and the exercise status are recalculated.
struct CorrigirSerie: View {
    let conta: ContaStore
    let serie: ReadRow
    let measure: String
    @Environment(\.dismiss) private var dismiss
    @State private var carga: Double
    @State private var valor: Int
    @State private var rir: Int
    @State private var confirmarApagar = false
    private var lb: Bool { conta.dados.active("profiles").first?.string("unit") == "lb" }
    private var tempo: Bool { measure == "time" }
    private var trabalho: Bool { serie.string("kind") == "work" }

    init(conta: ContaStore, set serie: ReadRow, measure: String) {
        self.conta = conta; self.serie = serie; self.measure = measure
        let lb = conta.dados.active("profiles").first?.string("unit") == "lb"
        _carga = State(initialValue: (serie.number("load_kg") ?? 0) * (lb ? Progression.lbPerKg : 1))
        _valor = State(initialValue: Int(serie.number(measure == "time" ? "seconds" : "reps") ?? 0))
        _rir = State(initialValue: Int(serie.number("rir") ?? -1))
    }
    var body: some View {
        NavigationStack {
            Form {
                if measure != "reps" && measure != "time" || (serie.number("load_kg") ?? 0) > 0 {
                    Section("Carga") {
                        HStack {
                            TextField("Carga", value: $carga, format: .number.precision(.fractionLength(0...2)))
                                .keyboardType(.decimalPad).monospacedDigit()
                            Text(lb ? "lb" : "kg").foregroundStyle(Tema.tintaSuave)
                        }
                    }
                }
                Section(tempo ? "Segundos" : "Repetições") {
                    Stepper(value: $valor, in: 0...(tempo ? 3600 : 500)) { Text("\(valor)").monospacedDigit() }
                }
                if trabalho {
                    Section("Esforço") {
                        Picker("Repetições na reserva", selection: $rir) {
                            Text("Não informado").tag(-1)
                            ForEach(0...5, id: \.self) { Text("\($0)").tag($0) }
                        }
                    }
                }
                Section {
                    Button("Apagar série", role: .destructive) { confirmarApagar = true }.frame(minHeight: 44)
                } footer: { Text("Os recordes deste exercício são recalculados.") }
            }
            .navigationTitle("Corrigir série").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Salvar") { salvar() }.disabled(carga < 0) }
            }
            .confirmationDialog("Apagar esta série?", isPresented: $confirmarApagar, titleVisibility: .visible) {
                Button("Apagar série", role: .destructive) { gravar(nil) }
                Button("Manter", role: .cancel) {}
            }
        }
    }
    private func salvar() {
        var values: [String: JSONValue] = [tempo ? "seconds" : "reps": .number(Double(valor))]
        if serie.number("load_kg") != nil || carga > 0 {
            values["load_kg"] = .number(Progression.round(carga / (lb ? Progression.lbPerKg : 1) * 100) / 100)
        }
        if trabalho { values["rir"] = rir < 0 ? .null : .number(Double(rir)) }
        gravar(values)
    }
    private func gravar(_ values: [String: JSONValue]?) {
        let changes = Workout.editFinishedSet(conta.dados, set: serie.id, values: values, catalog: conta.catalogo)
        guard !changes.isEmpty, conta.gravar(changes) else { return }
        dismiss()
        Task { await conta.atualizar() }
    }
}
