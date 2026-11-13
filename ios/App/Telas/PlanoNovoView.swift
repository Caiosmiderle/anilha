import AnilhaCore
import SwiftUI

struct PlanoNovoView: View {
    let conta: ContaStore
    let today: String
    var demonstracao = false
    /// Opened from Perfil de treino: saving the answers keeps the plan (saveTrainingProfile).
    var soRespostas = false
    @Environment(\.dismiss) private var dismiss
    @State private var params: ReadRow
    @State private var splitPicked: Bool
    @State private var place: String
    @State private var preview: ReadRow?
    @State private var reviewed = ReadRow(fields: [:])
    @State private var baseline = ReadRow(fields: [:])
    @State private var erro: String?
    @State private var confirmar = false
    @State private var salvando = false
    @State private var salvo = false
    @State private var respostasSalvas: String?

    private static let equipment = [("halteres", "Halteres"), ("barra", "Barra e anilhas"), ("polia", "Polias"), ("maquina", "Máquinas"), ("peso_corporal", "Peso corporal"), ("kettlebell", "Kettlebell"), ("barra_fixa", "Barra fixa")]
    private static let places: [String: [String]] = ["completa": equipment.map { $0.0 }, "pequena": ["halteres", "polia", "peso_corporal", "barra_fixa"], "casa": ["halteres", "peso_corporal"]]
    private static let weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

