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
                CabecalhoAnilha(titulo: "Hoje", selo: dataHoje, icone: "calendar")
                    .entradaAnilha(0)
                StatusSyncView(conta: conta)
                VStack(alignment: .leading, spacing: Tema.Espaco.e3) {
                    Label("Planejado no Anilha", systemImage: "calendar").font(.subheadline.weight(.semibold)).foregroundStyle(Tema.marcaForte)
                    if let dia {
                        if dia.kind == "gym" {
                            HStack(alignment: .top, spacing: 12) {
                                DiscoExercicio(grupo: conta.dados.items(ficha?.id ?? "").first.flatMap { item in conta.dados.exercises(catalog: conta.catalogo)[item.string("exercise_id") ?? ""]?.string("primary_group") })
                                Text(ficha?.string("name") ?? nomeSplit(dia.split_key)).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                            }
                            if let ficha {
                                NavigationLink {
                                    FichaView(conta: conta, ficha: ficha)
                                } label: { Label("Ver exercícios", systemImage: "list.bullet") }
                                .buttonStyle(.glass).controlSize(.large).frame(minHeight: 44)
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
                    if let ativa = conta.ativa {
                        Button("Continuar treino") { conta.sessaoAberta = ativa.id }.buttonStyle(.glassProminent).tint(Tema.acao).controlSize(.large).frame(minHeight: 44)
                    } else if let ficha {
                        Button("Começar treino") { conta.comecar(ficha) }.buttonStyle(.glassProminent).tint(Tema.acao).controlSize(.large).frame(minHeight: 44)
                    }
                    if let erro = conta.erro { Text(erro).foregroundStyle(.red) }
                }
                .padding(Tema.Espaco.e5).frame(maxWidth: .infinity, alignment: .leading).destaqueAnilha().entradaAnilha(1)
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
        .navigationTitle("Hoje").navigationBarTitleDisplayMode(.inline)
        .refreshable { await conta.atualizar() }
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
