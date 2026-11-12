import AnilhaCore
import SwiftUI

/// "Como fazer" de cada exercício, gerado de src/content (mesma regra do site, conferida por
/// src/content/__tests__/howtoIos.test.ts). Fica dentro do app: funciona sem rede, menos a mídia.
struct ComoFazer: Decodable, Sendable {
    struct Midia: Decodable, Sendable {
        let frames: [String]?
        let url: String?
        let fonte: String
        let autor: String
        let licenca: String
        let licencaUrl: String
        let origem: String?
        let atribuicao: String?
    }
    struct Video: Decodable, Sendable {
        let id: String
        let start: Double?
        let end: Double?
    }
    let tips: [String]
    let errors: [String]
    let media: Midia?
    let video: Video?

    static let todos: [String: ComoFazer] = {
        guard let url = Bundle.main.url(forResource: "howto", withExtension: "json"),
              let dados = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: ComoFazer].self, from: dados)) ?? [:]
    }()

    /// O player sem cookies até tocar, como no site (youtube-nocookie).
    var linkVideo: URL? {
        guard let video else { return nil }
        var c = URLComponents(string: "https://www.youtube-nocookie.com/embed/\(video.id)")
        var q = [URLQueryItem(name: "rel", value: "0"), URLQueryItem(name: "playsinline", value: "1")]
        if let s = video.start { q.append(URLQueryItem(name: "start", value: String(Int(max(0, s))))) }
        if let e = video.end { q.append(URLQueryItem(name: "end", value: String(Int(max(0, e))))) }
        c?.queryItems = q
        return c?.url
    }
}

struct OpcaoCatalogo: Identifiable, Sendable {
    let id: String
    let nome: String
}

enum Catalogo {
    static let grupos: [OpcaoCatalogo] = [
        .init(id: "costas", nome: "Costas"), .init(id: "peito", nome: "Peito"), .init(id: "pernas", nome: "Pernas"),
        .init(id: "ombros", nome: "Ombros"), .init(id: "bracos", nome: "Braços"), .init(id: "core", nome: "Abdômen"),
    ]
    static let equipamentos: [OpcaoCatalogo] = [
        .init(id: "halteres", nome: "Halteres"), .init(id: "barra", nome: "Barra e anilhas"), .init(id: "polia", nome: "Polias"),
        .init(id: "maquina", nome: "Máquinas"), .init(id: "peso_corporal", nome: "Peso corporal"),
        .init(id: "kettlebell", nome: "Kettlebell"), .init(id: "barra_fixa", nome: "Barra fixa"),
    ]
    static let articulacoes = ["ombro", "cotovelo", "joelho", "lombar", "punho"]
    static func nomeGrupo(_ id: String?) -> String { grupos.first { $0.id == id }?.nome ?? "Outro" }
    static func nomeEquipamento(_ id: String?) -> String { equipamentos.first { $0.id == id }?.nome ?? "Outro" }
    static func medida(_ id: String?) -> String {
        switch id {
        case "reps": "Só repetições"
        case "time": "Tempo"
        default: "Carga e repetições"
        }
    }
}

/// Catálogo: busca, filtro por grupo e por máquinas, e criar exercício próprio.
struct ExerciciosView: View {
    let conta: ContaStore
    @State private var busca = ""
    @State private var grupo = "todos"
    @State private var soMaquinas = false
    @State private var criando = false

    private var lista: [ReadRow] {
        let termo = busca.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pt_BR"))
        return conta.dados.exercises(catalog: conta.catalogo).values
            .filter { $0.bool("archived") != true }
            .filter { grupo == "todos" || $0.string("primary_group") == grupo }
            .filter { !soMaquinas || ["maquina", "polia"].contains($0.string("equipment") ?? "") }
            .filter {
                termo.isEmpty || ($0.string("name") ?? "")
                    .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pt_BR"))
                    .contains(termo)
            }
            .sorted { ($0.string("name") ?? "").localizedStandardCompare($1.string("name") ?? "") == .orderedAscending }
    }

