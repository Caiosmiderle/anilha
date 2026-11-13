import AnilhaCore
import SwiftUI

struct HojeView: View {
    let conta: ContaStore
    var today: String

    private var dataHoje: String {
        let formato = DateFormatter()
        formato.locale = Locale(identifier: "pt_BR")
        formato.dateFormat = "yyyy-MM-dd"
        let data = formato.date(from: today) ?? .now
        formato.dateFormat = "EEEE, d 'de' MMMM"
        return formato.string(from: data)
    }
    private var externos: [ReadRow] {
        conta.dados.active("external_plan_items").filter {
            $0.string("local_date") == today && $0.string("source") == "crunning"
        }
    }
    private var feitos: [HistoryEntry] { HistoryEntry.entries(conta.dados).filter { $0.date == today && $0.concluido } }

    /// Segunda a domingo da semana de hoje, com força e corrida de cada dia (mesma fonte do calendário).
    private var semana: [CalendarDay] {
        let inicio = LocalDay.add(today, -LocalDay.weekday(today))
        let datas = (0..<7).map { LocalDay.add(inicio, $0) }
        var porData: [String: CalendarDay] = [:]
        for mes in Set(datas.map { String($0.prefix(7)) }) {
            for d in TrainingCalendar.days(TrainingCalendarInput(data: conta.dados, month: mes, today: today)) {
                porData[d.date] = d
            }
        }
        return datas.compactMap { porData[$0] }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                CabecalhoAnilha(titulo: Self.saudacao(), selo: dataHoje.prefix(1).uppercased() + dataHoje.dropFirst(), icone: "sun.max.fill")
                    .entradaAnilha(0)
                StatusSyncView(conta: conta)
                if let ativa = conta.ativa {
                    VStack(alignment: .leading, spacing: 12) {
                        SeloAnilha(texto: "Treino em andamento", icone: "dumbbell")
                        Text(ativa.string("title") ?? "Seu treino").font(.largeTitle.bold())
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Text(relogioTreino((context.date.timeIntervalSince1970 * 1000 - (ativa.number("started_at") ?? 0)) / 1000))
                                .font(.title.monospacedDigit()).accessibilityLabel("Tempo de treino")
                        }
                        Button("Continuar treino") { conta.sessaoAberta = ativa.id }
                            .buttonStyle(.principalAnilha).tint(Tema.acao).controlSize(.large)
                    }.padding(Tema.Espaco.e5).frame(maxWidth: .infinity, alignment: .leading).destaqueAnilha()
                }
                CartaoHoje(conta: conta, today: today)
                    .entradaAnilha(1)
                NavigationLink {
                    ChatWalterView(conta: conta)
                } label: {
                    Label("Falar com o Waltér", systemImage: "bubble.left.and.text.bubble.right")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.glass)
                .accessibilityHint("Abre a conversa com o Waltér neste iPhone")
                .entradaAnilha(2)
                NavigationLink {
                    CalendarioView(conta: conta, today: today)
                } label: {
                    cartaoSemana
                }
                .buttonStyle(.plain)
                .accessibilityHint("Abre o calendário com força e corrida")
                .entradaAnilha(3)
                if !externos.isEmpty {
                    Text("Agenda do CRUNNING").font(.headline)
                    ForEach(externos) { row in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(row.string("name") ?? "Corrida \(nomeCorrida(row.string("run_type")))").font(.headline)
                            Text(statusExterno(row.string("status"))).foregroundStyle(Tema.marcaForte)
                            Text(detalheCorrida(row, metros: true)).font(.subheadline).foregroundStyle(Tema.tintaSuave)
                        }
                        .padding(Tema.Espaco.e4).frame(maxWidth: .infinity, alignment: .leading).cartao()
                    }
                }
                Text("Feito hoje").font(.headline)
                if feitos.isEmpty {
                    Text("Nenhum treino registrado hoje.").foregroundStyle(Tema.tintaSuave)
                } else {
                    ForEach(feitos) { entry in
                        if entry.corrida { HistoricoLinha(entry: entry) }
                        else {
                            Button { conta.sessaoAberta = String(entry.id.dropFirst("session:".count)) } label: { HistoricoLinha(entry: entry) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                Text("O treino é salvo neste iPhone durante a execução. Conclua e atualize para enviar à sua conta.")
                    .font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
            .padding(Tema.Espaco.e5)
        }
        .background { FundoAnilha() }
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await conta.atualizar() }
    }

    static func saudacao(_ data: Date = .now) -> String {
        switch Calendar.current.component(.hour, from: data) {
        case 5..<12: "Bom dia"
        case 12..<18: "Boa tarde"
        default: "Boa noite"
        }
    }

    // MARK: Esta semana

    private var cartaoSemana: some View {
        let dias = semana
        let forcaFeita = dias.reduce(0) { $0 + $1.events.filter { $0.kind == "strength" && $0.status == "done" }.count }
        let corridaFeita = dias.reduce(0) { $0 + $1.events.filter { $0.kind == "run" && $0.status == "done" }.count }
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Esta semana").font(.footnote.weight(.semibold)).foregroundStyle(Tema.tintaSuave)
                Spacer()
                Label("Calendário", systemImage: "calendar").font(.footnote.weight(.semibold)).foregroundStyle(Tema.tintaSuave)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Tema.tintaApagada)
            }
            HStack(alignment: .firstTextBaseline) {
                numero("\(forcaFeita)", legenda: forcaFeita == 1 ? "treino de força" : "treinos de força")
                Spacer()
                numero("\(corridaFeita)", legenda: corridaFeita == 1 ? "corrida" : "corridas")
            }
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(dias) { dia in colunaDia(dia) }
            }
        }
        .padding(Tema.Espaco.e5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cartao()
    }

    /// Um dia da faixa: força em azul e corrida em laranja; cheio é feito, vazado é previsto.
    private func colunaDia(_ dia: CalendarDay) -> some View {
        let forca = dia.events.filter { $0.kind == "strength" }
        let corrida = dia.events.filter { $0.kind == "run" }
        let letras = ["S", "T", "Q", "Q", "S", "S", "D"]
        let letra = letras[LocalDay.weekday(dia.date) % 7]
        var rotulo = dataCurta(dia.date)
        if forca.isEmpty && corrida.isEmpty { rotulo += ", nada" }
        for e in forca + corrida {
            rotulo += ", " + (e.kind == "strength" ? "força " : "corrida ") + (e.status == "done" ? "feita" : "prevista")
        }
        return VStack(spacing: 6) {
            // Cheio usa o azul de ação (texto branco AA nos dois modos); vazado, o azul forte.
            marca(forca, cor: Tema.marcaForte, cheio: Tema.acao, icone: "dumbbell")
            marca(corrida, cor: Tema.laranja, cheio: Tema.laranja, icone: "figure.run")
            Text(String(Int(dia.date.suffix(2)) ?? 0))
                .font(.caption2.weight(.semibold)).monospacedDigit()
                .foregroundStyle(dia.today ? Tema.marcaForte : Tema.tinta)
            Text(letra)
                .font(.caption2.weight(dia.today ? .bold : .semibold))
                .foregroundStyle(dia.today ? Tema.marcaForte : Tema.tintaSuave)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(dia.today ? Tema.marcaFundo : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rotulo + (dia.today ? ", hoje" : ""))
    }

    private func marca(_ eventos: [CalendarEvent], cor: Color, cheio: Color, icone: String) -> some View {
        let feito = eventos.contains { $0.status == "done" }
        return Image(systemName: icone)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(feito ? Tema.sobreMarca : cor)
            .frame(width: 24, height: 24)
            .background {
                Circle().fill(feito ? cheio : Color.clear)
                Circle().stroke(cor.opacity(eventos.isEmpty ? 0 : 0.8), lineWidth: 1.5)
            }
            .opacity(eventos.isEmpty ? 0.12 : 1)
    }

    private func numero(_ valor: String, legenda: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(valor).font(.system(.title, design: .rounded, weight: .semibold)).monospacedDigit()
            Text(legenda).font(.caption).foregroundStyle(Tema.tintaSuave)
        }
    }
}

