import AnilhaCore
import SwiftUI

struct ExecucaoTreino: View {
    let conta: ContaStore
    let session: ReadRow
    let jogoInicial: RestCardGame?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var fase
    @State private var foco: Bool
    @State private var ajustar = false
    @State private var selecionada: String?
    @State private var expandidos: Set<String> = []
    @State private var rascunho: ReadRow?
    @State private var esforcoID: String?
    @State private var confirmarFim = false
    @State private var confirmarDescarte = false
    @State private var trocar: ReadRow?
    @State private var busca = ""
    @State private var erro: String?
    @State private var aviso: String?
    @State private var jogos = RestGameState()
    @AppStorage("anilha.jogoDescanso") private var jogoPreferido = RestCardGame.blackjack.rawValue
    @ScaledMetric(relativeTo: .largeTitle) private var tamanhoPrincipal: CGFloat = 76

    init(conta: ContaStore, session: ReadRow, focoInicial: Bool = true,
         jogoInicial: RestCardGame? = nil) {
        self.conta = conta
        self.session = session
        self.jogoInicial = jogoInicial
        _foco = State(initialValue: focoInicial)
    }
    private var items: [ReadRow] { Workout.items(conta.dados, session.id) }
    private var exercises: [String: ReadRow] { conta.dados.exercises(catalog: conta.catalogo) }
    private var allSets: [ReadRow] { conta.dados.active("sets").filter { $0.string("session_id") == session.id } }
    private var next: ReadRow? {
        allSets.first { $0.id == selecionada && $0.number("completed_at") == nil }
            ?? Workout.next(items, sets: allSets)
    }
    private var item: ReadRow? { items.first { $0.id == next?.string("item_id") } }
    private var exercise: ReadRow? { exercises[next?.string("exercise_id") ?? ""] }
    private var dica: String? {
        guard let exercise else { return nil }
        let input = AnalysisMemory.input(routineID: session.string("routine_id"), date: dataDica, before: session.number("started_at") ?? 0, items: items, analyses: conta.analises.filter { $0.key.hasPrefix("analysis:") }.map(\.value))
        return AnalysisMemory.hint(input, exercise: exercise.id, routineItems: conta.dados.active("routine_items"), catalog: conta.catalogo)
    }
    private var dataDica: String {
        #if DEBUG
        if ModoDemo.solicitado { return session.string("local_date") ?? LocalDay.today() }
        #endif
        return LocalDay.today()
    }
    private var lb: Bool { conta.dados.active("profiles").first?.string("unit") == "lb" }
    private var time: Bool { exercise?.string("measure") == "time" }
    private var done: Int { allSets.filter { $0.string("kind") == "work" && $0.number("completed_at") != nil }.count }
    private var current: ReadRow {
        guard let next, let exercise else { return ReadRow(fields: [:]) }
        if let rascunho, rascunho.id == next.id { return rascunho }
        let seed = Workout.editorStart(next, itemSets: Workout.sets(conta.dados, next.string("item_id") ?? ""), exercise: exercise, unit: lb ? "lb" : "kg")
        return next.changing(Workout.editorSave(seed, exercise: exercise, unit: lb ? "lb" : "kg").fields)
    }
    private var weighted: Bool {
        guard let next, let exercise else { return false }
        return Workout.editorStart(next, itemSets: Workout.sets(conta.dados, next.string("item_id") ?? ""), exercise: exercise, unit: lb ? "lb" : "kg").bool("showLoad") == true
    }
    private var setLine: String {
        guard let next else { return "" }
        let kind = next.string("kind") ?? "work"
        let sets = Workout.sets(conta.dados, next.string("item_id") ?? "").filter { $0.string("kind") == kind }
        let pos = (sets.firstIndex { $0.id == next.id } ?? 0) + 1
        return "\(kind == "warmup" ? "Aquecimento" : "Série") \(pos) de \(sets.count)"
    }
    private var what: String? {
        guard let value = current.number(time ? "seconds" : "reps"), value.isFinite, value > 0 else { return nil }
        let number = value.formatted(.number.locale(Locale(identifier: "pt_BR")).precision(.fractionLength(0...2)))
        let amount = "\(number)\(time ? " s" : "")"
        if weighted, let kg = current.number("load_kg"), kg > 0 { return "\(formatarCarga(kg, lb: lb)) x \(amount)" }
        return time ? amount : "\(number) \(value == 1 ? "repetição" : "repetições")"
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let now = context.date.timeIntervalSince1970 * 1000
            let end = Workout.restEnd(session)
            let left = max(0, Int(ceil(((end ?? now) - now) / 1000)))
            let resting = left > 0
            VStack(spacing: 0) {
                cabecalho(now: now)
                if foco { centro(resting: resting, left: left) }
                else { lista }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 12) {
                    if let erro = erro ?? conta.erro { Text(erro).font(.footnote).foregroundStyle(Tema.perigo) }
                    if !foco { esforco }
                    if resting {
                        if !foco { Text(relogioTreino(Double(left))).font(.largeTitle.bold()).monospacedDigit().accessibilityLabel("Descanso, \(left) segundos") }
                        controlesDescanso(left: left)
                    } else if !foco || ajustar {
                        if next != nil { editor }
                        else { concluirTreino }
                    } else { acoesFoco }
                }
                .padding(16).frame(maxWidth: .infinity)
                .background(Tema.superficie)
            }
            .onChange(of: context.date, initial: true) { _, _ in atualizarDescanso(now: now) }
            .onChange(of: end) { _, _ in atualizarDescanso(now: Date.now.timeIntervalSince1970 * 1000) }
        }
        .background(Tema.fundo)
        .toolbar(.hidden, for: .navigationBar)
        .sensoryFeedback(.success, trigger: jogos.ready) { _, ready in ready }
        .onChange(of: jogos.ready) { _, ready in if ready { ajustar = false } }
        .task(id: next?.id) {
            if let next { rascunho = conta.rascunhoSalvo(next.id) }
        }
        .task(id: esforcoID) {
            guard esforcoID != nil else { return }
            do { try await Task.sleep(for: .seconds(10)) } catch { return }
            esforcoID = nil
        }
        .onChange(of: fase) { _, value in
            if value == .active { atualizarDescanso(now: Date.now.timeIntervalSince1970 * 1000) }
        }
        .task {
            atualizarDescanso(now: Date.now.timeIntervalSince1970 * 1000)
            #if DEBUG
            if let jogoInicial { abrirJogo(jogoInicial, demonstracao: true) }
            if ModoDemo.solicitado && ModoDemo.tela == "esforco" { esforcoID = "demo-sa1" }
            #endif
        }
        .sheet(isPresented: Binding(get: { jogos.game != nil }, set: { if !$0 { jogos.close() } })) {
            BaralhoDescanso(jogos: $jogos, preferido: $jogoPreferido)
        }
        .confirmationDialog("Concluir e guardar o que foi feito?", isPresented: $confirmarFim, titleVisibility: .visible) {
            Button("Concluir treino") { if conta.concluir(session) { Task { await conta.atualizar() } } }
            Button("Continuar treinando", role: .cancel) {}
        } message: { Text("As séries ainda não registradas ficam como não feitas no resumo.") }
        .confirmationDialog("Descartar este treino?", isPresented: $confirmarDescarte, titleVisibility: .visible) {
            Button("Descartar treino", role: .destructive) { descartar() }
            Button("Continuar treinando", role: .cancel) {}
        } message: {
            Text(done == 0 ? "Nenhuma série feita ainda. Descartar não deixa rastro no histórico."
                 : "\(done == 1 ? "A série feita some" : "As \(done) séries feitas somem") e nada vai para o histórico. Para guardar, use Concluir treino.")
        }
        .sheet(item: $trocar) { alvo in
            NavigationStack {
                List(exercises.values.filter { !$0.deleted && $0.bool("archived") != true && $0.id != alvo.string("exercise_id") && (busca.isEmpty || ($0.string("name") ?? "").localizedStandardContains(busca)) }.sorted { ($0.string("name") ?? "") < ($1.string("name") ?? "") }) { replacement in
                    Button(replacement.string("name") ?? "Exercício") {
                        if let live = items.first(where: { $0.id == alvo.id }),
                           conta.dados.active("sessions").contains(where: { $0.id == session.id && $0.string("status") == "active" }),
                           conta.gravar(Workout.substitute(conta.dados, item: live, exercise: replacement, catalog: conta.catalogo, today: LocalDay.today())) {
                            trocar = nil; selecionada = nil; rascunho = nil
                        }
                    }
                }
                .searchable(text: $busca, prompt: "Buscar exercício").navigationTitle("Trocar exercício")
                .toolbar { Button("Cancelar") { trocar = nil } }
            }
        }
    }

    private func cabecalho(now: Double) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.string("title") ?? "Treino").font(.headline).fixedSize(horizontal: false, vertical: true)
                Text(relogioTreino((now - (session.number("started_at") ?? now)) / 1000))
                    .font(.largeTitle.bold()).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                    .accessibilityLabel("Tempo de treino").accessibilityValue(relogioTreino((now - (session.number("started_at") ?? now)) / 1000))
                if !foco { Text("\(done) séries feitas").font(.caption).foregroundStyle(Tema.tintaSuave) }
            }
            Spacer(minLength: 0)
            Button { foco.toggle(); ajustar = false } label: {
                Image(systemName: foco ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .frame(width: 44, height: 44).background(Tema.sutil, in: Circle())
            }.buttonStyle(.plain).accessibilityLabel(foco ? "Recolher para a lista" : "Abrir modo foco")
            Menu {
                if let item { acoesExercicio(item) }
                Button("Concluir treino") { confirmarFim = true }
                Button("Minimizar treino") { conta.sessaoAberta = nil; dismiss() }
                Button("Descartar treino", systemImage: "trash", role: .destructive) { confirmarDescarte = true }
                Button("Ativar aviso de descanso") {
                    Task { aviso = await conta.permitirAvisos() ? "Aviso local ativado." : "Confira as permissões do iPhone e a preferência de descanso no site." }
                }
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
            .accessibilityLabel("Opções do treino")
        }.padding(16)
        .alert("Aviso de descanso", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })) {
            Button("OK") { aviso = nil }
        } message: { Text(aviso ?? "") }
    }

    private func centro(resting: Bool, left: Int) -> some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 20) {
                    if resting {
                        Text("Descanso").font(.title2).foregroundStyle(Tema.tintaSuave)
                        Text(relogioTreino(Double(left))).font(.system(size: tamanhoPrincipal, weight: .bold, design: .rounded))
                            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.3)
                            .accessibilityLabel("Descanso, \(left) segundos")
                        if let exercise { Text("Próxima: \(exercise.string("name") ?? "Exercício")\(what.map { ", \($0)" } ?? "")").font(.subheadline).foregroundStyle(Tema.tintaSuave) }
                    } else if let exercise, next != nil {
                        if jogos.ready { Text("Próxima série").font(.headline).foregroundStyle(Tema.marcaForte) }
                        Text(exercise.string("name") ?? "Exercício").font(.title2).foregroundStyle(Tema.tintaSuave)
                        Text(what ?? "Anotar").font(.system(size: tamanhoPrincipal, weight: .bold, design: .rounded))
                            .lineLimit(2).minimumScaleFactor(0.3).monospacedDigit()
                            .accessibilityLabel("A fazer, \(what ?? "anotar a série")")
                        Text("\(setLine) · \(done) \(done == 1 ? "série feita" : "séries feitas")").font(.subheadline).foregroundStyle(Tema.tintaSuave)
                        if let dica { Text("Waltér: \(dica)").font(.subheadline).foregroundStyle(Tema.tintaSuave).accessibilityIdentifier("focus-hint") }
                        // The load advice is about work sets: none over the warm-up.
                        if let item, next?.string("kind") == "work" { sugestao(item, exercise: exercise) }
                    } else {
                        Text("Tudo feito").font(.title2)
                        Text("\(done)").font(.system(size: tamanhoPrincipal, weight: .bold, design: .rounded))
                        Text("\(done == 1 ? "série feita" : "séries feitas")").foregroundStyle(Tema.tintaSuave)
                    }
                    esforco
                }.multilineTextAlignment(.center).padding(20).frame(maxWidth: .infinity)
                    .frame(minHeight: geometry.size.height)
            }
        }
    }

    private var lista: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    StatusSyncView(conta: conta)
                    ForEach(items) { row in
                        let ex = exercises[row.string("exercise_id") ?? ""]
                        let atual = row.id == item?.id
                        let expandido = atual || expandidos.contains(row.id)
                        VStack(alignment: .leading, spacing: 12) {
                            Button {
                                if expandidos.contains(row.id) { expandidos.remove(row.id) }
                                else { expandidos.insert(row.id) }
                            } label: {
                                HStack(alignment: .top) {
                                    DiscoExercicio(grupo: ex?.string("primary_group"))
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(ex?.string("name") ?? "Exercício indisponível").font(.headline)
                                        Text(Catalogo.nomeGrupo(ex?.string("primary_group"))).font(.caption).foregroundStyle(Tema.tintaSuave)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: expandido ? "chevron.up" : "chevron.down").accessibilityHidden(true)
                                }
                            }.buttonStyle(.plain).disabled(atual)
                            Text("\(Int(row.number("planned_sets") ?? 0))x \(Int(row.number("target_min") ?? 0)) a \(Int(row.number("target_max") ?? 0)) · descanso \(Int(row.number("rest_sec") ?? 90)) s")
                                .font(.caption).foregroundStyle(Tema.tintaSuave)
                            if row.string("status") == "skipped" { Text("Exercício pulado").font(.caption) }
                            if let original = row.string("original_exercise_id") {
                                Text("No lugar de \(exercises[original]?.string("name") ?? "exercício original")").font(.caption)
                            }
                            if expandido {
                                if atual, let ex { sugestao(row, exercise: ex) }
                                ForEach(Workout.sets(conta.dados, row.id)) { set in linhaSerie(set) }
                            }
                        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).cartao().id(row.id)
                            .contextMenu {
                                if row.string("status") != "skipped" { acoesExercicio(row) }
                            }
                    }
                }.padding(16)
            }
            .onChange(of: item?.id, initial: true) { _, id in if let id { proxy.scrollTo(id, anchor: .top) } }
        }
    }

    @ViewBuilder private func acoesExercicio(_ item: ReadRow) -> some View {
        Button("Trocar exercício") {
            trocar = item
            busca = ""
        }
        Button("Deixar para o fim") {
            _ = conta.gravar(Workout.move(conta.dados, item: item, end: true))
            selecionada = nil
        }
        Button("Fazer agora") {
            _ = conta.gravar(Workout.move(conta.dados, item: item, end: false))
        }
        Button("Pular exercício", role: .destructive) {
            _ = conta.gravar(Workout.skip(conta.dados, item: item))
            selecionada = nil
        }
    }

    @ViewBuilder private func sugestao(_ item: ReadRow, exercise: ReadRow) -> some View {
        if !conta.sugestaoIgnorada(sessionID: session.id, itemID: item.id) {
            let suggestion = Workout.suggestion(conta.dados, exercise: exercise, plan: item, today: session.string("local_date") ?? LocalDay.today(), exclude: session.id)
            VStack(alignment: .leading, spacing: 6) {
                Text(textoSugestao(suggestion.kind)).font(.subheadline).foregroundStyle(Tema.marcaForte)
                Button("Ignorar") {
                    if conta.ignorarSugestao(sessionID: session.id, itemID: item.id), let next {
                        rascunho = conta.rascunhoSalvo(next.id)
                    }
                }.frame(minWidth: 44, minHeight: 44).accessibilityLabel("Ignorar sugestão")
                if suggestion.kind == "reps_first", let load = suggestion.load_kg {
                    let up = Progression.nextLoad(load, increment: exercise.number("increment_kg") ?? 2.5, unit: lb ? "lb" : "kg")
                    Text("Busque \(Int(Progression.repsBeforeJump(load, up: up, floor: suggestion.target_min))) repetições em todas antes de subir.").font(.footnote)
                }
                if suggestion.missing_effort { Text("Faltou o esforço da última série. Progrida com cautela.").font(.footnote) }
                if Workout.returning(conta.dados, today: session.string("local_date") ?? LocalDay.today()) {
                    Text("Modo retorno: pare com 2 a 3 repetições na reserva.").font(.footnote)
                }
            }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func linhaSerie(_ set: ReadRow) -> some View {
        let completed = set.number("completed_at") != nil
        let kind = set.string("kind") == "warmup" ? "Aquec." : "Série"
        let same = Workout.sets(conta.dados, set.string("item_id") ?? "").filter { $0.string("kind") == set.string("kind") }
        let pos = (same.firstIndex { $0.id == set.id } ?? 0) + 1
        return Button {
            if completed { if set.string("kind") == "work" { esforcoID = set.id } }
            else { selecionada = set.id; ajustar = true }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: completed ? "checkmark.circle.fill" : "circle").foregroundStyle(completed ? Tema.marcaForte : Tema.tintaSuave)
                Text("\(kind) \(pos) · \(resumoSerieCompacto(set, lb: lb))").font(.subheadline).monospacedDigit()
                Spacer(minLength: 0)
            }.frame(minHeight: 44).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityLabel("\(kind) \(pos), \(resumoSerie(set, lb: lb)), \(completed ? "feita" : "ajustar")")
    }

    @ViewBuilder private var esforco: some View {
        if let set = allSets.first(where: { $0.id == esforcoID && $0.string("kind") == "work" }) {
            VStack(spacing: 6) {
                Text("Como foi a última série?").font(.caption).foregroundStyle(Tema.tintaSuave)
                HStack(spacing: 4) {
                    ForEach(0..<4) { index in
                        Button {
                            if conta.gravar([PushChange("sets", set.changing(["rir": .number(Double(3 - index))]))]) { esforcoID = nil }
                        } label: {
                            Text(["Fácil", "Ok", "Pesado", "No limite"][index]).font(.caption.weight(.semibold))
                                .lineLimit(1).minimumScaleFactor(0.5).frame(maxWidth: .infinity, minHeight: 44)
                                .background(Tema.sutil, in: Capsule())
                        }.buttonStyle(.plain).accessibilityAddTraits(set.number("rir") == Double(3 - index) ? .isSelected : [])
                    }
                }.accessibilityElement(children: .contain).accessibilityLabel("Esforço da série")
            }
        }
    }

    private var editor: some View {
        VStack(spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(current.string("kind") == "warmup" ? "Aquec." : "Trabalho").font(.caption.bold()).foregroundStyle(Tema.marcaForte)
                Text(exercise?.string("name") ?? "Exercício").font(.caption).lineLimit(1)
                Spacer(minLength: 0)
                Text(setLine).font(.caption).lineLimit(1).minimumScaleFactor(0.6)
            }
            HStack(alignment: .top, spacing: 12) {
                if weighted {
                    let factor = lb ? Progression.lbPerKg : 1
                    let load = Binding(get: { (current.number("load_kg") ?? 0) * factor }, set: { binding("load_kg").wrappedValue = $0 / factor })
                    let step = lb ? max(2.5, Progression.round((exercise?.number("increment_kg") ?? 2.5) * factor / 2.5) * 2.5) : exercise?.number("increment_kg") ?? 2.5
                    ControleSerie(titulo: "Carga, \(lb ? "lb" : "kg")", valor: load, limite: 1000 * factor, passo: step, decimal: true)
                }
                ControleSerie(titulo: time ? "Segundos" : "Repetições", valor: binding(time ? "seconds" : "reps"), limite: time ? 7200 : 500, passo: time ? 5 : 1)
            }
            Button { registrar() } label: {
                Label("Concluir série", systemImage: "checkmark").frame(maxWidth: .infinity)
            }.buttonStyle(.principalAnilha).controlSize(.large)
            if foco { Button("Fechar ajuste") { ajustar = false }.frame(minHeight: 44) }
        }
    }

    private var acoesFoco: some View {
        HStack(alignment: .center, spacing: 28) {
            Spacer(minLength: 0)
            if next != nil {
                VStack(spacing: 8) {
                    Button { if what != nil { registrar() } else { ajustar = true } } label: {
                        Image(systemName: what != nil ? "checkmark" : "pencil").font(.largeTitle.bold())
                            .foregroundStyle(Tema.sobreMarca).frame(width: 100, height: 100).background(Tema.acao, in: Circle())
                    }.buttonStyle(.plain).accessibilityLabel(what != nil ? "Série feita" : "Anotar série")
                    Text(what != nil ? "Série feita" : "Anotar série").font(.subheadline.bold()).accessibilityHidden(true)
                }
                VStack(spacing: 8) {
                    Button { ajustar = true } label: {
                        Image(systemName: "pencil").font(.title2).frame(width: 56, height: 56).background(Tema.sutil, in: Circle())
                    }.buttonStyle(.plain).accessibilityLabel("Ajustar")
                    Text("Ajustar").font(.caption).accessibilityHidden(true)
                }
            } else { concluirTreino }
            Spacer(minLength: 0)
        }
    }
    private var concluirTreino: some View {
        Button { confirmarFim = true } label: {
            Label("Concluir treino", systemImage: "checkmark").frame(maxWidth: .infinity)
        }.buttonStyle(.principalAnilha).controlSize(.large)
    }
    private func controlesDescanso(left: Int) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Button { mudarDescanso(-15) } label: {
                    Text("\u{2212}15 s").lineLimit(1).minimumScaleFactor(0.5).frame(maxWidth: .infinity)
                }
                Button { mudarDescanso(15) } label: {
                    Text("+15 s").lineLimit(1).minimumScaleFactor(0.5).frame(maxWidth: .infinity)
                }
                Button { mudarDescanso(nil) } label: {
                    Text("Pular").lineLimit(1).minimumScaleFactor(0.5).frame(maxWidth: .infinity)
                }
            }.buttonStyle(.glass).controlSize(.large).font(.subheadline)
            ProgressView(value: Double(left), total: max(Double(left), session.number("rest_duration_sec") ?? 90))
                .accessibilityLabel("Tempo de descanso restante").accessibilityValue("\(left) segundos")
            Button("Jogar uma mão") { abrirJogo(RestCardGame(rawValue: jogoPreferido) ?? .blackjack) }
                .font(.subheadline).frame(minHeight: 44)
        }
    }

    private func binding(_ key: String) -> Binding<Double> {
        Binding(get: { current.number(key) ?? 0 }, set: { value in
            let row = current.changing([key: .number(value)])
            rascunho = row; conta.guardarRascunho(row)
        })
    }
    /// Like discardSession on the site: the session, its items and sets become tombstones.
    private func descartar() {
        let changes = Workout.deleteSession(conta.dados, session: session.id, catalog: conta.catalogo)
        guard !changes.isEmpty, conta.gravar(changes) else { return }
        conta.sessaoAberta = nil
        dismiss()
        Task { await conta.atualizar() }
    }
    private func registrar() {
        guard let next, let value = current.number(time ? "seconds" : "reps"), value.isFinite,
              value > 0, value <= (time ? 7200 : 500), value == floor(value),
              !weighted || (current.number("load_kg").map { $0.isFinite && $0 >= 0 && $0 <= 1000 } ?? false)
        else { erro = "Ajuste a carga e as repetições antes de registrar."; ajustar = true; return }
        var values = ["load_kg", "reps", "seconds"].reduce(into: [String: JSONValue]()) { $0[$1] = current.fields[$1] ?? .null }
        if let kg = current.number("load_kg") { values["load_kg"] = .number(Progression.round(kg * 100) / 100) }
        let changes = Workout.complete(conta.dados, set: next.changing(values), now: Date.now.timeIntervalSince1970 * 1000)
        if !changes.isEmpty, conta.gravar(changes) {
            esforcoID = next.string("kind") == "work" ? next.id : nil
            selecionada = nil; rascunho = nil; ajustar = false; erro = nil
        }
    }
    private func mudarDescanso(_ delta: Double?) {
        let fields: [String: JSONValue]
        if let delta {
            fields = ["rest_duration_sec": .number(min(900, max(0, (session.number("rest_duration_sec") ?? 90) + delta)))]
        } else { fields = ["rest_started_at": .null, "rest_duration_sec": .null] }
        _ = conta.gravar([PushChange("sessions", session.changing(fields))])
    }
    private func atualizarDescanso(now: Double) {
        if jogos.update(startedAt: session.number("rest_started_at"), end: Workout.restEnd(session), now: now) {
            ajustar = false
        }
    }
    /// Abre a mesa por cima do treino. A mão continua a da mesa salva (`MesaDescansoStore`).
    private func abrirJogo(_ game: RestCardGame, demonstracao: Bool = false) {
        let now = Date.now.timeIntervalSince1970 * 1000
        atualizarDescanso(now: now)
        #if DEBUG
        if demonstracao {
            // Prints do CI: mesa fixa em memória, com uma mão de cada jogo no meio.
            let cards = [PlayingCard(rank: 8, suit: .hearts), PlayingCard(rank: 6, suit: .clubs),
                         PlayingCard(rank: 8, suit: .spades), PlayingCard(rank: 9, suit: .diamonds),
                         PlayingCard(rank: 13, suit: .hearts), PlayingCard(rank: 2, suit: .clubs),
                         PlayingCard(rank: 3, suit: .spades), PlayingCard(rank: 4, suit: .diamonds),
                         PlayingCard(rank: 5, suit: .hearts), PlayingCard(rank: 10, suit: .clubs)]
            var demo = MesaDescanso()
            demo.definirAposta(50)
            demo.distribuir(.poker, deck: CardDeck(cards: cards), agora: now)
            demo.segurar(0)
            demo.segurar(2)
            demo.distribuir(.blackjack, deck: CardDeck(cards: cards), agora: now)
            demo.jogo = game
            MesaDescansoStore.shared.usarDemonstracao(demo)
        }
        #endif
        jogos.open(game, now: now)
    }
}

