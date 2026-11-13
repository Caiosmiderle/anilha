import AnilhaCore
import SwiftUI

struct CalendarioView: View {
    let conta: ContaStore
    let today: String
    @State private var month: String
    @State private var picked: String
    @State private var opened: CalendarEvent?
    private let noPlano: Bool
    init(conta: ContaStore, today: String, diaInicial: String? = nil, noPlano: Bool = false) {
        self.noPlano = noPlano
        self.conta = conta
        self.today = today
        _month = State(initialValue: String(today.prefix(7)))
        _picked = State(initialValue: diaInicial ?? today)
    }
    private var days: [CalendarDay] {
        TrainingCalendar.days(TrainingCalendarInput(data: conta.dados, month: month, today: today))
    }
    var body: some View {
        let days = days
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                CabecalhoAnilha(titulo: "Calendário", selo: "Força e corrida", icone: "calendar")
                StatusSyncView(conta: conta)
                VStack(spacing: 12) {
                    HStack {
                        Button { mudarMes(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                            .accessibilityLabel("Mês anterior")
                        Text(tituloMes).font(.headline).frame(maxWidth: .infinity)
                        Button { mudarMes(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                            .accessibilityLabel("Próximo mês")
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 6) {
                        ForEach(Array(["S", "T", "Q", "Q", "S", "S", "D"].enumerated()), id: \.offset) { _, label in
                            Text(label).font(.caption).foregroundStyle(Tema.tintaSuave).accessibilityHidden(true)
                        }
                        ForEach(0..<LocalDay.weekday("\(month)-01"), id: \.self) { _ in Color.clear.frame(height: 1) }
                        ForEach(days) { day in celula(day) }
                    }
                    HStack {
                        Circle().fill(Tema.marcaForte).frame(width: 6, height: 6)
                        Text("Força")
                        Circle().fill(Tema.laranja).frame(width: 6, height: 6)
                        Text("Corrida")
                    }.font(.caption).foregroundStyle(Tema.tintaSuave)
                    Text("Força prevista pelo plano e rodízio. Pode mudar conforme os treinos feitos e as trocas do dia.")
                        .font(.caption).foregroundStyle(Tema.tintaSuave)
                }.padding(12).cartao()
                VStack(alignment: .leading, spacing: 16) {
                    Text(dataCurta(picked)).font(.title3.bold()).accessibilityAddTraits(.isHeader)
                    if let selected = days.first(where: { $0.date == picked }) {
                        ForEach(selected.warnings, id: \.self) { warning in
                            Label(warning, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Tema.tintaSuave)
                        }
                        if selected.events.isEmpty { Text("Nenhum treino neste dia.").foregroundStyle(Tema.tintaSuave) }
                        ForEach(selected.events) { event in linha(event) }
                    }
                }.padding(20).frame(maxWidth: .infinity, alignment: .leading).cartao()
            }.padding(16)
        }
        .background { FundoAnilha() }
        .navigationTitle("Calendário").navigationBarTitleDisplayMode(.inline).semTituloNaBarra(!noPlano)
        .refreshable { await conta.atualizar() }
        .sheet(item: $opened) { event in
            NavigationStack {
                List {
                    Text(event.title).font(.title2.bold())
                    Text(detalheEvento(event))
                    if event.externalID != nil { Text("Planejamento recebido do CRUNNING.").foregroundStyle(Tema.tintaSuave) }
                    if let runID = event.runID, let row = conta.dados.active("runs").first(where: { $0.id == runID }) {
                        Text(detalheCorrida(row))
                    }
                }.scrollContentBackground(.hidden).background { FundoAnilha() }
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fechar") { opened = nil } } }
            }.presentationDragIndicator(.visible)
        }
    }

    private func celula(_ day: CalendarDay) -> some View {
        Button { picked = day.date } label: {
            VStack(spacing: 4) {
                Text(String(Int(day.date.suffix(2)) ?? 1)).font(.subheadline.monospacedDigit())
                HStack(spacing: 3) {
                    if day.events.contains(where: { $0.kind == "strength" }) { Circle().fill(Tema.marcaForte).frame(width: 6, height: 6) }
                    if day.events.contains(where: { $0.kind == "run" }) { Circle().fill(Tema.laranja).frame(width: 6, height: 6) }
                }.frame(height: 6)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(day.today ? Tema.marcaFundo : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(picked == day.date ? Tema.marcaForte : .clear, lineWidth: 2))
        }.buttonStyle(.plain)
            .accessibilityLabel("\(dataCurta(day.date)), \(day.events.count) atividades\(day.today ? ", hoje" : "")")
            .accessibilityValue(day.events.map { $0.kind == "strength" ? "Força" : "Corrida" }.joined(separator: ", "))
            .accessibilityAddTraits(picked == day.date ? .isSelected : [])
    }

    @ViewBuilder private func linha(_ event: CalendarEvent) -> some View {
        if let routineID = event.routineID, event.sessionID == nil,
           let routine = conta.dados.routines.first(where: { $0.id == routineID }) {
            NavigationLink { FichaView(conta: conta, ficha: routine) } label: { rotulo(event) }.buttonStyle(.plain)
        } else {
            Button {
                if let sessionID = event.sessionID { conta.sessaoAberta = sessionID }
                else { opened = event }
            } label: { rotulo(event) }.buttonStyle(.plain)
        }
    }
    private func rotulo(_ event: CalendarEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            DiscoExercicio(grupo: grupo(event.split), icone: event.kind == "strength" ? "dumbbell" : "figure.run")
            VStack(alignment: .leading, spacing: 5) {
                Text(event.title).font(.headline).foregroundStyle(Tema.tintaForte)
                Text(detalheEvento(event)).font(.subheadline).foregroundStyle(Tema.tintaSuave)
            }
        }.frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(Rectangle())
    }
    private func mudarMes(_ delta: Int) {
        let day = LocalDay.add("\(month)-01", delta > 0 ? 32 : -1)
        month = String(day.prefix(7))
        picked = month == String(today.prefix(7)) ? today : "\(month)-01"
    }
    private var tituloMes: String {
        let names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
        let index = Int(month.suffix(2)) ?? 1
        return "\(names[index - 1]) de \(month.prefix(4))"
    }
    private func grupo(_ split: String?) -> String? {
        let pastel = Planning.splits.first { $0.id == split }?.pastel
        return ["sky": "costas", "peach": "peito", "lime": "pernas", "lavender": "ombros", "pink": "bracos"][pastel ?? ""]
    }
}

private func detalheEvento(_ event: CalendarEvent) -> String {
    let state = event.status == "done" ? "Feito" : event.status == "missed" ? "Perdido" : "Previsto"
    let type = event.runType.map(tipoCorrida)
    let distance = event.distanceKm.map { $0.formatted(.number.locale(Locale(identifier: "pt_BR"))) + " km" }
    return [state, type, distance, event.important ? "Importante" : nil].compactMap { $0 }.joined(separator: " · ")
}
