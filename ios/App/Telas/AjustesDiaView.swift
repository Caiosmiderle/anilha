import AnilhaCore
import SwiftUI

struct CartaoHoje: View {
    let conta: ContaStore
    let today: String
    @State private var folha: String?
    @State private var owner: String?

    var body: some View {
        let resultado = Result { try DayAdjustments.evaluate(conta.dados, catalog: conta.catalogo, today: today, health: conta.saudePermitida) }
        VStack(alignment: .leading, spacing: Tema.Espaco.e3) {
            Label("Seu dia no Anilha", systemImage: "calendar").font(.subheadline.weight(.semibold)).foregroundStyle(Tema.marcaForte)
            switch resultado {
            case .success(let retrato):
                recomendacao(retrato)
                if conta.ativa == nil {
                    acoes(retrato)
                }
            case .failure(let erro):
                Text(erro.localizedDescription).foregroundStyle(Tema.tintaSuave)
            }
            if conta.ativa == nil {
                Button { abrir("fichas") } label: { Label("Treinar outra ficha", systemImage: "rectangle.stack") }
                    .buttonStyle(.glass).frame(minHeight: 44)
                    .accessibilityLabel("Treinar outra ficha")
            }
            if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo) }
        }
        .padding(Tema.Espaco.e5).frame(maxWidth: .infinity, alignment: .leading).cartao()
        .contextMenu {
            if case .success(let retrato) = resultado, conta.ativa == nil,
               retrato.object("rec").string("kind") == "gym", !retrato.object("routine").id.isEmpty {
                Button("Começar treino", systemImage: "play.fill") { conta.comecar(retrato.object("routine"), ajusteDoDia: true) }
            }
        } preview: {
            if case .success(let retrato) = resultado {
                VStack(alignment: .leading, spacing: 10) {
                    Text(retrato.object("routine").string("name") ?? retrato.object("rec").string("headline") ?? "Seu dia").font(.title2.bold())
                    ItensAjustadosDia(conta: conta, items: retrato.array("items"))
                }.padding(20).frame(width: 340, alignment: .leading).background { FundoAnilha() }
            }
        }
        .sheet(isPresented: Binding(get: { folha != nil }, set: { if !$0 { folha = nil } })) {
            NavigationStack {
                if folha == "fichas" {
                    List {
                        if conta.dados.routines.isEmpty { Text("Nenhuma ficha ativa. Crie uma em Plano > Fichas.") }
                        ForEach(conta.dados.routines) { ficha in
                            Button {
                                guard owner == conta.dono, conta.ativa == nil else { folha = nil; return }
                                conta.comecar(ficha)
                                if conta.sessaoAberta != nil { folha = nil }
                            } label: {
                                Label(ficha.string("name") ?? "Ficha", systemImage: "play.fill")
                                    .frame(minHeight: 44)
                            }
                            .disabled(conta.ativa != nil)
                            .accessibilityLabel("Começar \(ficha.string("name") ?? "ficha")")
                        }
                        if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo) }
                    }
                    .navigationTitle("Treinar outra ficha")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fechar") { folha = nil } } }
                } else if let folha {
                    EscolhaAjusteDia(conta: conta, today: today, kind: folha, owner: owner) { self.folha = nil }
                }
            }.tint(Tema.acao)
        }
        .onChange(of: conta.dono) { folha = nil }
        .onChange(of: conta.ativa?.id) { folha = nil }
    }

    @ViewBuilder private func recomendacao(_ retrato: ReadRow) -> some View {
        let rec = retrato.object("rec"), ficha = retrato.object("routine")
        if rec.string("kind") == "gym", !ficha.id.isEmpty {
            HStack(alignment: .top, spacing: 12) {
                DiscoExercicio(grupo: retrato.array("items").first.flatMap { conta.dados.exercises(catalog: conta.catalogo)[$0.string("exercise_id") ?? ""]?.string("primary_group") })
                Text(ficha.string("name") ?? "Treino de força").font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
            }
            NavigationLink { FichaView(conta: conta, ficha: ficha) } label: { Label("Ver ficha original", systemImage: "list.bullet") }
                .buttonStyle(.glass).frame(minHeight: 44)
            if conta.ativa == nil {
                Button("Começar treino") { conta.comecar(ficha, ajusteDoDia: true) }
                    .buttonStyle(.principalAnilha).controlSize(.large).frame(minHeight: 44)
            }
        } else {
            Text(rec.string("headline") ?? "Seu dia").font(.title2.bold())
        }
        Text(rec.string("reason") ?? "").font(.subheadline).foregroundStyle(Tema.tintaSuave)
        ForEach(Array(rec.array("alerts").enumerated()), id: \.offset) { _, alert in
            Label(alert.string("text") ?? "", systemImage: "info.circle").font(.subheadline)
        }
        if retrato.fields["override"] != .null {
            SeloAnilha(texto: "Ajuste só para hoje", icone: "slider.horizontal.3")
        }
        if let summary = retrato.string("summary"), !summary.isEmpty {
            Text(summary).font(.subheadline.weight(.semibold))
            ItensAjustadosDia(conta: conta, items: retrato.array("items"))
        }
    }

    private func abrir(_ kind: String) { owner = conta.dono; folha = kind }
    private func aplicar(_ action: String?) { _ = conta.ajustarDia(today, action: action, owner: conta.dono) }

    private func acoes(_ retrato: ReadRow) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                if retrato.fields["override"] != .null {
                    acao("Desfazer ajuste", "arrow.uturn.backward") { aplicar(nil) }
                } else {
                    acao("Tenho pouco tempo", "clock") { abrir("time") }
                    acao("Focar em um grupo", "scope") { abrir("focus") }
                    acao("Sem equipamento", "wrench") { abrir("no_equipment") }
                    if conta.saudePermitida { acao("Poupar articulação", "hand.raised") { abrir("spare_joint") } }
                    acao("Trocar por corrida", "figure.run") { aplicar("run") }
                    acao("Hoje é descanso", "moon") { aplicar("rest") }
                }
            }
        }
        .accessibilityLabel("Ajustar o dia")
    }
    private func acao(_ titulo: String, _ icone: String, run: @escaping () -> Void) -> some View {
        Button(action: run) { Label(titulo, systemImage: icone).font(.subheadline.weight(.semibold)).padding(.horizontal, 12).frame(minHeight: 44) }
            .buttonStyle(.plain).foregroundStyle(Tema.marcaForte)
            .background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: Tema.Raio.lg))
            .accessibilityLabel(titulo)
    }
}

