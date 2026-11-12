import AnilhaCore
import SwiftUI

struct EvolucaoTreino: View {
    let conta: ContaStore
    let sessionID: String
    var body: some View {
        Section("Evolução") {
            Text("Séries de hoje e última vez em qualquer ficha. RIR é a reserva de repetições. Comparações e recordes usam séries de trabalho.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            ForEach(Array(WorkoutEvolution.build(conta.dados, sessionID: sessionID, catalog: conta.catalogo).enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 10) {
                    Text(row.string("exercise") ?? "Exercício").font(.headline)
                    HStack(alignment: .top) {
                        column("Hoje", sets: row.array("today"))
                        column(row.number("days_ago").map { "Última vez há \(Int($0)) dias" } ?? "Primeira vez", sets: row.array("previous"))
                    }
                    delta("Carga máxima, kg", value: row.number("max_load_delta"))
                    if row.array("same_load").isEmpty { delta("Repetições ou segundos na mesma carga", value: nil) }
                    ForEach(Array(row.array("same_load").enumerated()), id: \.offset) { _, same in
                        let timed = row.array("today").contains { $0.number("seconds") != nil }
                        let load = same.number("load_kg").map { formatarCarga($0, lb: false) } ?? "peso corporal"
                        delta("Melhor série, \(timed ? "segundos" : "repetições") com \(load)", value: same.number("delta"))
                    }
                    delta("Volume de trabalho, kg x rep", value: row.number("volume_delta"))
                    if let volume = row.number("volume") { Text("Hoje \(volume.formatted()) kg x rep.").font(.footnote) }
                    else { Text("Volume indisponível para estas séries.").font(.footnote) }
                    if row.bool("load_record") == true {
                        Text("Recorde pessoal de carga. \(formatarCarga(row.number("max_load") ?? 0, lb: false))").font(.subheadline.bold()).foregroundStyle(Tema.marcaForte)
                    }
                    ForEach(Array(row.array("reps_records").enumerated()), id: \.offset) { _, record in
                        Text("Recorde pessoal de repetições. \(resumoSerie(record, lb: false))").font(.subheadline.bold()).foregroundStyle(Tema.marcaForte)
                    }
                }.padding(.vertical, 8)
            }
        }.listRowBackground(Tema.superficie)
    }
    private func column(_ title: String, sets: [ReadRow]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline.bold())
            if sets.isEmpty { Text("Sem série").font(.footnote) }
            ForEach(Array(sets.enumerated()), id: \.offset) { _, set in
                VStack(alignment: .leading, spacing: 2) {
                    Text(resumoSerie(set, lb: false)).font(.subheadline)
                    Text(set.number("rir").map { "RIR \(Int($0))" } ?? "Esforço sem registro").font(.caption).foregroundStyle(Tema.tintaSuave)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func delta(_ title: String, value: Double?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
            if let value {
                Image(systemName: value > 0 ? "arrow.up" : value < 0 ? "arrow.down" : "equal").accessibilityHidden(true)
                Text("\(value > 0 ? "Aumentou" : value < 0 ? "Diminuiu" : "Igual") \(abs(value).formatted())")
            } else { Text("Sem comparação") }
        }.font(.footnote)
    }
}
