import AnilhaCore
import SwiftUI

struct EvolucaoTreino: View {
    let conta: ContaStore
    let sessionID: String
    var body: some View {
        Section("Evolução") {
            Text("Hoje e última vez em qualquer ficha. RIR indica repetições na reserva. Recordes e comparações usam séries de trabalho.")
                .font(.footnote).foregroundStyle(Tema.tintaSuave)
            ForEach(Array(WorkoutEvolution.build(conta.dados, sessionID: sessionID, catalog: conta.catalogo).enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 12) {
                    Text(row.string("exercise") ?? "Exercício").font(.title3.bold())
                    if row.bool("load_record") == true {
                        SeloAnilha(texto: "Recorde pessoal de carga · \(formatarCarga(row.number("max_load") ?? 0, lb: false))", icone: "trophy")
                    }
                    ForEach(Array(row.array("reps_records").enumerated()), id: \.offset) { _, record in
                        SeloAnilha(texto: "Recorde pessoal de repetições · \(resumoSerie(record, lb: false))", icone: "trophy")
                    }
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: 16) { comparacao(row) }
                        VStack(alignment: .leading, spacing: 12) { comparacao(row) }
                    }
                    Divider()
                    metrica("Carga máx", atual: row.number("max_load"), unidade: "kg", delta: row.number("max_load_delta"))
                    ForEach(Array(row.array("same_load").enumerated()), id: \.offset) { _, same in
                        let timed = row.array("today").contains { $0.number("seconds") != nil }
                        let load = same.number("load_kg").map { formatarCarga($0, lb: false) } ?? "peso corporal"
                        metrica("Melhor série com \(load)", atual: nil, unidade: timed ? "s" : "rep", delta: same.number("delta"))
                    }
                    if row.array("same_load").isEmpty {
                        Text("Mesma carga · sem comparação").font(.caption).foregroundStyle(Tema.tintaSuave)
                    }
                    metrica("Volume", atual: row.number("volume"), unidade: "kg x rep", delta: row.number("volume_delta"))
                }.padding(.vertical, 10)
            }
        }.listRowBackground(Tema.superficie)
    }
    @ViewBuilder private func comparacao(_ row: ReadRow) -> some View {
        column("Hoje", sets: row.array("today"))
        column(row.number("days_ago").map { "Última vez há \(Int($0)) dias" } ?? "Primeira vez", sets: row.array("previous"))
    }
    private func column(_ title: String, sets: [ReadRow]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.bold())
            if sets.isEmpty { Text("Sem série").font(.footnote) }
            ForEach(Array(sets.enumerated()), id: \.offset) { _, set in
                VStack(alignment: .leading, spacing: 2) {
                    Text(resumoSerie(set, lb: false)).font(.subheadline).monospacedDigit()
                    Text(set.number("rir").map { "RIR \(Int($0))" } ?? "Esforço sem registro")
                        .font(.caption).foregroundStyle(Tema.tintaSuave)
                }.accessibilityElement(children: .combine)
            }
        }.fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
    private func metrica(_ titulo: String, atual: Double?, unidade: String, delta: Double?) -> some View {
        let nome = titulo == "Carga máx" ? "Carga máxima" : titulo
        let unidadeCompleta = ["kg": "quilogramas", "kg x rep": "quilogramas vezes repetições", "rep": "repetições", "s": "segundos"][unidade] ?? unidade
        let valorAtual = atual.map { "\($0.formatted()) \(unidadeCompleta)" } ?? (titulo == "Volume" ? "indisponível" : "")
        let comparacao = delta.map { "\($0 > 0 ? "aumentou" : $0 < 0 ? "diminuiu" : "igual") \(abs($0).formatted()) \(unidadeCompleta)" } ?? "sem comparação"
        return ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) { valor(titulo, atual: atual, unidade: unidade); Spacer(); diferenca(delta, unidade: unidade) }
            VStack(alignment: .leading, spacing: 4) { valor(titulo, atual: atual, unidade: unidade); diferenca(delta, unidade: unidade) }
        }.font(.subheadline).monospacedDigit().accessibilityElement(children: .ignore)
            .accessibilityLabel("\(nome), \(valorAtual), \(comparacao)")
    }
    private func valor(_ titulo: String, atual: Double?, unidade: String) -> some View {
        Text(atual.map { "\(titulo) \($0.formatted()) \(unidade)" } ?? "\(titulo)\(titulo == "Volume" ? " indisponível" : "")")
            .fixedSize(horizontal: false, vertical: true)
    }
    @ViewBuilder private func diferenca(_ value: Double?, unidade: String) -> some View {
        if let value {
            Label("\(value > 0 ? "+" : value < 0 ? "-" : "")\(abs(value).formatted()) \(unidade)",
                  systemImage: value > 0 ? "arrow.up" : value < 0 ? "arrow.down" : "equal")
                .foregroundStyle(value > 0 ? Tema.positivo : value < 0 ? Tema.perigo : Tema.tintaSuave)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("\(value > 0 ? "Aumentou" : value < 0 ? "Diminuiu" : "Igual") \(abs(value).formatted()) \(unidade)")
        } else { Text("Sem comparação").foregroundStyle(Tema.tintaSuave) }
    }
}