private struct EscolhaAjusteDia: View {
    let conta: ContaStore
    let today: String
    let kind: String
    let owner: String?
    let fechar: () -> Void
    @State private var value = ""
    private var titulo: String {
        switch kind {
        case "time": "Quanto tempo você tem?"
        case "focus": "Focar em qual grupo?"
        case "no_equipment": "Sem qual equipamento?"
        default: "Poupar qual articulação?"
        }
    }
    var body: some View {
        let options = (try? DayAdjustments.options().array(kind)) ?? []
        let choice = value.isEmpty ? inicial : value
        let preview = Result { () throws -> ReadRow in
            var data = conta.dados
            let changes = try DayAdjustments.changes(data, today: today, action: kind, value: choice, health: conta.saudePermitida)
            data.tables["day_overrides"] = data.active("day_overrides").filter { $0.string("local_date") != today } + changes.map(\.row)
            return try DayAdjustments.evaluate(data, catalog: conta.catalogo, today: today, health: conta.saudePermitida)
        }
        Form {
            Picker(titulo, selection: Binding(get: { choice }, set: { value = $0 })) {
                ForEach(options) { Text($0.string("name") ?? $0.id).tag($0.id) }
            }.frame(minHeight: 44).accessibilityLabel(titulo)
            switch preview {
            case .success(let retrato):
                Section("O que muda hoje") {
                    Text(retrato.string("summary") ?? "Nada muda.").font(.headline)
                    if case .array(let descriptions) = retrato.fields["descriptions"] {
                        ForEach(Array(descriptions.enumerated()), id: \.offset) { _, line in
                            if case .string(let text) = line { Text(text) }
                        }
                    }
                    ItensAjustadosDia(conta: conta, items: retrato.array("items"))
                }
                Button("Ajustar treino de hoje") {
                    if conta.ajustarDia(today, action: kind, value: choice, owner: owner) { fechar() }
                }.buttonStyle(.principalAnilha).frame(minHeight: 44)
            case .failure(let erro): Text(erro.localizedDescription).foregroundStyle(Tema.perigo)
            }
            if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo) }
        }
        .navigationTitle(titulo).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } } }
    }
    private var inicial: String {
        switch kind { case "time": "30"; case "focus": "costas"; case "no_equipment": "barra"; default: "ombro" }
    }
}

private struct ItensAjustadosDia: View {
    let conta: ContaStore
    let items: [ReadRow]
    var body: some View {
        let catalog = conta.dados.exercises(catalog: conta.catalogo)
        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
            let name = catalog[item.string("exercise_id") ?? ""]?.string("name") ?? "Exercício"
            Text("\(name): \(Int(item.number("sets") ?? 0)) séries")
                .font(.subheadline).foregroundStyle(Tema.tintaSuave)
        }
    }
}