    var body: some View {
        let lista = lista
        List {
            Section {
                Picker("Grupo", selection: $grupo) {
                    Text("Todos").tag("todos")
                    ForEach(Catalogo.grupos) { Text($0.nome).tag($0.id) }
                }
                Toggle("Só máquinas e polias", isOn: $soMaquinas)
            }
            Section("\(lista.count) exercícios") {
                ForEach(lista) { ex in
                    NavigationLink { ExercicioView(conta: conta, exercicioID: ex.id) } label: {
                        HStack(spacing: 12) {
                            DiscoExercicio(grupo: ex.string("primary_group"))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ex.string("name") ?? "Exercício").font(.body.weight(.medium))
                                Text(Catalogo.nomeEquipamento(ex.string("equipment"))
                                     + (ex.string("id")?.hasPrefix("custom-") == true ? " · seu" : ""))
                                    .font(.caption).foregroundStyle(Tema.tintaSuave)
                            }
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { FundoAnilha() }
        .searchable(text: $busca, prompt: "Buscar exercício")
        .navigationTitle("Exercícios").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { criando = true } label: { Label("Criar exercício", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $criando) { CriarExercicioView(conta: conta) }
    }
}

/// Detalhe: o que trabalha, como fazer (mídia, dicas, erros, vídeo) e a última carga.
struct ExercicioView: View {
    let conta: ContaStore
    let exercicioID: String
    @State private var quadro = 0

    private var ex: ReadRow? { conta.dados.exercises(catalog: conta.catalogo)[exercicioID] }

    var body: some View {
        List {
            if let ex {
                let como = ComoFazer.todos[exercicioID]
                CabecalhoAnilha(titulo: ex.string("name") ?? "Exercício", selo: Catalogo.nomeGrupo(ex.string("primary_group")), icone: "dumbbell")
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
                Section {
                    LabeledContent("Equipamento", value: Catalogo.nomeEquipamento(ex.string("equipment")))
                    LabeledContent("Como medir", value: Catalogo.medida(ex.string("measure")))
                    LabeledContent("Tipo", value: ex.bool("compound") == true ? "Composto" : "Isolado")
                    if let ultima = conta.dados.lastLoads[exercicioID] {
                        LabeledContent("Última carga", value: "\(ultima.kg.formatted(.number.precision(.fractionLength(0...1)))) kg em \(dataCurta(ultima.date))")
                    }
                    if let nota = ex.string("note"), !nota.isEmpty {
                        Text("Sua nota: \(nota)").font(.subheadline).foregroundStyle(Tema.tintaSuave)
                    }
                }
                if let como {
                    if let midia = como.media { secaoMidia(midia) }
                    Section("Como fazer") {
                        ForEach(como.tips, id: \.self) { Label($0, systemImage: "checkmark.circle").font(.subheadline) }
                    }
                    if !como.errors.isEmpty {
                        Section("Erros comuns") {
                            ForEach(como.errors, id: \.self) { Label($0, systemImage: "xmark.circle").font(.subheadline).foregroundStyle(Tema.perigo) }
                        }
                    }
                    if let link = como.linkVideo {
                        Section {
                            Link(destination: link) { Label("Ver o vídeo", systemImage: "play.rectangle") }
                        } footer: {
                            Text("Abre o YouTube no modo sem cookies. A partir daí, o Google trata os dados do player.")
                        }
                    }
                } else {
                    Section {
                        Link(destination: URL(string: "https://www.youtube.com/results?search_query=\((ex.string("name") ?? "").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")+como+fazer")!) {
                            Label("Buscar como fazer no YouTube", systemImage: "magnifyingglass")
                        }
                    }
                }
            } else {
                Text("Exercício não encontrado.").foregroundStyle(Tema.tintaSuave)
            }
        }
        .scrollContentBackground(.hidden)
        .background { FundoAnilha() }
        .navigationTitle("Exercício").navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func secaoMidia(_ m: ComoFazer.Midia) -> some View {
        let quadros = m.frames ?? (m.url.map { [$0] } ?? [])
        Section {
            if !quadros.isEmpty {
                TimelineView(.periodic(from: .now, by: 1.2)) { contexto in
                    let i = Int(contexto.date.timeIntervalSince1970 / 1.2) % quadros.count
                    AsyncImage(url: URL(string: quadros[i])) { fase in
                        switch fase {
                        case .success(let imagem): imagem.resizable().scaledToFit()
                        case .failure: Label("Sem a imagem agora", systemImage: "wifi.slash").foregroundStyle(Tema.tintaSuave)
                        default: ProgressView()
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 200, maxHeight: 260)
                    .accessibilityLabel("Demonstração do movimento, \(quadros.count) quadros alternando")
                }
            }
        } footer: {
            // Atribuição pedida pela licença, como em Créditos e licenças no site.
            Text("\(m.atribuicao ?? m.fonte). \(m.autor), \(m.licenca).")
        }
    }
}

/// Criar exercício próprio: os mesmos campos e padrões do site (Library.tsx).
struct CriarExercicioView: View {
    let conta: ContaStore
    @Environment(\.dismiss) private var fechar
    @State private var nome = ""
    @State private var grupo = "costas"
    @State private var equipamento = "halteres"
    @State private var medida = "weight_reps"
    @State private var composto = false
    @State private var articulacoes: Set<String> = []
    @State private var erro: String?

    private static let musculoPadrao = ["costas": "costas", "peito": "peito", "pernas": "quadriceps",
                                        "ombros": "ombro_lateral", "bracos": "biceps", "core": "abdomen"]
    private static let padraoMovimento = ["costas": "puxar_horizontal", "peito": "empurrar_horizontal", "pernas": "agachamento",
                                          "ombros": "elevacao_lateral", "bracos": "rosca", "core": "core_flexao"]

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nome, por exemplo Remada na máquina Matrix", text: $nome)
                    .onChange(of: nome) { _, novo in if novo.count > 80 { nome = String(novo.prefix(80)) } }
                Picker("Grupo principal", selection: $grupo) {
                    ForEach(Catalogo.grupos) { Text($0.nome).tag($0.id) }
                }
                Picker("Equipamento", selection: $equipamento) {
                    ForEach(Catalogo.equipamentos) { Text($0.nome).tag($0.id) }
                }
                Picker("Como medir", selection: $medida) {
                    Text("Carga e reps").tag("weight_reps")
                    Text("Só reps").tag("reps")
                    Text("Tempo").tag("time")
                }
                .pickerStyle(.segmented)
                Toggle(isOn: $composto) {
                    VStack(alignment: .leading) {
                        Text("Exercício composto")
                        Text("Vários músculos e articulações: entra primeiro no treino.").font(.caption).foregroundStyle(Tema.tintaSuave)
                    }
                }
                Section("Articulações que ele carrega") {
                    ForEach(Catalogo.articulacoes, id: \.self) { a in
                        Toggle(a.prefix(1).uppercased() + a.dropFirst(), isOn: Binding(
                            get: { articulacoes.contains(a) },
                            set: { if $0 { articulacoes.insert(a) } else { articulacoes.remove(a) } }))
                    }
                }
                if let erro { Text(erro).foregroundStyle(Tema.perigo) }
            }
            .navigationTitle("Criar exercício").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) { Button("Criar") { criar() } }
            }
        }
    }

    private func criar() {
        let limpo = nome.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpo.isEmpty else { erro = "Dê um nome"; return }
        let id = "custom-\(UUID().uuidString.lowercased())"
        let row = ReadRow(fields: [
            "id": .string(id), "deleted": .bool(false), "name": .string(String(limpo.prefix(80))),
            "primary_group": .string(grupo), "secondary_groups": .array([]),
            "muscles": .array([.string(Self.musculoPadrao[grupo] ?? grupo)]), "secondary_muscles": .array([]),
            "equipment": .string(equipamento), "measure": .string(medida),
            "increment_kg": .number(["maquina", "polia"].contains(equipamento) ? 2.5 : 2),
            "joints": .array(Catalogo.articulacoes.filter { articulacoes.contains($0) }.map { .string($0) }),
            "compound": .bool(composto), "bodyweight": .bool(medida != "weight_reps"),
            "pattern": .string(Self.padraoMovimento[grupo] ?? "rosca"), "progression_hint": .null,
            "note": .null, "builtin": .bool(false), "archived": .bool(false),
        ])
        if conta.gravar([PushChange("exercises", row)]) { fechar() } else { erro = "Não foi possível salvar. Tente de novo." }
    }
}
