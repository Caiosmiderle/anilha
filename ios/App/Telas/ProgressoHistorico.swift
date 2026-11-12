import AnilhaCore
import Charts
import SwiftUI

struct CartaoHistorico<Content: View>: View {
    let titulo: String
    var sub: String? = nil
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(titulo).font(.headline).accessibilityAddTraits(.isHeader)
            if let sub { Text(sub).font(.caption).foregroundStyle(Tema.tintaSuave) }
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20).cartao()
    }
}

struct EstadoSemana: View {
    let report: ReadRow
    private var status: String { report.string("status") ?? "sem_plano" }
    private var titulo: String {
        ["cumprida": "Plano cumprido", "desvio": "Desvio do plano", "parcial": "Parcial", "em_andamento": "Em andamento", "sem_plano": "Sem plano"][status] ?? "Sem plano"
    }
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(status == "cumprida" ? Tema.verdeAgua : status == "desvio" ? Tema.laranja : status == "em_andamento" ? Tema.marca : Tema.tintaSuave).frame(width: 6, height: 6)
            Text(titulo).font(.caption).foregroundStyle(Tema.tintaSuave)
        }.accessibilityElement(children: .combine)
    }
}

struct SemanasHistorico: View {
    let conta: ContaStore
    let today: String
    var body: some View {
        let reports = History.weeks(conta.dados, today: today)
        VStack(spacing: 0) {
            ForEach(reports.indices, id: \.self) { index in
                let r = reports[index]
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        Text("\(historicoDia(r.string("week_start") ?? "")) a \(historicoDia(r.string("week_end") ?? ""))").font(.headline)
                        Spacer()
                        EstadoSemana(report: r)
                    }
                    let pg = Int(r.number("planned_gym") ?? 0), pr = Int(r.number("planned_run") ?? 0)
                    let run = Int(r.number("done_run") ?? 0), rest = Int(r.number("rest_days") ?? 0)
                    Text("Academia \(Int(r.number("done_gym") ?? 0)) de \(pg) · \(r.string("cardio") ?? "Corrida") \(pr > 0 ? "\(run) de \(pr)" : "\(run)") · \(rest) \(rest == 1 ? "dia" : "dias") de descanso")
                        .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                    if pg + pr > 0 {
                        let pct = r.number("pct") ?? 0
                        HStack {
                            ProgressView(value: pct).tint(Tema.marca).accessibilityLabel("Plano cumprido")
                            Text("\(Int(floor(pct * 100 + 0.5)))%").font(.caption).monospacedDigit()
                        }
                    }
                }.padding(16)
                Divider()
            }
        }.cartao()
    }
}

struct LinhaGraficoHistorico: Identifiable {
    let id: Int
    let day: String
    let value: Double
}
struct GraficoHistorico: View {
    let main: [ReadRow]
    var compare: [ReadRow] = []
    let label: String
    let unit: String
    private func points(_ rows: [ReadRow]) -> [LinhaGraficoHistorico] {
        rows.enumerated().compactMap { i, r in
            guard let value = r.number("value"), let day = r.string("day") else { return nil }
            return LinhaGraficoHistorico(id: i, day: day, value: value)
        }
    }
    var body: some View {
        Chart {
            ForEach(points(main)) { p in
                LineMark(x: .value("Data", p.day), y: .value(unit, p.value), series: .value("Série", label))
                    .foregroundStyle(Tema.marca)
                PointMark(x: .value("Data", p.day), y: .value(unit, p.value)).foregroundStyle(Tema.marca)
                    .accessibilityLabel("\(historicoDia(p.day)), \(label)").accessibilityValue("\(historicoNumero(p.value)) \(unit)")
            }
            if compare.count > 1 {
                ForEach(points(compare)) { p in
                    LineMark(x: .value("Data", p.day), y: .value(unit, p.value), series: .value("Série", "1RM est."))
                        .foregroundStyle(Tema.tintaSuave).lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
                }
            }
        }.chartXAxis {
            AxisMarks { value in
                AxisValueLabel { if let day = value.as(String.self) { Text(historicoDia(day)) } }
            }
        }.frame(height: 180)
        Text("\(label) (\(unit))").font(.caption).foregroundStyle(Tema.tintaSuave)
    }
}

