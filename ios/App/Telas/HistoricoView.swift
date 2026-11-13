import AnilhaCore
import SwiftUI

struct HistoryEntry: Identifiable {
    let id: String
    let date: String
    let order: Double
    let title: String
    let detail: String
    let corrida: Bool
    let concluido: Bool
    let grupo: String?
    static func entries(_ data: ReadData) -> [HistoryEntry] {
        let sessions = data.active("sessions").map { row in
            HistoryEntry(id: "session:\(row.id)", date: row.string("local_date") ?? "",
                order: row.number("started_at") ?? 0,
                title: row.string("title") ?? nomeSplit(row.string("split_key")),
                detail: resumoHistorico(row, data: data),
                corrida: false, concluido: row.string("status") == "done",
                grupo: ["sky": "costas", "peach": "peito", "lime": "pernas", "lavender": "ombros", "pink": "bracos"][Planning.splits.first { $0.id == row.string("split_key") }?.pastel ?? ""])
        }
        let runs = data.active("runs").map { row in
            let activity = row.string("activity") ?? "corrida"
            let names = ["bike": "Bike", "natacao": "Natação", "eliptico": "Elíptico", "outro": "Outro cardio"]
            let runNames = ["leve": "leve", "longo": "longa", "intervalado": "de qualidade"]
            let source = row.string("source") == "crunning" ? " do CRUNNING" : ""
            let title = (activity == "corrida" ? "Corrida \(runNames[row.string("run_type") ?? "leve"] ?? "leve")" : names[activity] ?? activity.capitalized) + source
            return HistoryEntry(id: "run:\(row.id)", date: row.string("local_date") ?? "",
                order: 0, title: title,
                detail: resumoCardio(row), corrida: true, concluido: true, grupo: nil)
        }
        return (sessions + runs).sorted {
            if $0.date != $1.date { return $0.date > $1.date }
            if $0.order != $1.order { return $0.order > $1.order }
            if $0.corrida != $1.corrida { return !$0.corrida }
            return $0.id < $1.id
        }
    }
}

