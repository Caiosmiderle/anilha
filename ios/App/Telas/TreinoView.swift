import AnilhaCore
import SwiftUI

struct TreinoView: View {
    let conta: ContaStore
    let sessionID: String
    var focoInicial = true
    var jogoInicial: RestCardGame? = nil
    @Environment(\.dismiss) private var dismiss
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
                                    Text(resumoSerie(set, lb: conta.dados.active("profiles").first?.string("unit") == "lb"))
                                        .font(.subheadline).monospacedDigit()
                                }
                            } header: {
                                HStack {
                                    DiscoExercicio(grupo: exercise?.string("primary_group"))
                                    Text(exercise?.string("name") ?? "Exercício indisponível").font(.headline).foregroundStyle(Tema.tinta)
                                }.textCase(nil)
                            }.listRowBackground(Tema.superficie)
                        }
                        Button("Voltar") { dismiss() }.buttonStyle(.glass)
                    }
                    .scrollContentBackground(.hidden).background { FundoAnilha() }
                    .navigationTitle("Treino concluído").navigationBarTitleDisplayMode(.inline)
                    .refreshable { await conta.atualizar() }
                }
            } else { Text("Sessão indisponível. Atualize os dados.") }
        }
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
