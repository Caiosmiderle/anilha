import AnilhaCore
import SwiftUI

/// Plano da semana: segunda a domingo com a força prevista ou feita e as corridas do CRUNNING,
/// os avisos do motor e o rodízio de fichas. Mesma fonte do calendário (`TrainingCalendar`),
/// sem regra nova. Plano novo abre o formulário e a prévia nativos.
struct SemanaPlanoView: View {
    let conta: ContaStore
    let today: String
    @State private var semana = 0

    private let nomes = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

    private var inicio: String { LocalDay.add(LocalDay.add(today, -LocalDay.weekday(today)), semana * 7) }

    private var dias: [CalendarDay] {
        let datas = (0..<7).map { LocalDay.add(inicio, $0) }
        var porData: [String: CalendarDay] = [:]
        for mes in Set(datas.map { String($0.prefix(7)) }) {
            for d in TrainingCalendar.days(TrainingCalendarInput(data: conta.dados, month: mes, today: today)) {
                porData[d.date] = d
            }
        }
        return datas.compactMap { porData[$0] }
    }

    private var fichasDoPlano: [ReadRow] {
        conta.dados.routines.filter { $0.string("origin") == "plano" }
    }

    var body: some View {
        let dias = dias
        ScrollView {
            VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                CabecalhoAnilha(titulo: "Semana", selo: tituloSemana, icone: "calendar")
                    .entradaAnilha(0)
                HStack {
                    Button { semana -= 1 } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                        .disabled(semana <= -4).accessibilityLabel("Semana anterior")
                    Spacer()
                    Text(semana == 0 ? "Esta semana" : semana == 1 ? "Próxima semana" : semana < 0 ? "\(-semana) semana\(semana == -1 ? "" : "s") atrás" : "Daqui a \(semana) semanas")
                        .font(.headline)
                    Spacer()
                    Button { semana += 1 } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                        .disabled(semana >= 2).accessibilityLabel("Próxima semana")
                }
                .padding(.horizontal, 4).cartao()
                VStack(spacing: 10) {
                    ForEach(dias) { dia in linhaDia(dia) }
                }
                .entradaAnilha(1)
                if !fichasDoPlano.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Fichas do plano", systemImage: "arrow.triangle.2.circlepath")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Tema.marcaForte)
                        ForEach(fichasDoPlano) { ficha in
                            NavigationLink { FichaView(conta: conta, ficha: ficha) } label: {
                                HStack(spacing: 12) {
                                    DiscoExercicio(grupo: grupoDaDivisao(ficha.string("split_key")))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(ficha.string("name") ?? "Ficha").font(.headline).foregroundStyle(Tema.tintaForte)
                                        Text("\(conta.dados.items(ficha.id).count) exercícios").font(.subheadline).foregroundStyle(Tema.tintaSuave)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(Tema.tintaApagada).accessibilityHidden(true)
                                }
                                .frame(minHeight: 48).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                        Text("Cada dia de academia é a próxima ficha do rodízio. Faltou um dia, o rodízio espera.")
                            .font(.footnote).foregroundStyle(Tema.tintaSuave)
                    }
                    .padding(Tema.Espaco.e5).frame(maxWidth: .infinity, alignment: .leading).cartao()
                    .entradaAnilha(2)
                }
                Text("A força prevista muda com os treinos feitos e as trocas do dia. Para mudar os dias do plano, use Plano novo.")
                    .font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
            .padding(Tema.Espaco.e5)
        }
        .background { FundoAnilha() }
        .refreshable { await conta.atualizar() }
    }

    private var tituloSemana: String {
        let fim = LocalDay.add(inicio, 6)
        return "\(dataCurta(inicio)) a \(dataCurta(fim))"
    }

    private func linhaDia(_ dia: CalendarDay) -> some View {
        let indice = LocalDay.weekday(dia.date) % 7
        return HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Text(String(nomes[indice].prefix(3))).font(.caption.weight(.semibold))
                    .foregroundStyle(dia.today ? Tema.marcaForte : Tema.tintaSuave)
                Text(String(Int(dia.date.suffix(2)) ?? 0)).font(.title3.weight(.bold)).monospacedDigit()
                    .foregroundStyle(dia.today ? Tema.marcaForte : Tema.tintaForte)
            }
            .frame(width: 44)
            VStack(alignment: .leading, spacing: 6) {
                if dia.events.isEmpty {
                    Text("Descanso").font(.body).foregroundStyle(Tema.tintaSuave)
                }
                ForEach(dia.events) { evento in
                    HStack(spacing: 8) {
                        Image(systemName: evento.kind == "strength" ? "dumbbell.fill" : "figure.run")
                            .font(.subheadline)
                            .foregroundStyle(evento.kind == "strength" ? Tema.marcaForte : Tema.laranja)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(evento.title).font(.body.weight(.medium)).foregroundStyle(Tema.tintaForte)
                            Text(detalhe(evento)).font(.caption).foregroundStyle(Tema.tintaSuave)
                        }
                    }
                }
                ForEach(dia.warnings, id: \.self) { aviso in
                    Label(aviso, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(Tema.perigo)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(dia.today ? Tema.marcaFundo : Tema.superficie, in: RoundedRectangle(cornerRadius: Tema.Raio.xl))
        .overlay(RoundedRectangle(cornerRadius: Tema.Raio.xl).strokeBorder(dia.today ? Tema.marcaForte : Tema.linha, lineWidth: dia.today ? 1.5 : 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(nomes[indice]), \(dataCurta(dia.date))\(dia.today ? ", hoje" : "")")
    }

    private func detalhe(_ e: CalendarEvent) -> String {
        let estado = e.status == "done" ? "Feito" : e.status == "missed" ? "Perdido" : "Previsto"
        let tipo = e.runType.map(tipoCorrida)
        let km = e.distanceKm.map { $0.formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "pt_BR"))) + " km" }
        return [estado, tipo, km, e.important ? "Importante" : nil].compactMap { $0 }.joined(separator: " · ")
    }

    private func grupoDaDivisao(_ split: String?) -> String? {
        let pastel = Planning.splits.first { $0.id == split }?.pastel
        return ["sky": "costas", "peach": "peito", "lime": "pernas", "lavender": "ombros", "pink": "bracos"][pastel ?? ""]
    }
}