    init(conta: ContaStore, today: String, demonstracao: Bool = false, soRespostas: Bool = false) {
        self.conta = conta; self.today = today; self.demonstracao = demonstracao; self.soRespostas = soRespostas
        let initial = conta.dados.active("profiles").first?.object("onboarding") ?? ReadRow(fields: [:])
        let defaults: [String: JSONValue] = ["first_name": .string(""), "goal": .string("hipertrofia"), "level": .string("intermediario"),
            "gym_days": .number(3), "run_days": .number(1), "minutes": .number(45), "time": .string("18:30"), "returning": .bool(false),
            "force_gym_days": .bool(false), "equipment": .array(Self.equipment.map { .string($0.0) }), "spare_joints": .array([])]
        var p = ReadRow(fields: defaults.merging(initial.fields) { _, value in value })
        if !conta.saudePermitida { p.fields["spare_joints"] = .array([]) }
        _params = State(initialValue: p)
        _splitPicked = State(initialValue: p.string("split_style") != nil)
        let values = Set(Self.strings(p, "equipment"))
        _place = State(initialValue: ["completa", "pequena", "casa"].first { Set(Self.places[$0] ?? []) == values } ?? "custom")
    }
    var body: some View {
        List {
            CabecalhoAnilha(titulo: salvo ? "Plano novo salvo" : "Plano novo", selo: salvo ? "Pronto" : preview == nil ? "Suas respostas" : "Antes de salvar", icone: salvo ? "checkmark.circle" : "arrow.triangle.2.circlepath")
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
            if salvo { depoisDeSalvar }
            else if let preview { revisao(preview) }
            else { perguntas }
            if let erro { Section { Text(erro).foregroundStyle(Tema.perigo).accessibilityIdentifier("plano-novo-erro") } }
        }
        .scrollContentBackground(.hidden).background { FundoAnilha() }
        .navigationTitle(soRespostas && preview == nil && !salvo ? "Suas respostas" : "Plano novo").navigationBarTitleDisplayMode(.inline)
        .disabled(salvando)
        // Save stays in view while the preview scrolls (it used to sit after every ficha and reason).
        .safeAreaInset(edge: .bottom) {
            if preview != nil && !salvo {
                VStack(spacing: 8) {
                    Button { confirmar = true } label: {
                        Label("Salvar plano novo", systemImage: "checkmark").frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.principalAnilha).controlSize(.large)
                    .accessibilityIdentifier("plano-novo-salvar")
                    Button("Voltar às respostas") { preview = nil; erro = nil }.frame(minHeight: 44)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.bar)
            }
        }
        .confirmationDialog("Salvar este plano novo?", isPresented: $confirmar, titleVisibility: .visible) {
            Button("Salvar plano novo") { salvar() }
            Button("Cancelar", role: .cancel) { }
        } message: {
            Text("Só as fichas de origem plano serão trocadas. Suas outras fichas e os treinos já feitos ficam no histórico. O plano novo começa hoje.")
        }
        .onChange(of: params) { _, _ in if !salvo { preview = nil; erro = nil; respostasSalvas = nil } }
        .onChange(of: conta.saudePermitida) { _, allowed in
            if !allowed { params.fields["spare_joints"] = .array([]) }
            preview = nil; confirmar = false
        }
        .onChange(of: conta.dono) { _, _ in preview = nil; confirmar = false }
        .task { if demonstracao { revisar() } }
    }
    @ViewBuilder private var perguntas: some View {
        Section {
            Text("Confira suas respostas. Você verá o plano antes de trocar.").foregroundStyle(Tema.tintaSuave)
            escolha("Objetivo", "goal", [("hipertrofia", "Ganhar massa"), ("emagrecimento", "Emagrecer"), ("condicionamento", "Condicionamento"), ("saude", "Saúde geral"), ("forca", "Ficar mais forte"), ("corrida", "Correr provas")])
        }
        if params.string("goal") == "corrida" || params.fields["race"] != nil && params.fields["race"] != .null { prova }
        Section("Foco") {
            ForEach([("equilibrado", "Corpo todo por igual"), ("pernas", "Pernas e glúteos"), ("costas_ombros", "Costas e ombros"), ("peito_bracos", "Peito e braços"), ("abdomen", "Abdômen")], id: \.0) { key, label in
                Toggle(label, isOn: Binding(get: { focos.contains(key) }, set: { enabled in
                    var values = key == "equilibrado" ? [] : focos.filter { $0 != "equilibrado" && $0 != key }
                    if enabled { values.append(key) }
                    params.fields["focus"] = .array((values.isEmpty ? ["equilibrado"] : values).map(JSONValue.string))
                }))
            }
        }
        Section("Experiência") {
            escolha("Nível", "level", [("iniciante", "Iniciante"), ("intermediario", "Intermediário"), ("avancado", "Avançado")])
            Text("Iniciante: menos de 6 meses ou sem constância. Intermediário: de 6 meses a 2 anos. Avançado: mais de 2 anos e técnica firme.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            Toggle("Voltando de pausa de mais de 3 semanas", isOn: boolean("returning"))
            Text("Na volta, 4 semanas com menos séries e mais folga em cada uma.").font(.footnote).foregroundStyle(Tema.tintaSuave)
        }
        Section("Onde treina") {
            Picker("Local", selection: Binding(get: { place }, set: { value in
                place = value
                if let list = Self.places[value] { params.fields["equipment"] = .array(list.map(JSONValue.string)) }
            })) {
                Text("Academia completa").tag("completa"); Text("Academia pequena ou de prédio").tag("pequena")
                Text("Em casa").tag("casa"); Text("Do meu jeito").tag("custom")
            }
            if place == "custom" {
                forEquipamentos
                Text("Peso corporal está sempre incluído.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
        }
        semana
        Section("Tempo e horário") {
            Picker("Minutos por treino", selection: inteiro("minutes", fallback: 45)) {
                ForEach([30, 45, 60, 75, 90], id: \.self) { Text("\($0) min").tag($0) }
            }
            TextField("Horário dos treinos (HH:mm)", text: texto("time", fallback: "06:00")).keyboardType(.numbersAndPunctuation)
                .accessibilityLabel("Horário dos treinos, horas e minutos")
        }
        if (params.number("gym_days") ?? 0) > 0 { divisao }
        Section("Sobre você") {
            escolha("Faixa de idade", "age_range", [("", "Não informada"), ("18-29", "18 a 29"), ("30-39", "30 a 39"), ("40-49", "40 a 49"), ("50-59", "50 a 59"), ("60+", "60 ou mais")])
            Text("Guardamos só a faixa, não a data de nascimento. O Anilha é para maiores de 18 anos.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            escolha("Gênero", "gender", [("", "Não informado"), ("feminino", "Feminino"), ("masculino", "Masculino"), ("outro", "Outro"), ("nao_informar", "Prefiro não informar")])
            Text("Opcional. Só ajusta um pouco o volume da semana e nunca muda o foco escolhido.").font(.footnote).foregroundStyle(Tema.tintaSuave)
        }
        if conta.saudePermitida {
            Section("Articulações a poupar") {
                ForEach([("ombro", "Ombro"), ("cotovelo", "Cotovelo"), ("joelho", "Joelho"), ("lombar", "Lombar"), ("punho", "Punho")], id: \.0) { key, label in
                    Toggle(label, isOn: selecao("spare_joints", key))
                }
            }
        } else {
            Section { Text("Para poupar articulações, permita dados de saúde em Você > Privacidade.").font(.footnote).foregroundStyle(Tema.tintaSuave) }
        }
        Section {
            if soRespostas {
                Button("Salvar respostas") { salvarRespostas() }.buttonStyle(.principalAnilha).frame(minHeight: 44)
                    .disabled(conta.dados.active("profiles").isEmpty)
                Button("Ver plano novo com estas respostas") { revisar() }.frame(minHeight: 44)
                    .disabled(conta.dados.active("profiles").isEmpty)
            } else {
                Button("Ver prévia do plano") { revisar() }.buttonStyle(.principalAnilha).frame(minHeight: 44)
                    .disabled(conta.dados.active("profiles").isEmpty)
                Button("Salvar só as respostas, sem trocar o plano") { salvarRespostas() }.frame(minHeight: 44)
                    .disabled(conta.dados.active("profiles").isEmpty)
            }
        } footer: {
            if let respostasSalvas { Text(respostasSalvas) }
        }
    }
    private var forEquipamentos: some View {
        ForEach(Self.equipment.filter { $0.0 != "peso_corporal" }, id: \.0) { key, label in
            Toggle(label, isOn: selecao("equipment", key))
        }
    }
    private var semana: some View {
        Section("Dias por semana") {
            Stepper("Academia: \(Int(params.number("gym_days") ?? 0)) dias", value: Binding(get: { Int(params.number("gym_days") ?? 0) }, set: { value in
                params.fields["gym_days"] = .number(Double(value))
                recortar("gym_weekdays", value)
                let runs = min(Int(params.number("run_days") ?? 0), 7 - value)
                params.fields["run_days"] = .number(Double(runs)); recortar("run_weekdays", runs)
            }), in: 0...6)
            Stepper("Corrida: \(Int(params.number("run_days") ?? 0)) dias", value: Binding(get: { Int(params.number("run_days") ?? 0) }, set: { value in
                params.fields["run_days"] = .number(Double(value)); recortar("run_weekdays", value)
            }), in: 0...max(0, 7 - Int(params.number("gym_days") ?? 0)))
            if (params.number("gym_days") ?? 0) > 0 { dias("Dias de academia", key: "gym_weekdays", other: "run_weekdays", count: Int(params.number("gym_days") ?? 0)) }
            if (params.number("run_days") ?? 0) > 0 { dias("Dias de corrida", key: "run_weekdays", other: "gym_weekdays", count: Int(params.number("run_days") ?? 0)) }
            Text("Os dias são opcionais. Sem escolher, o motor distribui pela semana.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            if (params.number("gym_days") ?? 0) >= 5 {
                Text("Com 5 ou mais dias sobra pouco descanso. Vou sugerir 4 e explicar o porquê.").font(.footnote)
                Toggle("Quero todos esses dias mesmo assim", isOn: boolean("force_gym_days"))
            }
        }
    }
    private var divisao: some View {
        Section("Divisão") {
            Picker("Divisão dos treinos", selection: Binding(get: { splitPicked ? params.string("split_style") ?? "auto" : "auto" }, set: { value in
                splitPicked = value != "auto"
                if splitPicked {
                    params.fields["split_style"] = .string(value)
                    if value == "grupos" { params.fields["fichas"] = .number(min(5, max(focos.contains("pernas") ? 4 : 3, params.number("fichas") ?? 3))) }
                } else { params.fields.removeValue(forKey: "split_style") }
            })) {
                Text("Sugerida pelo motor").tag("auto")
                Text(focos.contains("pernas") ? "Pernas por partes" : "Por grupo muscular").tag("grupos")
                Text(focos.contains("pernas") ? "Superior e inferior com mais perna" : "Superior e inferior").tag("superior_inferior")
                Text(focos.contains("pernas") ? "Corpo inteiro com mais perna" : "Corpo inteiro").tag("corpo_inteiro")
            }
            if params.string("split_style") == "grupos" {
                Picker("Quantas fichas", selection: inteiro("fichas", fallback: 3)) {
                    Text("A a C").tag(3); Text("A a D").tag(4); Text("A a E").tag(5)
                }
            }
            Text("A prévia mostra as fichas, a rotação e os motivos da divisão.").font(.footnote).foregroundStyle(Tema.tintaSuave)
        }
    }
    private var prova: some View {
        Section("Prova alvo") {
            Picker("Prova marcada", selection: Binding(get: { Int(params.object("race").number("distance_km") ?? 0) }, set: { value in
                params.fields["race"] = value == 0 ? .null : .object(["distance_km": .number(Double(value)), "date": params.object("race").fields["date"] ?? .string(""), "from": .string(today)])
            })) {
                Text("Ainda não").tag(0)
                ForEach([5, 10, 21, 42], id: \.self) { Text("\($0) km").tag($0) }
            }
            if params.object("race").number("distance_km") != nil {
                DatePicker("Data da prova", selection: Binding(get: { data(params.object("race").string("date") ?? today) }, set: { value in
                    params.fields["race"] = .object(params.object("race").changing(["date": .string(LocalDay.today(value))]).fields)
                }), in: data(today)...data(LocalDay.add(today, 365)), displayedComponents: .date)
                if params.object("race").string("date") == "" {
                    Button("Usar a data de hoje") { params.fields["race"] = .object(params.object("race").changing(["date": .string(today)]).fields) }
                }
            }
            Text("Com a prova marcada, o longão cresce até ela e a semana final alivia.").font(.footnote).foregroundStyle(Tema.tintaSuave)
        }
    }
    @ViewBuilder private func revisao(_ plan: ReadRow) -> some View {
        Section("Este será seu novo plano") {
            Text("\(Int(plan.number("gym_per_week") ?? 0)) dias de academia e \(Int(plan.number("run_per_week") ?? 0)) de corrida por semana").font(.headline)
            Text("\(Int(reviewed.number("minutes") ?? 45)) min por treino, às \(reviewed.string("time") ?? "")").foregroundStyle(Tema.tintaSuave)
            ForEach(Array(plan.array("days").enumerated()), id: \.offset) { _, day in
                LabeledContent(Self.weekdays[min(6, max(0, Int(day.number("weekday") ?? 0)))], value: nomeDia(day))
            }
            if !plan.object("rules").fields.isEmpty, case .array = plan.object("rules").fields["rotation"] {
                Text("As fichas giram em sequência nos dias de academia, seguindo o último treino feito.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
        }
        Section("Fichas") {
            ForEach(Array(plan.array("routines").enumerated()), id: \.offset) { _, routine in
                DisclosureGroup(routine.string("name") ?? "Ficha") {
                    Text(routine.string("reason") ?? "").font(.footnote).foregroundStyle(Tema.tintaSuave)
                    ForEach(Array(routine.array("items").enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(conta.catalogo.first { $0.id == item.string("exercise_id") }?.string("name") ?? item.string("exercise_id") ?? "Exercício")
                            Text("\(Int(item.number("sets") ?? 0)) x \(Int(item.number("target_min") ?? 0))-\(Int(item.number("target_max") ?? 0)) · descanso \(Int(item.number("rest_sec") ?? 0)) s · \(Int(item.number("warmup_sets") ?? 0)) de aquecimento").font(.footnote).foregroundStyle(Tema.tintaSuave)
                        }.fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        Section("Por que este plano") {
            ForEach(Array(Self.strings(plan, "reasons").enumerated()), id: \.offset) { _, reason in Text(reason).font(.subheadline) }
        }
        Section {
            Text("Nada muda até você tocar em Salvar plano novo. Só as fichas do plano são trocadas; suas fichas próprias e os treinos já feitos ficam.")
            if conta.admin {
                Text("Depois de salvar, o Waltér pode revisar cada ficha nova. Cada ajuste dele só muda a ficha com Aplicar.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
        } footer: { Text("Com as mesmas respostas, o plano pode ser igual ao anterior. Ele segue suas preferências, sem sorteio.") }
    }
    /// After saving: the plan's new fichas, each one with the Waltér review (FichaView, admin).
    @ViewBuilder private var depoisDeSalvar: some View {
        let novas = conta.dados.routines.filter { $0.string("origin") == "plano" }
        Section {
            Text("O plano novo já está nas suas fichas e vai para o site na próxima sincronização.")
            if conta.admin {
                Text("Quer a opinião do Waltér? Abra uma ficha e toque em revisar. Ele propõe até três ajustes e nada muda sem Aplicar.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
        }
        Section(conta.admin ? "Revisar com o Waltér" : "Fichas do plano") {
            ForEach(novas) { ficha in
                NavigationLink { FichaView(conta: conta, ficha: ficha) } label: {
                    Label(ficha.string("name") ?? "Ficha", systemImage: conta.admin ? "sparkles" : "list.bullet")
                }
                .frame(minHeight: 44)
            }
        }
        Section {
            Button("Concluir") { dismiss() }.buttonStyle(.principalAnilha).frame(minHeight: 44)
        }
    }
    private func nomeDia(_ day: ReadRow) -> String {
        switch day.string("kind") {
        case "gym": Planning.splits.first { $0.id == day.string("split_key") }?.name ?? "Academia"
        case "run": "Corrida \(["leve": "leve", "longo": "longa", "intervalado": "de qualidade"][day.string("run_type") ?? ""] ?? "")"
        default: "Descanso"
        }
    }
    private func revisar() {
        do {
            let effective = try PlanEngine.parameters(params, picked: splitPicked, health: conta.saudePermitida)
            try PlanEngine.validate(effective, today: today)
            guard effective.string("time")?.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil else { throw PlanEngine.Failure.invalid }
            let generated = try PlanEngine.generate(effective)
            reviewed = effective; baseline = NewPlan.binding(conta.dados); preview = generated; erro = nil
        } catch { preview = nil; erro = error.localizedDescription }
    }
    /// saveTrainingProfile on the site: only profiles.onboarding changes; the plan stays.
    private func salvarRespostas() {
        do {
            let effective = try PlanEngine.parameters(params, picked: splitPicked, health: conta.saudePermitida)
            try PlanEngine.validate(effective, today: today)
            guard effective.string("time")?.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil else { throw PlanEngine.Failure.invalid }
            guard let profile = conta.dados.active("profiles").first else { throw PlanEngine.Failure.conflict }
            guard conta.gravar([PushChange("profiles", profile.changing(["onboarding": .object(effective.fields)]))]) else { return }
            erro = nil
            respostasSalvas = "Respostas salvas. Seu plano continua o mesmo; para trocá-lo, use Plano novo."
            Task { await conta.atualizar() }
        } catch { erro = error.localizedDescription }
    }
    private func salvar() {
        guard !salvando, let preview else { return }
        salvando = true
        defer { salvando = false }
        do {
            try conta.adotarPlano(preview, params: reviewed, baseline: baseline, today: today)
            salvo = true
        } catch { self.preview = nil; erro = error.localizedDescription }
    }
    private func escolha(_ title: String, _ key: String, _ options: [(String, String)]) -> some View {
        Picker(title, selection: texto(key)) { ForEach(options, id: \.0) { key, title in Text(title).tag(key) } }
    }
    private func texto(_ key: String, fallback: String = "") -> Binding<String> {
        Binding(get: { params.string(key) ?? fallback }, set: { params.fields[key] = $0.isEmpty ? .null : .string($0) })
    }
    private func inteiro(_ key: String, fallback: Int) -> Binding<Int> {
        Binding(get: { Int(params.number(key) ?? Double(fallback)) }, set: { params.fields[key] = .number(Double($0)) })
    }
    private func boolean(_ key: String) -> Binding<Bool> {
        Binding(get: { params.bool(key) == true }, set: { params.fields[key] = .bool($0) })
    }
    private static func strings(_ row: ReadRow, _ key: String) -> [String] {
        if case .string(let value) = row.fields[key] { return [value] }
        if case .array(let values) = row.fields[key] { return values.compactMap { if case .string(let value) = $0 { return value }; return nil } }
        return []
    }
    private var focos: [String] { let values = Self.strings(params, "focus"); return values.isEmpty ? ["equilibrado"] : values }
    private func selecao(_ key: String, _ value: String) -> Binding<Bool> {
        Binding(get: { Self.strings(params, key).contains(value) }, set: { enabled in
            var list = Self.strings(params, key).filter { $0 != value }
            if enabled { list.append(value) }
            params.fields[key] = .array(list.map(JSONValue.string))
        })
    }
    private func recortar(_ key: String, _ count: Int) {
        if case .array(let values) = params.fields[key] { params.fields[key] = .array(Array(values.suffix(count))) }
    }
    private func dias(_ title: String, key: String, other: String, count: Int) -> some View {
        DisclosureGroup(title) {
            ForEach(0..<7) { day in
                Toggle(Self.weekdays[day], isOn: Binding(get: {
                    if case .array(let values) = params.fields[key] { return values.contains(.number(Double(day))) }; return false
                }, set: { enabled in
                    let value = JSONValue.number(Double(day))
                    var days: [JSONValue] = []; if case .array(let a) = params.fields[key] { days = a }
                    days.removeAll { $0 == value }
                    if enabled {
                        days.append(value)
                        if case .array(let a) = params.fields[other] { params.fields[other] = .array(a.filter { $0 != value }) }
                    }
                    params.fields[key] = .array(Array(days.suffix(count)))
                }))
            }
        }
    }
    private func data(_ day: String) -> Date {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: day) ?? formatter.date(from: today) ?? .now
    }
}
