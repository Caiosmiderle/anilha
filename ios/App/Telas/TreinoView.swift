import AnilhaCore
import SwiftUI

struct TreinoView: View {
    let conta: ContaStore
    let sessionID: String
    @Environment(\.dismiss) private var dismiss
    @State private var confirmarFim = false
    @State private var trocar: ReadRow?
    @State private var busca = ""
    @State private var avisoNotificacao: String?
    private var session: ReadRow? { conta.dados.active("sessions").first { $0.id == sessionID } }
    private var items: [ReadRow] { Workout.items(conta.dados, sessionID) }
    private var exercises: [String: ReadRow] { conta.dados.exercises(catalog: conta.catalogo) }
    private var allSets: [ReadRow] { conta.dados.active("sets").filter { $0.string("session_id") == sessionID } }
    private var next: ReadRow? { Workout.next(items, sets: allSets) }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                StatusSyncView(conta: conta).listRowBackground(Tema.fundo)
                if let erro = conta.erro { Text(erro).foregroundStyle(.red) }
                if let session {
                    if session.string("status") == "active" {
                        Section {
                            let done = allSets.filter { $0.number("completed_at") != nil }.count
                            ProgressView(value: Double(done), total: Double(max(1, allSets.count)))
                            Text("\(done) de \(allSets.count) séries registradas").font(.subheadline)
                            if let next {
                                Button("Ir para a próxima série") { if let itemID = next.string("item_id") { withAnimation { proxy.scrollTo(itemID, anchor: .top) } } }
                            }
                            Button("Ativar aviso de descanso") {
                                Task { avisoNotificacao = await conta.permitirAvisos() ? "Aviso local ativado para os descansos." : "Aviso desativado. Confira as permissões do iPhone e a preferência de descanso no PWA." }
                            }
                            if let avisoNotificacao { Text(avisoNotificacao).font(.footnote) }
                        }
                        if let end = Workout.restEnd(session) {
                            Section("Descanso") {
                                TimelineView(.periodic(from: .now, by: 1)) { context in
                                    let seconds = max(0, Int(ceil(end / 1000 - context.date.timeIntervalSince1970)))
                                    Text(seconds == 0 ? "Pronto para continuar" : String(format: "%02d:%02d", seconds / 60, seconds % 60))
                                        .font(.system(size: 48, weight: .bold, design: .rounded)).monospacedDigit()
                                        .accessibilityLabel("Descanso: \(seconds) segundos")
                                }
                                HStack {
                                    Button("Mais 30 s") {
                                        _ = conta.gravar([PushChange("sessions", session.changing(["rest_duration_sec": .number(min(900, (session.number("rest_duration_sec") ?? 90) + 30))]))])
                                    }
                                    Spacer()
                                    Button("Pular descanso") { _ = conta.gravar([PushChange("sessions", session.changing(["rest_started_at": .null, "rest_duration_sec": .null]))]) }
                                }.buttonStyle(.bordered)
                            }.listRowBackground(Tema.superficie)
                        }
                    } else {
                        Section("Treino concluído") {
                            Text("Planejado e feito por exercício").font(.headline)
                            Text("Salvo neste iPhone. O estado do envio aparece acima.").font(.footnote)
                        }
                        CartaoAnaliseTreino(conta: conta, sessionID: sessionID)
                    }
                    ForEach(items) { item in
                        let exercise = exercises[item.string("exercise_id") ?? ""]
                        let sets = Workout.sets(conta.dados, item.id)
                        Section {
                            let done = sets.filter { $0.string("kind") == "work" && $0.number("completed_at") != nil }.count
                            Text("Planejado: \(Int(item.number("planned_sets") ?? 0)) séries. Feito: \(done).")
                                .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                            Text("Faixa planejada: \(Int(item.number("target_min") ?? 0)) a \(Int(item.number("target_max") ?? 0)) \(exercise?.string("measure") == "time" ? "segundos" : "repetições")")
                                .font(.footnote).foregroundStyle(Tema.tintaSuave)
                            if item.string("status") == "skipped" { Text("Exercício pulado").foregroundStyle(Tema.tintaSuave) }
                            if let original = item.string("original_exercise_id") {
                                Text("No lugar de \(exercises[original]?.string("name") ?? "exercício original")").font(.footnote)
                            }
                            if session.string("status") == "active", item.string("status") != "skipped" {
                                if let exercise {
                                    let s = Workout.suggestion(conta.dados, exercise: exercise, plan: item, today: session.string("local_date") ?? LocalDay.today(), exclude: sessionID)
                                    Text(textoSugestao(s.kind)).font(.footnote).foregroundStyle(Tema.marcaForte)
                                    if s.kind == "reps_first", let load = s.load_kg {
                                        let unit = conta.dados.active("profiles").first?.string("unit") ?? "kg"
                                        let up = Progression.nextLoad(load, increment: exercise.number("increment_kg") ?? 2.5, unit: unit)
                                        Text("Busque \(Int(Progression.repsBeforeJump(load, up: up, floor: s.target_min))) repetições em todas antes de subir.")
                                            .font(.footnote).foregroundStyle(Tema.marcaForte)
                                    }
                                    if s.missing_effort { Text("Faltou o esforço da última série. Progrida com cautela.").font(.footnote) }
                                    if Workout.returning(conta.dados, today: session.string("local_date") ?? LocalDay.today()) {
                                        Text("Modo retorno: pare cada série com 2 a 3 repetições na reserva.").font(.footnote)
                                    }
                                    ForEach(Array(sets.enumerated()), id: \.element.id) { index, set in
                                        SerieTreinoView(conta: conta, set: set, item: item, exercise: exercise,
                                            anterior: s.last(max(0, index - Int(item.number("warmup_sets") ?? 0))), proxima: next?.id == set.id)
                                    }
                                }
                                Menu("Exercício") {
                                    Button("Trocar exercício") { trocar = item; busca = "" }
                                    Button("Deixar para o fim") { _ = conta.gravar(Workout.move(conta.dados, item: item, end: true)) }
                                    Button("Fazer agora") { _ = conta.gravar(Workout.move(conta.dados, item: item, end: false)) }
                                    Button("Pular exercício", role: .destructive) { _ = conta.gravar(Workout.skip(conta.dados, item: item)) }
                                }
                            } else {
                                ForEach(sets.filter { $0.number("completed_at") != nil }) { set in
                                    Text(resumoSerie(set, lb: conta.dados.active("profiles").first?.string("unit") == "lb"))
                                        .font(.subheadline).monospacedDigit()
                                }
                            }
                        } header: {
                            Text(exercise?.string("name") ?? "Exercício indisponível")
                        }.id(item.id).listRowBackground(Tema.superficie)
                    }
                    if session.string("status") == "active" {
                        Button("Concluir treino") { confirmarFim = true }.buttonStyle(.borderedProminent)
                            .frame(maxWidth: .infinity).listRowBackground(Tema.fundo)
                    } else { Button("Voltar") { dismiss() } }
                } else { Text("Sessão indisponível. Atualize os dados.") }
            }
            .scrollContentBackground(.hidden).background(Tema.fundo)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(session?.string("title") ?? "Treino")
            .refreshable { await conta.atualizar() }
            .confirmationDialog("Concluir e guardar o que foi feito?", isPresented: $confirmarFim, titleVisibility: .visible) {
                Button("Concluir treino") {
                    if let session, conta.concluir(session) {
                        Task { await conta.atualizar() }
                    }
                }
                Button("Continuar treinando", role: .cancel) {}
            } message: { Text("As séries ainda não registradas ficam como não feitas no resumo.") }
            .sheet(item: $trocar) { item in
                NavigationStack {
                    List(exercises.values.filter { !$0.deleted && $0.bool("archived") != true && $0.id != item.string("exercise_id") && (busca.isEmpty || ($0.string("name") ?? "").localizedStandardContains(busca)) }.sorted { ($0.string("name") ?? "") < ($1.string("name") ?? "") }) { exercise in
                        Button(exercise.string("name") ?? "Exercício") {
                            // Resolve current row again; another device may have changed it during the sheet.
                            if let live = items.first(where: { $0.id == item.id }), session?.string("status") == "active" {
                                if conta.gravar(Workout.substitute(conta.dados, item: live, exercise: exercise, catalog: conta.catalogo, today: LocalDay.today())) { trocar = nil }
                            }
                        }
                    }
                    .searchable(text: $busca, prompt: "Buscar exercício")
                    .navigationTitle("Trocar exercício")
                    .toolbar { Button("Cancelar") { trocar = nil } }
                }
            }
        }
    }
}

