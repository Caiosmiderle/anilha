import AnilhaCore
import SwiftUI

struct CartaoAnaliseTreino: View {
    let conta: ContaStore
    let sessionID: String
    var mostrarEvolucao = true
    @State private var editando = false
    @State private var draft = ReadRow(fields: [:])
    @State private var erro: String?
    private var saved: ReadRow { conta.analises["analysis:\(sessionID)"] ?? ReadRow(fields: [:]) }
    private var reply: ReadRow { saved.object("reply") }
    private var adjustment: ReadRow { reply.object("adjustment") }
    private var changes: [PushChange]? { try? WorkoutAnalysis.changes(adjustment, binding: saved.object("binding"), catalog: conta.catalogo) }
    private var busy: Bool { conta.analisando.contains(sessionID) }
    private var state: WorkoutAnalysis.CardState { WorkoutAnalysis.cardState(saved, busy: busy, online: conta.online) }
    private var nextItems: [ReadRow] {
        saved.object("context").array("items").filter { item in
            let hasNext = item.fields["next"] != nil && item.fields["next"] != .null
            return hasNext || reply.array("proximaVez").contains { $0.number("slot") == item.number("slot") }
        }
    }
    private func number(_ key: String, fallback: Double) -> Binding<Double> {
        Binding(get: { draft.number(key) ?? fallback }, set: { draft.fields[key] = .number($0) })
    }
    var body: some View {
        Group {
            if mostrarEvolucao { EvolucaoTreino(conta: conta, sessionID: sessionID) }
            Section("Análise do Waltér") {
                VStack(alignment: .leading, spacing: 12) {
                    if busy { HStack { ProgressView(); Text("Analisando...") } }
                    else if let summary = reply.string("summary") {
                        if let rating = reply.string("avaliacao") {
                            Text(rating == "boa" ? "Boa execução" : rating == "aceitavel" ? "Execução aceitável" : "Abaixo do planejado")
                                .font(.caption.bold()).padding(.horizontal, 10).padding(.vertical, 5)
                                .background((rating == "boa" ? Tema.positivo : rating == "aceitavel" ? Tema.marcaForte : Tema.perigo).opacity(0.15), in: Capsule())
                                .foregroundStyle(rating == "boa" ? Tema.positivo : rating == "aceitavel" ? Tema.marcaForte : Tema.perigo)
                        }
                        Text(summary).font(.subheadline)
                        if case .array(let points) = reply.fields["points"] {
                            ForEach(Array(points.enumerated()), id: \.offset) { _, point in
                                if case .string(let text) = point { Text(text).font(.subheadline).foregroundStyle(Tema.tintaSuave) }
                            }
                        }
                        proximaVez
                        if let changes, let slot = adjustment.number("slot"), Int(slot) < saved.object("binding").array("items").count {
                            Text("O que ajustar").font(.headline)
                            let original = saved.object("binding").array("items")[Int(slot)]
                            let exercise = original.string("original_exercise_id") ?? original.string("exercise_id")
                            if let before = saved.object("binding").array("routineItems").first(where: { $0.string("exercise_id") == exercise }),
                               let after = changes.first(where: { !$0.row.deleted && ($0.row.id == before.id || adjustment.string("operation") == "trocar" && $0.row.string("exercise_id") == adjustment.string("replacement")) })?.row {
                                Text("Antes: \(line(before))").font(.subheadline)
                                Text("Depois: \(line(after))").font(.subheadline).foregroundStyle(Tema.marcaForte)
                            }
                            if state.canDecide {
                                ForEach(Array(WorkoutAnalysis.risks(adjustment, binding: saved.object("binding")).enumerated()), id: \.offset) { _, risk in
                                    Text("\(risk.string("text") ?? "") Fonte: \(risk.string("source") ?? "")").font(.footnote).foregroundStyle(Tema.tintaSuave)
                                }
                                if editando {
                                    if draft.string("operation") == "series" { Stepper("Séries: \(Int(draft.number("sets") ?? 1))", value: number("sets", fallback: 1), in: 1...12) }
                                    if draft.string("operation") == "repeticoes" {
                                        Stepper("Mínimo: \(Int(draft.number("min") ?? 1))", value: number("min", fallback: 1), in: 1...3600)
                                        Stepper("Máximo: \(Int(draft.number("max") ?? 1))", value: number("max", fallback: 1), in: 1...3600)
                                    }
                                    if draft.string("operation") == "trocar" {
                                        Picker("Exercício", selection: Binding(get: { draft.string("replacement") ?? "" }, set: { draft.fields["replacement"] = .string($0) })) {
                                            ForEach(conta.catalogo) { e in Text(e.string("name") ?? "Exercício").tag(e.id) }
                                        }
                                    }
                                    Button("Revisar ajuste") {
                                        guard (try? WorkoutAnalysis.changes(draft, binding: saved.object("binding"), catalog: conta.catalogo)) != nil else { erro = "Parâmetros fora da faixa permitida."; return }
                                        let next = saved.changing(["reply": .object(reply.changing(["adjustment": .object(draft.fields)]).fields)])
                                        if conta.guardarAnalise(next, id: sessionID) { editando = false; erro = nil }
                                    }
                                    Button("Cancelar") { editando = false }
                                } else {
                                    ViewThatFits(in: .horizontal) {
                                        HStack { actions }
                                        VStack(alignment: .leading) { actions }
                                    }.buttonStyle(.glass).controlSize(.large)
                                }
                            }
                        } else if reply.fields["adjustment"] != .null {
                            Text("O ajuste não pode ser aplicado à ficha atual. A análise foi preservada.").font(.footnote)
                        }
                        if saved.string("status") == "saved" {
                            Text("Salvo. O ajuste será usado na próxima vez.")
                            if state.canUndo { Button("Voltar ao anterior") { conta.desfazerAjuste(sessionID) } }
                        }
                        if saved.string("status") == "refused" { Text("Ajuste recusado. A ficha foi preservada.") }
                        if saved.string("status") == "undone" { Text("Desfeito: voltou como estava.") }
                        if conta.analisePrecisaGravar(sessionID) {
                            Button("Guardar análise neste iPhone") { _ = conta.guardarAnalise(saved, id: sessionID) }.font(.footnote)
                        }
                        rodape
                    } else {
                        Text("Conta no limite diário do Waltér.").font(.caption).foregroundStyle(Tema.tintaSuave)
                        Text("Vão só os números do treino, nomes do catálogo e conclusões anteriores do Waltér, sem notas ou dados de saúde.").font(.footnote)
                        if !conta.online { Text("Sem internet. Conecte para analisar.").font(.footnote) }
                        if state.waiting { Text("A análise aguarda conexão. Ela começa sozinha quando a rede voltar.").font(.footnote) }
                        if state.interrupted { Text("A tentativa anterior foi interrompida. Tentar novamente pode contar outra chamada no limite diário.").font(.footnote) }
                        if let error = saved.string("error") { Text(error).font(.footnote).foregroundStyle(Tema.tintaSuave) }
                        Button("Analisar agora") { Task { await conta.analisar(sessionID) } }.buttonStyle(.principalAnilha).tint(Tema.acao).controlSize(.large).disabled(!state.canAnalyze)
                    }
                    if let erro { Text(erro).font(.footnote).foregroundStyle(Tema.perigo) }
                }.padding(.vertical, 8).fixedSize(horizontal: false, vertical: true)
                    .buttonStyle(.glass).controlSize(.large)
            }.listRowBackground(Tema.superficie)
        }
    }
    @ViewBuilder private var actions: some View {
        Button("Aplicar") { conta.salvarAjuste(saved, id: sessionID) }.buttonStyle(.principalAnilha).tint(Tema.acao)
        Button("Ajustar") { draft = adjustment; editando = true }
        Button("Recusar") { _ = conta.guardarAnalise(saved.changing(["status": .string("refused")]), id: sessionID) }
    }
    @ViewBuilder private var proximaVez: some View {
        if reply.fields["proximaVez"] != nil && !nextItems.isEmpty {
            Text("Na próxima vez").font(.headline)
            Text("Prévia da análise, com a ficha e a semana daquele dia. Data e ficha podem mudar os valores.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            ForEach(Array(nextItems.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.string("exercise") ?? "Exercício").font(.subheadline.bold())
                    if item.fields["next"] == nil || item.fields["next"] == .null {
                        Text("Sem previsão do motor.").font(.subheadline)
                    } else {
                        Text(item.object("next").array("sets").map { resumoSerie($0, lb: false) }.joined(separator: " · "))
                            .font(.subheadline).monospacedDigit()
                    }
                    ForEach(Array(reply.array("proximaVez").filter { $0.number("slot") == item.number("slot") }.enumerated()), id: \.offset) { _, comment in
                        if let text = comment.string("comentario"), text.range(of: "\\p{N}", options: .regularExpression) == nil {
                            Text(text).font(.subheadline).foregroundStyle(Tema.tintaSuave)
                        }
                    }
                }
            }
        }
    }
    @ViewBuilder private var rodape: some View {
        if let usage = WorkoutAnalysis.usage(saved.object("usage")) {
            Text(rodapeIA(usage))
                .font(.caption2).foregroundStyle(Tema.tintaSuave)
                .accessibilityLabel("Modelo \(nomeModelo(usage.string("model"))), \(Int(usage.number("input_tokens") ?? 0)) tokens de entrada e \(Int(usage.number("output_tokens") ?? 0)) de saída")
        }
    }
    private func line(_ row: ReadRow) -> String {
        let name = conta.catalogo.first { $0.id == row.string("exercise_id") }?.string("name") ?? "Exercício"
        return "\(name): \(Int(row.number("sets") ?? 0)) séries de \(Int(row.number("target_min") ?? 0)) a \(Int(row.number("target_max") ?? 0))"
    }
}

/// "Opus · US$ 0,012": the model family and the estimated cost, rounded. The exact tokens stay
/// in the accessibility label of the analysis card.
func rodapeIA(_ usage: ReadRow) -> String {
    let nome = nomeModelo(usage.string("model"))
    guard let custo = WorkoutAnalysis.estimatedCost(usage) else { return nome }
    let casas = custo >= 0.01 ? 2 : custo >= 0.001 ? 3 : 4
    return "\(nome) · US$ \(custo.formatted(.number.locale(Locale(identifier: "pt_BR")).precision(.fractionLength(casas))))"
}
func nomeModelo(_ id: String?) -> String {
    let id = id ?? ""
    for (chave, nome) in [("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku")] where id.contains(chave) { return nome }
    return id.isEmpty ? "Modelo" : id
}
