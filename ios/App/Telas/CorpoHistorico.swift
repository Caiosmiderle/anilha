import AnilhaCore
import SwiftUI

struct CorpoHistorico: View {
    let conta: ContaStore
    let today: String
    @State private var editing: ReadRow?
    @State private var shown = 12
    private var unit: String { conta.dados.active("profiles").first?.string("unit") ?? "kg" }
    private var logs: [ReadRow] {
        conta.dados.active("body_logs").sorted {
            let a = $0.string("local_date") ?? "", b = $1.string("local_date") ?? ""
            return a == b ? $0.id < $1.id : a > b
        }
    }
    var body: some View {
        Group {
            if !conta.saudePermitida {
                CartaoHistorico(titulo: conta.saudePendente ? "Dados de saúde: falta sua resposta" : "Dados de saúde desligados") {
                    Text("Peso, cintura, dores e articulações que você quer poupar são dados de saúde. Com a sua permissão, o Anilha guarda esses dados para ajustar os treinos e mostrar a sua evolução. Sem ela, essas funções ficam desligadas e o resto funciona igual. Dá para mudar quando quiser em Você, Privacidade.")
                    Button("Permitir dados de saúde") { Task { await conta.permitirSaude() } }
                        .buttonStyle(.glass).disabled(conta.ocupado)
                    if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo) }
                }
            } else { conteudo }
        }
        .sheet(item: $editing) { row in
            if conta.saudePermitida {
                EditorCorpoHistorico(conta: conta, row: row, last: logs.first, today: today, unit: unit)
            }
        }
        .onChange(of: conta.saudePermitida) { _, allowed in if !allowed { editing = nil } }
    }
    private var conteudo: some View {
        let trend = History.bodyTrend(logs, goal: conta.dados.active("profiles").first?.object("onboarding").string("goal"), today: today)
        let latest = trend.object("latest"), weeks = trend.array("weeks")
        return VStack(spacing: 20) {
            Button { editing = ReadRow(fields: ["id": .string("new")]) } label: { Label("Registrar peso e medidas", systemImage: "plus") }
                .buttonStyle(.glass).frame(maxWidth: .infinity, alignment: .leading)
            if logs.isEmpty {
                Text("Pese de manhã, no mesmo horário, uma ou duas vezes por semana. A média da semana vale mais que um dia.").foregroundStyle(Tema.tintaSuave)
            } else {
                if let kg = latest.number("weight_kg") {
                    CartaoHistorico(titulo: "Peso", sub: "Último em \(historicoDia(latest.string("local_date") ?? ""))") {
                        LabeledContent("Último", value: historicoCarga(kg, unit: unit)).font(.title3.bold())
                        if let rate = trend.number("rate_pct_week") {
                            LabeledContent("Ritmo por semana", value: "\(rate > 0 ? "+" : "")\(historicoNumero(rate))%")
                        }
                        if let average = weeks.last?.number("weight_kg") {
                            Text("Média da semana: \(historicoCarga(average, unit: unit))").font(.caption).foregroundStyle(Tema.tintaSuave)
                        }
                        if let advice = trend.string("advice") { Text(advice).padding(12).background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: 12)) }
                        let points = weeks.filter { $0.number("weight_kg") != nil }.suffix(12).map { w in
                            let value = (w.number("weight_kg") ?? 0) * (unit == "lb" ? 2.2046226218 : 1)
                            return ReadRow(fields: ["day": w.fields["week"] ?? .null, "value": .number(floor(value * 2 + 0.5) / 2)])
                        }
                        if points.count >= 2 { GraficoHistorico(main: points, label: "Média da semana", unit: unit) }
                    }
                }
                if !latest.fields.isEmpty, let cm = logs.first(where: { $0.number("waist_cm") != nil })?.number("waist_cm") {
                    CartaoHistorico(titulo: "Cintura") {
                        LabeledContent("Última", value: "\(historicoNumero(cm)) cm").font(.title3.bold())
                        if let change = trend.number("waist_change_cm") {
                            LabeledContent("Nas últimas semanas", value: "\(change > 0 ? "+" : "")\(historicoNumero(change)) cm")
                        }
                    }
                }
                CartaoHistorico(titulo: "Registros", sub: "Toque para corrigir") {
                    ForEach(Array(logs.prefix(shown))) { log in
                        Button { editing = log } label: {
                            HStack {
                                DiscoExercicio(icone: "scalemass")
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(titulo(log)).font(.headline)
                                    Text(historicoDia(log.string("local_date") ?? "")).font(.caption).foregroundStyle(Tema.tintaSuave)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Tema.tintaSuave)
                            }.frame(minHeight: 44)
                        }.buttonStyle(.plain)
                    }
                    if logs.count > shown {
                        Button("Mostrar mais \(min(12, logs.count - shown)) de \(logs.count - shown) anteriores") { shown += 12 }
                    }
                }
            }
        }
    }
    private func titulo(_ log: ReadRow) -> String {
        [log.number("weight_kg").map { historicoCarga($0, unit: unit) }, log.number("waist_cm").map { "cintura \(historicoNumero($0)) cm" }].compactMap { $0 }.joined(separator: " · ")
    }
}

