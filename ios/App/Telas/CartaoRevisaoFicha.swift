import AnilhaCore
import SwiftUI

struct CartaoRevisaoFicha: View {
    let conta: ContaStore
    let routineID: String
    private var stored: ReadRow { conta.analises["review:\(routineID)"] ?? ReadRow(fields: [:]) }
    private var saved: ReadRow {
        stored.object("version") == RoutineReview.version(conta.dados, routineID: routineID) ? stored : ReadRow(fields: [:])
    }
    private var reply: ReadRow { saved.object("reply") }
    private var busy: Bool { conta.analisando.contains("review:\(routineID)") }
    private func binding(_ index: Int) -> ReadRow {
        let decisions = saved.array("decisions")
        if decisions.indices.contains(index), !decisions[index].object("binding").fields.isEmpty { return decisions[index].object("binding") }
        var b = (try? RoutineReview.binding(conta.dados, routineID: routineID, today: LocalDay.today())) ?? ReadRow(fields: [:])
        b.fields["items"] = saved.object("binding").fields["items"]
        return b
    }
    var body: some View {
        Section("Revisão da ficha") {
            VStack(alignment: .leading, spacing: 12) {
                Text("A IA revisa o motor. Cada ajuste só vale com sua confirmação. Usa o limite diário do Waltér. Envia ficha, plano, volume e corridas agregadas, sem dados pessoais ou de saúde.")
                    .font(.footnote).foregroundStyle(Tema.tintaSuave)
                if busy { HStack { ProgressView(); Text("Revisando...") } }
                else if let summary = reply.string("resumo") {
                    Text(reply.string("avaliacao") == "boa" ? "Boa ficha" : reply.string("avaliacao") == "ajustavel" ? "Ficha ajustável" : "Vale revisar").font(.headline)
                    Text(summary).font(.subheadline)
                    if case .array(let points) = reply.fields["pontos"] {
                        ForEach(Array(points.enumerated()), id: \.offset) { _, p in
                            if case .string(let s) = p { Text(s).font(.subheadline) }
                        }
                    }
                    ForEach(Array(reply.array("ajustes").enumerated()), id: \.offset) { index, a in adjustment(index, a) }
                    if let usage = WorkoutAnalysis.usage(saved.object("usage")) {
                        Text(rodapeIA(usage))
                            .font(.caption2).foregroundStyle(Tema.tintaSuave)
                    }
                    if conta.revisaoPrecisaGravar(routineID) { Button("Guardar resposta") { Task { await conta.revisarFicha(routineID) } } }
                } else {
                    if stored.string("status") == "requesting" { Text("A tentativa anterior pode ter sido enviada. Repetir pode contar outra chamada no limite diário.").font(.footnote) }
                    Button("Revisar com IA") { Task { await conta.revisarFicha(routineID) } }.buttonStyle(.principalAnilha).disabled(!conta.online || busy)
                }
            }.padding(.vertical, 8).fixedSize(horizontal: false, vertical: true)
        }.listRowBackground(Tema.superficie)
    }
    @ViewBuilder private func adjustment(_ index: Int, _ a: ReadRow) -> some View {
        let b = binding(index)
        let clean = try? RoutineReview.adjustment(saved, index: index)
        let changes = clean.flatMap { try? WorkoutAnalysis.changes($0, binding: b, catalog: conta.catalogo) }
        let decision = saved.array("decisions")[index]
        VStack(alignment: .leading, spacing: 8) {
            Text("Ajuste \(index + 1)").font(.headline)
            Text(a.string("motivo") ?? "").font(.subheadline)
            if let clean, let changes, let slot = clean.number("slot"), b.array("items").indices.contains(Int(slot)) {
                let exercise = b.array("items")[Int(slot)].string("exercise_id")
                if let before = b.array("routineItems").first(where: { $0.string("exercise_id") == exercise }),
                   let after = changes.first(where: { !$0.row.deleted && ($0.row.id == before.id || clean.string("operation") == "trocar" && $0.row.string("exercise_id") == clean.string("replacement")) })?.row {
                    Text("Antes: \(line(before))").font(.subheadline)
                    Text("Depois: \(line(after))").font(.subheadline).foregroundStyle(Tema.marcaForte)
                }
                ForEach(Array(WorkoutAnalysis.risks(clean, binding: b).enumerated()), id: \.offset) { _, r in
                    Text("\(r.string("text") ?? "") Fonte: \(r.string("source") ?? "")").font(.footnote)
                }
            } else { Text("Este ajuste não pode ser aplicado à ficha atual.").font(.footnote) }
            if decision.string("status") == "proposed" {
                HStack {
                    Button("Aplicar") { conta.decidirRevisao(routineID, index: index, action: "apply") }.disabled(changes == nil || conta.revisaoPrecisaGravar(routineID))
                    Button("Recusar") { conta.decidirRevisao(routineID, index: index, action: "refuse") }.disabled(conta.revisaoPrecisaGravar(routineID))
                }.buttonStyle(.glass).controlSize(.large)
            } else if decision.string("status") == "saved" {
                Text("Aplicado.").font(.footnote)
                if decision.fields["undoBefore"] != nil {
                    Button("Voltar ao anterior") { conta.decidirRevisao(routineID, index: index, action: "undo") }.buttonStyle(.glass)
                }
            } else { Text(decision.string("status") == "refused" ? "Recusado." : "Desfeito: voltou como estava.").font(.footnote) }
        }.padding(.vertical, 8)
    }
    private func line(_ row: ReadRow) -> String {
        let name = conta.catalogo.first { $0.id == row.string("exercise_id") }?.string("name") ?? "Exercício personalizado"
        return "\(name): \(Int(row.number("sets") ?? 0)) séries de \(Int(row.number("target_min") ?? 0)) a \(Int(row.number("target_max") ?? 0))"
    }
}
