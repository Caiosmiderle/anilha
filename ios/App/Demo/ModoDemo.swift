#if DEBUG
import AnilhaCore
import SwiftUI

enum ModoDemo {
    static var solicitado: Bool { ProcessInfo.processInfo.arguments.contains("-demo") }
    static var tela: String {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-demo"), args.indices.contains(i + 1) else { return "invalida" }
        return args[i + 1]
    }
    static var textoGrande: Bool {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-demo-size"), args.indices.contains(i + 1) else { return false }
        return args[i + 1] == "accessibility3"
    }
    static let resposta = #"""
    {"avaliacao":"boa","summary":"Você manteve a execução e avançou no supino.","points":["As séries de trabalho ficaram dentro da faixa."],"proximaVez":[{"slot":0,"comentario":"Mantenha o controle na descida e registre o esforço."}],"adjustment":{"operation":"series","slot":0,"sets":3,"min":null,"max":null,"replacement":null}}
    """#
    static let revisao = #"""
    {"avaliacao":"ajustavel","resumo":"A ficha está coerente. Proteja as corridas importantes.","pontos":["O longão planejado no CRUNNING continua no dia escolhido."],"ajustes":[{"operation":"series","slot":0,"sets":3,"min":null,"max":null,"replacement":null,"motivo":"Distribua o volume com as outras fichas da semana."}]}
    """#

    static func dados(descanso: Bool, pronto: Bool = false) throws -> ReadData {
        // Fixed, fictional input. The normal engine calculates evolution and preview from it.
        let json = #"""
        {
          "profiles":[{"id":"demo-profile","unit":"kg","return_mode":"off","onboarding":{"goal":"hipertrofia"}}],
          "body_logs":[
            {"id":"demo-body1","local_date":"2026-11-02","weight_kg":80,"waist_cm":82},
            {"id":"demo-body2","local_date":"2026-11-09","weight_kg":80.2,"waist_cm":81.5},
            {"id":"demo-body3","local_date":"2026-11-12","weight_kg":80.4,"waist_cm":81}
          ],
          "records":[{"id":"demo-record","exercise_id":"supino-reto-barra","exercise_name":"Supino reto com barra","kind":"carga","value":25,"unit":"kg","local_date":"2026-11-12"}],
          "routines":[
            {"id":"demo-routine","name":"Peito e tríceps","split_key":"peito_triceps","position":0,"archived":false},
            {"id":"demo-back","name":"Costas e bíceps","split_key":"costas_biceps","position":1,"archived":false},
            {"id":"demo-legs","name":"Pernas","split_key":"perna","position":2,"archived":false}
          ],
          "routine_items":[
            {"id":"demo-ri","routine_id":"demo-routine","exercise_id":"supino-reto-barra","position":0,"sets":2,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90},
            {"id":"demo-ri2","routine_id":"demo-routine","exercise_id":"supino-inclinado-halteres","position":1,"sets":3,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90},
            {"id":"demo-ri3","routine_id":"demo-routine","exercise_id":"triceps-corda","position":2,"sets":3,"target_min":10,"target_max":15,"warmup_sets":0,"rest_sec":60},
            {"id":"demo-rib","routine_id":"demo-back","exercise_id":"puxada-frente","position":0,"sets":3,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90},
            {"id":"demo-ril","routine_id":"demo-legs","exercise_id":"agachamento-livre","position":0,"sets":3,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90}
          ],
          "plans":[{"id":"demo-plan","active_from":"2026-11-09","updated_at":1,"gym_per_week":3,"run_per_week":1,"days":[{"weekday":4,"kind":"gym","split_key":"peito_triceps","time":"18:30"}],"rules":{"no_legs_before_run":false},"params":{"focus":"equilibrado"}}],
          "runs":[{"id":"demo-run","local_date":"2026-11-12","source":"crunning","run_type":"leve","distance_km":5,"duration_sec":1800}],
          "external_plan_items":[{"id":"demo-run-plan","source":"crunning","kind":"corrida","local_date":"2026-11-14","status":"planejada","name":"Longão","run_type":"longo","distance_m":12000,"important":true}],
          "sessions":[
            {"id":"demo-prior","routine_id":"demo-routine","title":"Peito e tríceps","status":"done","detail":"full","local_date":"2026-11-09","started_at":1794243600000,"ended_at":1794246000000,"split_key":"peito_triceps"},
            {"id":"demo-done","routine_id":"demo-routine","title":"Peito e tríceps","status":"done","detail":"full","local_date":"2026-11-12","started_at":1794502800000,"ended_at":1794505200000,"split_key":"peito_triceps"},
            {"id":"demo-active","routine_id":"demo-routine","title":"Peito e tríceps","status":"active","detail":"full","local_date":"2026-11-12","started_at":1794506400000,"split_key":"peito_triceps"}
          ],
          "session_items":[
            {"id":"demo-ip","session_id":"demo-prior","exercise_id":"supino-reto-barra","position":0,"status":"done","planned_sets":2,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90},
            {"id":"demo-id","session_id":"demo-done","exercise_id":"supino-reto-barra","position":0,"status":"done","planned_sets":2,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90},
            {"id":"demo-ia","session_id":"demo-active","exercise_id":"supino-reto-barra","position":0,"status":"pending","planned_sets":2,"target_min":8,"target_max":12,"warmup_sets":0,"rest_sec":90}
          ],
          "sets":[
            {"id":"demo-sp1","item_id":"demo-ip","session_id":"demo-prior","exercise_id":"supino-reto-barra","kind":"work","position":0,"load_kg":20,"reps":8,"rir":2,"completed_at":1794243700000},
            {"id":"demo-sp2","item_id":"demo-ip","session_id":"demo-prior","exercise_id":"supino-reto-barra","kind":"work","position":1,"load_kg":20,"reps":8,"rir":2,"completed_at":1794243800000},
            {"id":"demo-sd1","item_id":"demo-id","session_id":"demo-done","exercise_id":"supino-reto-barra","kind":"work","position":0,"load_kg":25,"reps":10,"rir":2,"completed_at":1794502900000},
            {"id":"demo-sd2","item_id":"demo-id","session_id":"demo-done","exercise_id":"supino-reto-barra","kind":"work","position":1,"load_kg":20,"reps":10,"rir":2,"completed_at":1794503000000},
            {"id":"demo-sa1","item_id":"demo-ia","session_id":"demo-active","exercise_id":"supino-reto-barra","kind":"work","position":0,"load_kg":25,"reps":10,"rir":2,"completed_at":1794506500000},
            {"id":"demo-sa2","item_id":"demo-ia","session_id":"demo-active","exercise_id":"supino-reto-barra","kind":"work","position":1,"load_kg":25,"reps":10,"completed_at":null}
          ]
        }
        """#
        var tables = try JSONDecoder().decode([String: [ReadRow]].self, from: Data(json.utf8))
        let now = Date.now.timeIntervalSince1970 * 1000
        if let index = tables["sessions"]?.firstIndex(where: { $0.id == "demo-active" }) {
            tables["sessions"]?[index].fields["started_at"] = .number(now - 734000)
            if descanso {
                tables["sessions"]?[index].fields["rest_started_at"] = .number(now - (pronto ? 91000 : 12000))
                tables["sessions"]?[index].fields["rest_duration_sec"] = .number(90)
            }
        }
        if !descanso {
            if let index = tables["sets"]?.firstIndex(where: { $0.id == "demo-sa1" }) {
                tables["sets"]?[index].fields["completed_at"] = .null
            }
            let warmups = (0..<2).map { index in
                ReadRow(fields: ["id": .string("demo-w\(index)"), "item_id": .string("demo-ia"), "session_id": .string("demo-active"),
                                 "exercise_id": .string("supino-reto-barra"), "kind": .string("warmup"),
                                 "position": .number(Double(index)), "load_kg": .number(index == 0 ? 10 : 20), "reps": .number(6)])
            }
            for index in tables["sets", default: []].indices {
                if tables["sets"]?[index].string("item_id") == "demo-ia" {
                    // Read first: reading `tables` inside its own mutation is an exclusivity violation.
                    let position = tables["sets"]?[index].number("position") ?? 0
                    tables["sets"]?[index].fields["position"] = .number(position + 2)
                }
            }
            if let index = tables["session_items"]?.firstIndex(where: { $0.id == "demo-ia" }) {
                tables["session_items"]?[index].fields["warmup_sets"] = .number(2)
            }
            tables["sets", default: []].append(contentsOf: warmups)
        }
        tables["session_items", default: []].append(ReadRow(fields: ["id": .string("demo-ia2"), "session_id": .string("demo-active"),
            "exercise_id": .string("triceps-corda"), "position": .number(1), "status": .string("pending"),
            "planned_sets": .number(3), "target_min": .number(10), "target_max": .number(15), "rest_sec": .number(60)]))
        tables["sets", default: []].append(contentsOf: (0..<3).map { index in
            ReadRow(fields: ["id": .string("demo-tr\(index)"), "item_id": .string("demo-ia2"), "session_id": .string("demo-active"),
                "exercise_id": .string("triceps-corda"), "position": .number(Double(index)), "kind": .string("work"),
                "load_kg": .number(10), "reps": .number(12)])
        })
        return ReadData(tables: tables)
    }
}

struct DemoView: View {
    let tela: String
    @State private var resultado: Result<ContaStore, Error>
    init(tela: String) {
        self.tela = tela
        _resultado = State(initialValue: Result {
            try ContaStore.demonstracao(descanso: ["descanso", "blackjack", "poker", "proxima", "esforco"].contains(tela), pronto: tela == "proxima")
        })
    }
    var body: some View {
        NavigationStack {
            switch resultado {
            case .failure:
                ContentUnavailableView("Falha na demonstração", systemImage: "exclamationmark.triangle")
                    .task { fatalError("Fixture de demonstração inválida") }
            case .success(let conta):
                conteudo(conta)
            }
        }
        .tint(Tema.acao)
        .environment(\.locale, Locale(identifier: "pt_BR"))
        .dynamicTypeSize(ModoDemo.textoGrande ? .accessibility3 : .large)
        // Presentation-only. No login, refresh, save, notifications or analysis requests.
        .allowsHitTesting(false)
    }
    @ViewBuilder private func conteudo(_ conta: ContaStore) -> some View {
        switch tela {
        case "entrar": EntrarView(conta: conta)
        case "hoje": HojeView(conta: conta, today: "2026-11-12")
        case "fichas": FichasView(conta: conta)
        case "plano": PlanoView(conta: conta, today: "2026-11-12")
        case "voce": VoceView(conta: conta, pedirSaida: {})
        case "exercicios": ExerciciosView(conta: conta)
        case "exercicio": ExercicioView(conta: conta, exercicioID: "supino-reto-barra")
        case "perfil": PerfilTreinoView(conta: conta, today: "2026-11-12")
        case "ficha":
            if let ficha = conta.dados.routines.first { FichaView(conta: conta, ficha: ficha) }
        case "treino", "execucao", "descanso", "esforco": TreinoView(conta: conta, sessionID: "demo-active")
        case "treino-lista": TreinoView(conta: conta, sessionID: "demo-active", focoInicial: false)
        case "blackjack": TreinoView(conta: conta, sessionID: "demo-active", jogoInicial: .blackjack)
        case "poker": TreinoView(conta: conta, sessionID: "demo-active", jogoInicial: .poker)
        case "proxima": TreinoView(conta: conta, sessionID: "demo-active")
        case "resumo": TreinoView(conta: conta, sessionID: "demo-done")
        case "evolucao":
            List { EvolucaoTreino(conta: conta, sessionID: "demo-done") }
                .scrollContentBackground(.hidden).background { FundoAnilha() }.navigationTitle("Treino concluído")
        case "analise":
            List { CartaoAnaliseTreino(conta: conta, sessionID: "demo-done", mostrarEvolucao: false) }
                .scrollContentBackground(.hidden).background { FundoAnilha() }.navigationTitle("Treino concluído")
        case "revisao":
            List { CartaoRevisaoFicha(conta: conta, routineID: "demo-routine") }
                .scrollContentBackground(.hidden).background { FundoAnilha() }.navigationTitle("Revisão da ficha")
        case "historico": HistoricoView(conta: conta, today: "2026-11-12")
        case "historico-progresso": HistoricoView(conta: conta, parteInicial: "Progresso", today: "2026-11-12")
        case "historico-semanas": HistoricoView(conta: conta, parteInicial: "Semanas", today: "2026-11-12")
        case "historico-corpo": HistoricoView(conta: conta, parteInicial: "Corpo", today: "2026-11-12")
        case "calendario": CalendarioView(conta: conta, today: "2026-11-12", diaInicial: "2026-11-01")
        case "calendario-dia": CalendarioView(conta: conta, today: "2026-11-12")
        default:
            ContentUnavailableView("Tela de demonstração inválida", systemImage: "exclamationmark.triangle")
                .task { fatalError("Argumento -demo inválido") }
        }
    }
}
#endif
