import AnilhaCore
import SwiftUI

struct HojeView: View {
    let conta: ContaStore
    var today: String

    private var dia: DayView? { conta.dados.plannedToday(today) }
    private var ficha: ReadRow? {
        guard let split = dia?.split_key else { return nil }
        return conta.dados.routines.first { $0.string("split_key") == split }
    }
    private var externos: [ReadRow] {
        conta.dados.active("external_plan_items").filter {
            $0.string("local_date") == today && $0.string("source") == "crunning"
        }
    }
    private var feitos: [HistoryEntry] { HistoryEntry.entries(conta.dados).filter { $0.date == today && $0.concluido } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                    .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                StatusSyncView(conta: conta)
                VStack(alignment: .leading, spacing: Tema.Espaco.e3) {
                    Text("Planejado no Anilha").font(.subheadline).foregroundStyle(Tema.tintaSuave)
                    if let dia {
                        if dia.kind == "gym" {
                            Text(ficha?.string("name") ?? nomeSplit(dia.split_key)).font(.title2.bold())
                            if let ficha {
                                NavigationLink {
                                    FichaView(conta: conta, ficha: ficha)
                                } label: { Label("Ver exercícios", systemImage: "list.bullet") }
                                .buttonStyle(.bordered)
                            } else {
                                Text("Esta ficha não está disponível. Confira as fichas no PWA.")
                                    .foregroundStyle(Tema.tintaSuave)
                            }
                        } else if dia.kind == "run" {
                            Label("Corrida \(nomeCorrida(dia.run_type))", systemImage: "figure.run")
                                .font(.title2.bold())
                        } else {
                            Text("Descanso planejado").font(.title2.bold())
                        }
                        if let time = dia.time { Text("Horário: \(time)").font(.subheadline) }
                    } else {
                        Text(conta.sincronizando ? "Buscando seu plano..." : "Nenhum plano disponível.")
                        Text("Crie ou ajuste seu plano no PWA e puxe para atualizar.")
                            .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                    }
                    ComecarIndisponivel()
                }
                .padding(Tema.Espaco.e5).frame(maxWidth: .infinity, alignment: .leading).cartao()
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
                    ForEach(feitos) { entry in HistoricoLinha(entry: entry) }
                }
                Text("Você está consultando seu plano. As sugestões de ajuste e o registro do treino chegam nas próximas etapas.")
                    .font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
            .padding(Tema.Espaco.e5)
        }
        .background(Tema.fundo)
        .navigationTitle("Hoje")
        .refreshable { await conta.atualizar() }
    }
}

struct StatusSyncView: View {
    let conta: ContaStore
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if conta.sincronizando { ProgressView().accessibilityLabel("Atualizando dados") }
            Text(conta.aviso).font(.footnote)
            if let date = conta.atualizadoEm {
                Text("Última atualização: \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption)
            }
        }
        .foregroundStyle(Tema.tintaSuave).accessibilityElement(children: .combine)
    }
}

struct ComecarIndisponivel: View {
    var body: some View {
        VStack(spacing: 6) {
            Button("Começar treino") {}.buttonStyle(.borderedProminent).disabled(true)
            Text("na próxima versão").font(.footnote).foregroundStyle(Tema.tintaSuave)
        }
        .frame(maxWidth: .infinity).accessibilityElement(children: .combine)
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