private struct ControleSerie: View {
    let titulo: String
    @Binding var valor: Double
    let limite: Double
    let passo: Double
    var decimal = false
    var body: some View {
        VStack(spacing: 6) {
            Text(titulo).font(.caption).foregroundStyle(Tema.tintaSuave)
            HStack(spacing: 0) {
                Button { valor = max(0, valor - passo) } label: { Image(systemName: "minus").frame(width: 44, height: 52) }
                    .accessibilityLabel("Diminuir \(titulo)")
                TextField(titulo, value: $valor, format: .number.locale(Locale(identifier: "pt_BR")).precision(.fractionLength(decimal ? 0...2 : 0...0)))
                    .font(.title2.bold()).monospacedDigit().multilineTextAlignment(.center).minimumScaleFactor(0.5)
                    .keyboardType(decimal ? .decimalPad : .numberPad).frame(minWidth: 32, minHeight: 52)
                    .accessibilityLabel("Digitar \(titulo)")
                Button { valor = min(limite, valor + passo) } label: { Image(systemName: "plus").frame(width: 44, height: 52) }
                    .accessibilityLabel("Aumentar \(titulo)")
            }.buttonStyle(.plain).background(Tema.sutil, in: RoundedRectangle(cornerRadius: 16))
        }.frame(maxWidth: .infinity)
    }
}

private func resumoSerieCompacto(_ set: ReadRow, lb: Bool) -> String {
    let value = set.number("seconds") ?? set.number("reps")
    let amount = value.map { "\(Int($0))\(set.number("seconds") != nil ? " s" : "")" } ?? "Anotar"
    return set.number("load_kg").map { "\(formatarCarga($0, lb: lb)) x \(amount)" } ?? amount
}