private struct SerieTreinoView: View {
    let conta: ContaStore
    let set: ReadRow
    let item: ReadRow
    let exercise: ReadRow
    let anterior: ReadRow
    let proxima: Bool
    @State private var draft: ReadRow?
    @State private var erro: String?
    private var lb: Bool { conta.dados.active("profiles").first?.string("unit") == "lb" }
    private var time: Bool { exercise.string("measure") == "time" }
    private var seed: ReadRow { Workout.editorStart(set, itemSets: Workout.sets(conta.dados, item.id), exercise: exercise, unit: lb ? "lb" : "kg") }
    private var weighted: Bool { seed.bool("showLoad") == true }
    private var current: ReadRow { draft ?? set.changing(Workout.editorSave(seed, exercise: exercise, unit: lb ? "lb" : "kg").fields) }
    private func binding(_ key: String, fallback: Double = 0) -> Binding<Double> {
        Binding(get: { current.number(key) ?? fallback }, set: { value in
            var row = current
            row.fields[key] = .number(value)
            draft = row; conta.guardarRascunho(row)
        })
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(set.string("kind") == "warmup" ? "Aquecimento" : "Série") \(Int(set.number("position") ?? 0) + 1)").font(.headline)
                Spacer()
                if proxima { Text("Próxima").font(.caption).foregroundStyle(Tema.marcaForte) }
            }
            if set.number("completed_at") != nil {
                Label(resumoSerie(set, lb: lb), systemImage: "checkmark.circle.fill").foregroundStyle(Tema.marcaForte)
                if set.string("kind") == "work" {
                    Text("Como foi o esforço?").font(.footnote)
                    ViewThatFits(in: .horizontal) {
                        HStack { esforco }
                        VStack(alignment: .leading) { esforco }
                    }
                }
            } else {
                Text("Meta: \(Int(item.number("target_min") ?? 0)) a \(Int(item.number("target_max") ?? 0)) \(time ? "segundos" : "repetições")")
                    .font(.footnote).foregroundStyle(Tema.tintaSuave)
                if let value = anterior.number("value"), set.string("kind") == "work" {
                    Text("Última vez: \(Int(value))\(time ? " s" : " rep")\(anterior.number("load_kg").map { " com \(formatarCarga($0, lb: lb))" } ?? "")")
                        .font(.footnote).foregroundStyle(Tema.tintaSuave)
                }
                if weighted {
                    let load = Binding<Double>(get: { (current.number("load_kg") ?? 0) * (lb ? Progression.lbPerKg : 1) }, set: { binding("load_kg").wrappedValue = $0 / (lb ? Progression.lbPerKg : 1) })
                    let step = lb ? max(2.5, Progression.round((exercise.number("increment_kg") ?? 2.5) * Progression.lbPerKg / 2.5) * 2.5) : exercise.number("increment_kg") ?? 2.5
                    Stepper("Carga: \(formatarCarga(current.number("load_kg") ?? 0, lb: lb))", value: load, in: 0...(1000 * (lb ? Progression.lbPerKg : 1)), step: step)
                    TextField("Digitar carga", value: load, format: .number.precision(.fractionLength(0...2)))
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder).accessibilityLabel("Digitar carga em \(lb ? "libras" : "quilos")")
                }
                Stepper("\(time ? "Segundos" : "Repetições"): \(Int(current.number(time ? "seconds" : "reps") ?? 0))",
                    value: binding(time ? "seconds" : "reps"), in: 0...(time ? 7200 : 500), step: time ? 5 : 1)
                TextField(time ? "Digitar segundos" : "Digitar repetições", value: binding(time ? "seconds" : "reps"), format: .number.precision(.fractionLength(0)))
                    .keyboardType(.numberPad).textFieldStyle(.roundedBorder).accessibilityLabel(time ? "Digitar segundos" : "Digitar repetições")
                Button("Registrar série", systemImage: "checkmark") {
                    guard let value = current.number(time ? "seconds" : "reps"), value > 0,
                          value <= (time ? 7200 : 500), value == floor(value),
                          !weighted || (current.number("load_kg").map { $0 >= 0 && $0 <= 1000 } ?? false) else { erro = "Ajuste a carga e as repetições antes de registrar."; return }
                    var values = ["load_kg", "reps", "seconds"].reduce(into: [String: JSONValue]()) { $0[$1] = current.fields[$1] ?? .null }
                    if let kg = current.number("load_kg") { values["load_kg"] = .number(Progression.round(kg * 100) / 100) }
                    let changes = Workout.complete(conta.dados, set: set.changing(values), now: Date.now.timeIntervalSince1970 * 1000)
                    if !changes.isEmpty, conta.gravar(changes) { draft = nil; erro = nil }
                }.buttonStyle(.borderedProminent).controlSize(.large)
                if let erro { Text(erro).font(.footnote).foregroundStyle(.red) }
            }
        }
        .padding(.vertical, 8)
        .task(id: set.id) { draft = conta.rascunhoSalvo(set.id) }
    }
    @ViewBuilder private var esforco: some View {
        ForEach(["Fácil", "Ok", "Pesado", "No limite"].indices, id: \.self) { index in
            Button(["Fácil", "Ok", "Pesado", "No limite"][index]) {
                _ = conta.gravar([PushChange("sets", set.changing(["rir": .number(Double(3 - index))]))])
            }.buttonStyle(.bordered).tint(set.number("rir") == Double(3 - index) ? Tema.marca : Tema.tintaSuave)
        }
    }
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
private func textoSugestao(_ kind: String) -> String {
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