private struct EditorCorpoHistorico: View {
    let conta: ContaStore
    let row: ReadRow
    let today: String
    let unit: String
    @Environment(\.dismiss) private var dismiss
    @State private var weight: String
    @State private var waist: String
    @State private var date: Date
    @State private var error: String?
    private var novo: Bool { row.id == "new" }
    init(conta: ContaStore, row: ReadRow, last: ReadRow?, today: String, unit: String) {
        self.conta = conta; self.row = row; self.today = today; self.unit = unit
        let kg = (row.id == "new" ? last : row)?.number("weight_kg")
        _weight = State(initialValue: kg.map { kg in
            let value = kg * (unit == "lb" ? 2.2046226218 : 1)
            return historicoNumero(floor(value * 2 + 0.5) / 2)
        } ?? "")
        _waist = State(initialValue: row.number("waist_cm").map(historicoNumero) ?? "")
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX")
        _date = State(initialValue: formatter.date(from: row.string("local_date") ?? today) ?? .now)
    }
    var body: some View {
        NavigationStack {
            Form {
                TextField("Peso (\(unit))", text: $weight).keyboardType(.decimalPad)
                TextField("Cintura (cm)", text: $waist).keyboardType(.decimalPad)
                Text("Cintura na altura do umbigo, sem apertar. Pode deixar em branco.").font(.caption).foregroundStyle(Tema.tintaSuave)
                DatePicker("Data", selection: $date, in: ...Date.now, displayedComponents: .date)
                if let error { Text(error).foregroundStyle(Tema.perigo) }
                Button("Salvar") { salvar() }.disabled(!conta.saudePermitida)
                if !novo {
                    Button("Apagar registro", role: .destructive) {
                        if conta.salvarCorpo(row.changing(["deleted": .bool(true)]), today: today) { dismiss() }
                        else { error = conta.erro }
                    }.disabled(!conta.saudePermitida)
                }
            }
            .navigationTitle(novo ? "Peso e medidas" : "Corrigir registro")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
        }
    }
    private func salvar() {
        func number(_ text: String) -> Double? { Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) }
        let w = number(weight), c = number(waist), day = LocalDay.today(date)
        if day > today { error = "Data inválida"; return }
        if (!weight.isEmpty && w == nil) || (!waist.isEmpty && c == nil) { error = "Preencha um número válido"; return }
        if w == nil && c == nil { error = "Preencha o peso ou a cintura"; return }
        let kg = w.map { floor(($0 / (unit == "lb" ? 2.2046226218 : 1)) * 100 + 0.5) / 100 }
        if let kg, kg < 20 || kg > 400 { error = "Peso fora do normal"; return }
        if let c, c < 30 || c > 250 { error = "Cintura fora do normal"; return }
        let value = ReadRow(fields: ["id": .string(novo ? UUID().uuidString.lowercased() : row.id), "deleted": .bool(false),
            "local_date": .string(day), "weight_kg": jsonNumber(kg), "waist_cm": jsonNumber(c), "note": .null])
        if conta.salvarCorpo(value, today: today) { dismiss() } else { error = conta.erro }
    }
}