struct ProgressoHistorico: View {
    let conta: ContaStore
    let today: String
    @State private var escolhido = ""
    private var unit: String { conta.dados.active("profiles").first?.string("unit") ?? "kg" }
    var body: some View {
        let options = History.exercises(conta.dados, catalog: conta.catalogo)
        let exercise = options.first { $0.id == escolhido } ?? options.first
        VStack(spacing: 20) {
            if let exercise {
                exercicio(exercise, options: options)
            } else {
                CartaoHistorico(titulo: "Progresso por exercício") { Text("Registre séries para ver a evolução.").foregroundStyle(Tema.tintaSuave) }
            }
            volume
            recordes
        }
    }
    private func exercicio(_ exercise: ReadRow, options: [ReadRow]) -> some View {
        let result = History.progress(conta.dados, exercise: exercise, unit: unit)
        let main = result.array("main"), loaded = result.bool("loaded") == true, timed = exercise.string("measure") == "time"
        let n = Int(result.number("count") ?? 0)
        return CartaoHistorico(titulo: exercise.string("name") ?? "Exercício", sub: "\(n) \(n == 1 ? "sessão" : "sessões")") {
            Picker("Exercício", selection: Binding(get: { exercise.id }, set: { escolhido = $0 })) {
                ForEach(options) { Text($0.string("name") ?? "Exercício").tag($0.id) }
            }.pickerStyle(.menu)
            if main.count < 2 {
                Text(main.isEmpty ? "Sem séries de trabalho registradas." : "Uma sessão até agora. O gráfico aparece a partir da segunda.").foregroundStyle(Tema.tintaSuave)
            } else {
                GraficoHistorico(main: main, compare: result.array("compare"), label: timed ? "Melhor tempo" : loaded ? "Carga máxima" : "Repetições máximas", unit: timed ? "s" : loaded ? unit : "reps")
            }
            if loaded {
                if let kg = result.number("max_load"), kg > 0 { LabeledContent("Carga máxima", value: historicoCarga(kg, unit: unit)) }
                if let kg = result.number("last1rm"), kg > 0 { LabeledContent("1RM estimado (última)", value: historicoCarga(kg, unit: unit)) }
                if let kg = result.number("last_volume") { LabeledContent("Volume da última", value: historicoCarga(kg, unit: unit)) }
            }
            if let day = result.string("last_date") { LabeledContent("Última vez", value: historicoDia(day)) }
            if loaded && main.count >= 2 {
                Text("Linha azul: carga máxima. Tracejada: 1RM estimado (Epley, até 12 repetições).").font(.caption).foregroundStyle(Tema.tintaSuave)
            }
        }
    }
    private var volume: some View {
        let rows = History.weeklyGroupSets(conta.dados, catalog: conta.catalogo, today: today)
        let returning = Workout.returning(conta.dados, today: today)
        return CartaoHistorico(titulo: "Séries por grupo nesta semana", sub: returning ? "Modo retorno: limite de 10 por grupo" : "Só séries de trabalho") {
            if rows.isEmpty { Text("Nenhuma série de trabalho nesta semana.").foregroundStyle(Tema.tintaSuave) }
            else {
                Chart {
                    ForEach(rows.indices, id: \.self) { index in
                        let r = rows[index]
                        BarMark(x: .value("Séries", r.number("value") ?? 0), y: .value("Grupo", History.groupLabel(r.string("group") ?? "")))
                            .foregroundStyle(Tema.marca)
                            .annotation(position: .trailing) { Text("\(Int(r.number("value") ?? 0))").font(.caption) }
                    }
                    if returning { RuleMark(x: .value("Limite", 10)).foregroundStyle(Tema.tintaSuave).lineStyle(StrokeStyle(dash: [4, 4])) }
                }.frame(height: CGFloat(max(1, rows.count)) * 38 + 24)
                if returning { Text("Linha tracejada: 10 séries").font(.caption).foregroundStyle(Tema.tintaSuave) }
            }
        }
    }
    private var recordes: some View {
        let records = conta.dados.active("records").sorted {
            let a = $0.string("local_date") ?? "", b = $1.string("local_date") ?? ""
            return a == b ? $0.id < $1.id : a > b
        }
        return CartaoHistorico(titulo: "Recordes") {
            if records.isEmpty { Text("Nenhum recorde ainda. A primeira sessão de cada exercício é a base.").foregroundStyle(Tema.tintaSuave) }
            else {
                ForEach(Array(records.prefix(12))) { r in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(r.string("exercise_name") ?? "Exercício")
                            let kind = r.string("kind") ?? ""
                            Text("\(["e1rm": "1RM estimado", "carga": "Carga", "marco": "Marco"][kind] ?? kind.capitalized) em \(historicoDia(r.string("local_date") ?? ""))").font(.caption).foregroundStyle(Tema.tintaSuave)
                        }
                        Spacer()
                        let value = r.number("value") ?? 0, recordUnit = r.string("unit") ?? ""
                        Text(recordUnit == "kg" ? historicoCarga(value, unit: unit) : "\(historicoNumero(value)) \(recordUnit == "km" ? "km" : recordUnit == "s" ? "s" : "reps")").bold().monospacedDigit()
                    }
                }
            }
        }
    }
}