struct StatusSyncView: View {
    let conta: ContaStore
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if conta.sincronizando { ProgressView().accessibilityLabel("Atualizando dados") }
            Text(conta.aviso).font(.footnote)
            if conta.pendentes > 0 { Text("\(conta.pendentes) alterações aguardando envio").font(.caption) }
            if let date = conta.atualizadoEm {
                Text("Última atualização: \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption)
            }
        }
        .foregroundStyle(Tema.tintaSuave).accessibilityElement(children: .combine)
    }
}

func nomeSplit(_ key: String?) -> String {
    Planning.splits.first { $0.id == key }?.name ?? "Treino de força"
}
func nomeCorrida(_ key: String?) -> String {
    switch key {
    case "longo": "longa"
    case "intervalado": "de qualidade"
    case "leve": "leve"
    default: "com tipo não informado"
    }
}
/// Run type in words: the Anilha keys (leve, longo, intervalado) and CRUNNING's own types
/// (facil, longao, limiar...), which arrive as source_type.
func tipoCorrida(_ key: String) -> String {
    [
        "leve": "leve", "longo": "longa", "intervalado": "de qualidade",
        "caminhada": "caminhada", "recuperacao": "recuperação", "facil": "fácil", "longao": "longão",
        "ritmoProva": "ritmo de prova", "limiar": "limiar", "repeticoes": "repetições", "prova": "prova",
    ][key] ?? key
}
func statusExterno(_ key: String?) -> String {
    switch key {
    case "planejada": "Planejado, do CRUNNING"
    case "feita": "Marcado como feito na agenda, do CRUNNING"
    case "perdida": "Não realizado, do CRUNNING"
    default: "Status não informado, do CRUNNING"
    }
}
func detalheCorrida(_ row: ReadRow, metros: Bool = false) -> String {
    var parts: [String] = []
    if let distance = row.number(metros ? "distance_m" : "distance_km") {
        parts.append("\((metros ? distance / 1000 : distance).formatted(.number.precision(.fractionLength(0...2)))) km")
    }
    if let seconds = row.number("duration_sec") {
        parts.append("\((seconds / 60).formatted(.number.precision(.fractionLength(0...1)))) min")
    }
    return parts.isEmpty ? "Distância e duração não informadas" : parts.joined(separator: " · ")
}