struct HistoricoView: View {
    let conta: ContaStore
    let today: String
    @State private var parte: String
    @State private var mes: String
    @State private var dia: String?
    init(conta: ContaStore, parteInicial: String = "Treinos", today: String = LocalDay.today()) {
        self.conta = conta; self.today = today
        _parte = State(initialValue: parteInicial)
        _mes = State(initialValue: String(today.prefix(7)))
    }
    private var entries: [HistoryEntry] { HistoryEntry.entries(conta.dados).filter(\.concluido) }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                CabecalhoAnilha(titulo: "Histórico", selo: "Seus registros", icone: "clock")
                Text("O que foi feito, o que evoluiu e como andam as semanas.").foregroundStyle(Tema.tintaSuave)
                Picker("Seção do histórico", selection: $parte) {
                    ForEach(["Treinos", "Progresso", "Semanas", "Corpo"], id: \.self) { Text($0).tag($0) }
                }.pickerStyle(.segmented)
                StatusSyncView(conta: conta)
                switch parte {
                case "Progresso": ProgressoHistorico(conta: conta, today: today)
                case "Semanas": SemanasHistorico(conta: conta, today: today)
                case "Corpo": CorpoHistorico(conta: conta, today: today)
                default: treinos
                }
            }.padding(20)
        }
        .background { FundoAnilha() }
        .navigationTitle("Histórico").navigationBarTitleDisplayMode(.inline).refreshable { await conta.atualizar() }
    }
    @ViewBuilder private var treinos: some View {
        if entries.isEmpty { Text("Nenhum treino registrado ainda.").foregroundStyle(Tema.tintaSuave) }
        else {
            calendario
            ForEach(Array(Set(entries.map { History.weekStart($0.date) })).sorted(by: >), id: \.self) { week in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Semana de \(historicoDia(week))").font(.headline)
                        Spacer()
                        EstadoSemana(report: History.weekReport(conta.dados, day: week, today: today))
                    }
                    VStack(spacing: 0) {
                        ForEach(entries.filter { History.weekStart($0.date) == week }) { entry in
                            linha(entry)
                            Divider()
                        }
                    }.padding(.horizontal, 16).cartao()
                }
            }
        }
    }
    private var calendario: some View {
        let first = mes + "-01"
        let dates = (0..<31).map { LocalDay.add(first, $0) }.filter { $0.hasPrefix(mes) }
        let active = Set(entries.filter { $0.date.hasPrefix(mes) }.map(\.date)).count
        let months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
        return VStack(spacing: 12) {
            HStack {
                Button { mudarMes(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Mês anterior")
                Spacer()
                VStack {
                    Text("\(months[(Int(mes.suffix(2)) ?? 1) - 1]) de \(mes.prefix(4))").font(.headline)
                    Text(active == 0 ? "Nenhum treino neste mês" : "\(active) \(active == 1 ? "dia com treino" : "dias com treino")").font(.caption).foregroundStyle(Tema.tintaSuave)
                }
                Spacer()
                Button { mudarMes(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("Próximo mês")
                    .disabled(mes == String(today.prefix(7)))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 4) {
                ForEach(["S", "T", "Q", "Q", "S", "S", "D"].indices, id: \.self) { index in
                    Text(["S", "T", "Q", "Q", "S", "S", "D"][index]).font(.caption).accessibilityHidden(true)
                }
                ForEach(0..<LocalDay.weekday(first), id: \.self) { _ in Color.clear.frame(height: 44) }
                ForEach(dates, id: \.self) { date in
                    let rows = entries.filter { $0.date == date }
                    Button { dia = dia == date ? nil : date } label: {
                        VStack(spacing: 3) {
                            Text(String(Int(date.suffix(2)) ?? 0)).font(.subheadline)
                            HStack(spacing: 3) {
                                if rows.contains(where: { !$0.corrida }) { Circle().fill(Tema.marcaForte).frame(width: 5, height: 5) }
                                if rows.contains(where: \.corrida) { Circle().fill(Tema.laranja).frame(width: 5, height: 5) }
                            }.frame(height: 5)
                        }.frame(maxWidth: .infinity, minHeight: 44)
                            .background(dia == date || date == today ? Tema.marcaFundo : Tema.superficie, in: RoundedRectangle(cornerRadius: 8))
                    }.buttonStyle(.plain).accessibilityLabel("\(dataCurta(date)), \(rows.filter { !$0.corrida }.count) de força, \(rows.filter(\.corrida).count) de cardio")
                        .accessibilityAddTraits(dia == date ? .isSelected : [])
                        .disabled(rows.isEmpty || date > today)
                }
            }
            Text("Azul: academia · Laranja: corrida e cardio").font(.caption).foregroundStyle(Tema.tintaSuave)
            if let dia {
                Text(dataCurta(dia)).font(.headline)
                ForEach(entries.filter { $0.date == dia }) { linha($0) }
            }
        }.padding(12).cartao()
    }
    private func mudarMes(_ n: Int) {
        let base = mes + "-01"
        mes = String((n > 0 ? LocalDay.add(base, 32) : LocalDay.add(base, -1)).prefix(7)); dia = nil
    }
    @ViewBuilder private func linha(_ entry: HistoryEntry) -> some View {
        if entry.corrida {
            NavigationLink { DetalheCardioHistorico(entry: entry) } label: { HistoricoLinha(entry: entry) }.buttonStyle(.plain)
        } else {
            Button { conta.sessaoAberta = String(entry.id.dropFirst("session:".count)) } label: { HistoricoLinha(entry: entry) }.buttonStyle(.plain)
        }
    }
}

private struct DetalheCardioHistorico: View {
    let entry: HistoryEntry
    var body: some View {
        ScrollView { HistoricoLinha(entry: entry).padding(20).cartao().padding(20) }
            .background { FundoAnilha() }.navigationTitle(entry.title)
    }
}

func historicoDia(_ day: String) -> String { "\(day.suffix(2))/\(day.dropFirst(5).prefix(2))" }
func historicoNumero(_ value: Double) -> String {
    let n = floor(value * 10 + 0.5) / 10
    return n.formatted(.number.locale(Locale(identifier: "pt_BR")).precision(.fractionLength(0...1)))
}
func historicoCarga(_ kg: Double, unit: String) -> String {
    let value = kg * (unit == "lb" ? 2.2046226218 : 1)
    return "\(historicoNumero(floor(value * 2 + 0.5) / 2)) \(unit)"
}
private func duracaoHistorico(_ seconds: Double) -> String {
    let s = max(0, Int(floor(seconds + 0.5)))
    if s < 60 { return "\(s) s" }
    let h = s / 3600, m = Int(floor(Double(s % 3600) / 60 + 0.5))
    return h == 0 ? "\(m) min" : String(format: "%dh%02d", h, m)
}
private func resumoHistorico(_ row: ReadRow, data: ReadData) -> String {
    if row.string("status") != "done" { return "Treino em andamento" }
    if row.string("detail") == "summary" { return "Registro resumido" }
    let items = data.active("session_items").filter { $0.string("session_id") == row.id }
    let done = items.filter { $0.string("status") == "done" }.count
    let work = data.active("sets").filter { $0.string("session_id") == row.id && $0.string("kind") == "work" && $0.number("completed_at") != nil }.count
    let skipped = items.filter { $0.string("status") == "skipped" }.count
    let time = row.number("ended_at").map { duracaoHistorico(floor(($0 - (row.number("started_at") ?? 0)) / 1000 + 0.5)) + " · " } ?? ""
    return "\(time)\(done) \(done == 1 ? "exercício" : "exercícios") · \(work) \(work == 1 ? "série" : "séries")" + (skipped > 0 ? " · \(skipped) \(skipped == 1 ? "pulado" : "pulados")" : "")
}
private func resumoCardio(_ row: ReadRow) -> String {
    let activity = row.string("activity") ?? "corrida", km = row.number("distance_km") ?? 0, sec = row.number("duration_sec") ?? 0
    var parts: [String] = []
    if km > 0 {
        parts.append(["natacao", "remo"].contains(activity) ? "\(Int(floor(km * 1000 + 0.5)).formatted(.number.locale(Locale(identifier: "pt_BR")))) m" : "\(historicoNumero(km)) km")
    }
    parts.append(duracaoHistorico(sec))
    if km > 0 && sec > 0 {
        if activity == "bike" { parts.append("\(historicoNumero(km / (sec / 3600))) km/h") }
        else if ["corrida", "caminhada", "natacao", "remo"].contains(activity) {
            let pace = Int(floor(sec / (km * (activity == "natacao" ? 10 : activity == "remo" ? 2 : 1)) + 0.5))
            let label = activity == "natacao" ? "100 m" : activity == "remo" ? "500 m" : "km"
            parts.append(String(format: "%d:%02d /%@", pace / 60, pace % 60, label))
        }
    }
    return parts.joined(separator: " · ")
}

struct HistoricoLinha: View {
    let entry: HistoryEntry
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            DiscoExercicio(grupo: entry.grupo, icone: entry.corrida ? "figure.run" : "dumbbell")
            VStack(alignment: .leading, spacing: 5) {
                Text(entry.title).font(.headline)
                Text(dataRegistroHistorico(entry.date)).font(.subheadline).monospacedDigit().foregroundStyle(Tema.tintaSuave)
                Text(entry.detail).font(.subheadline).foregroundStyle(Tema.tintaSuave)
            }
        }
        .padding(.vertical, 10).frame(minHeight: 44).accessibilityElement(children: .combine)
    }
}

private func dataRegistroHistorico(_ day: String) -> String {
    let formato = DateFormatter()
    formato.locale = Locale(identifier: "pt_BR"); formato.dateFormat = "yyyy-MM-dd"
    guard let date = formato.date(from: day) else { return day }
    formato.dateFormat = "EEE, dd/MM"
    return formato.string(from: date)
}

func dataCurta(_ dia: String) -> String {
    if dia == LocalDay.today() { return "hoje" }
    let formato = DateFormatter()
    formato.locale = Locale(identifier: "pt_BR")
    formato.dateFormat = "yyyy-MM-dd"
    guard let data = formato.date(from: dia) else { return dia }
    formato.dateFormat = "EEE, dd/MM"
    return formato.string(from: data)
}
