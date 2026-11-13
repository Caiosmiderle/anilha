import Foundation

/// Local tools and wire protocol from src/agent. No model output writes to the database.
public enum AgentChat {
    public static let siteNotice = "Gerar plano e criar ficha ainda precisam do site. Nenhuma mudança foi salva."
    public static func rows(_ rows: [ReadRow]) -> JSONValue { .array(rows.map { .object($0.fields) }) }
    static func strings(_ row: ReadRow, _ key: String) -> [String] {
        if case .array(let a) = row.fields[key] { return a.compactMap { if case .string(let s) = $0 { return s }; return nil } }
        return row.string(key).map { [$0] } ?? []
    }
    static func fmt(_ n: Double) -> String { n == floor(n) ? String(Int(n)) : String(n) }
    static func focuses(_ p: ReadRow) -> [String] {
        var seen: Set<String> = []
        return strings(p, "focus").filter { $0 != "equilibrado" && WorkoutAnalysis.focus.contains($0) && seen.insert($0).inserted }
    }
    public static func context(_ data: ReadData, consent: ReadRow?, today: String) throws -> ReadRow {
        let end = LocalDay.add(today, 6 - LocalDay.weekday(today))
        let plan = data.active("plans").filter { ($0.string("active_from") ?? "") <= end }.sorted {
            let a = $0.string("active_from") ?? "", b = $1.string("active_from") ?? ""
            return a == b ? ($0.number("updated_at") ?? 0) > ($1.number("updated_at") ?? 0) : a > b
        }.first ?? ReadRow(fields: [:])
        let profile = data.active("profiles").first ?? ReadRow(fields: [:])
        var params = profile.fields["onboarding"] == nil || profile.fields["onboarding"] == .null ? plan.object("params") : profile.object("onboarding")
        guard !params.fields.isEmpty else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        if params.string("split_style") == nil {
            let days = params.number("gym_days") ?? 0, legs = focuses(params).contains("pernas"), older = params.string("age_range") == "60+"
            let style = legs && !older && days >= 3 ? "grupos" : days <= 3 ? "corpo_inteiro" : "superior_inferior"
            let count = legs && older ? (days <= 3 ? 2 : 4) : legs && days >= 3 ? 4 : days <= 3 ? 2 : 3
            params.fields["split_style"] = .string(style); params.fields["fichas"] = .number(Double(count))
        }
        let fichas = data.routines.map { r in
            ReadRow(fields: ["id": .string(r.id), "name": r.fields["name"] ?? .string("Ficha"), "per_week": .number(frequency(r, plan: plan)),
                "items": rows(data.items(r.id).map { item in ReadRow(fields: Dictionary(uniqueKeysWithValues: ["exercise_id", "sets", "target_min", "target_max", "rest_sec"].map { ($0, item.fields[$0] ?? .null) })) })])
        }
        let volume = Self.volume(fichas)
        // Health is not inferred from cached profile fields. The History consent gate owns it.
        return ReadRow(fields: ["params": .object(params.fields), "fichas": rows(fichas), "volume": .object(volume.values.mapValues(JSONValue.number)),
            "health": .bool(History.healthOn(consent)), "returnMode": .bool(returning(data, profile: profile, today: today))])
    }
    static func frequency(_ r: ReadRow, plan: ReadRow) -> Double {
        let isPlan = r.string("origin").map { $0 == "plano" } ?? (!r.id.hasPrefix("pronta-") && !r.id.hasPrefix("recebida-") && (r.string("reason") ?? "").range(of: "^\\d+ exercícios, \\d+ séries de trabalho\\.$", options: .regularExpression) != nil)
        guard !plan.fields.isEmpty, isPlan else { return 0 }
        let rotation = strings(plan.object("rules"), "rotation")
        if !rotation.isEmpty { return (plan.number("gym_per_week") ?? 0) / Double(rotation.count) * Double(rotation.filter { $0 == r.string("split_key") }.count) }
        return Double(plan.array("days").filter { $0.string("kind") == "gym" && $0.string("split_key") == r.string("split_key") }.count)
    }
    static func returning(_ data: ReadData, profile: ReadRow, today: String) -> Bool {
        let setting = profile.string("return_mode") ?? "auto"
        if setting == "off" { return false }
        if setting == "on" { return today <= LocalDay.add(profile.string("return_started_on") ?? today, 27) }
        let dates = Set((data.active("sessions").filter { $0.string("status") == "done" } + data.active("runs")).compactMap { $0.string("local_date") }.filter { $0 <= today }).sorted()
        guard let last = dates.last else { return false }
        if LocalDay.distance(last, today) > 21 { return true }
        for i in dates.indices.reversed() where i > 0 {
            if LocalDay.distance(dates[i - 1], dates[i]) > 21 { return today <= LocalDay.add(dates[i], 27) }
        }
        return false
    }
    static func volume(_ fichas: [ReadRow]) -> (order: [String], values: [String: Double]) {
        var order: [String] = [], values: [String: Double] = [:]
        for f in fichas { for item in f.array("items") {
            guard let group = WorkoutAnalysis.riskRules.object("groups").string(item.string("exercise_id") ?? "") else { continue }
            if values[group] == nil { order.append(group) }
            values[group, default: 0] += (item.number("sets") ?? 0) * (f.number("per_week") ?? 1)
        } }
        return (order, values)
    }
    static func label(_ group: String) -> String { WorkoutAnalysis.riskRules.object("labels").string(group) ?? group }
    public static func contextText(_ c: ReadRow, catalog: [ReadRow]) -> String {
        let p = c.object("params"), health = c.bool("health") == true
        let goals = ["hipertrofia": "ganhar massa", "emagrecimento": "emagrecer", "condicionamento": "condicionamento", "saude": "saúde geral", "forca": "força", "corrida": "correr provas"]
        let focus = focuses(p), count = p.number("fichas").flatMap { $0 == 0 ? nil : ", \(fmt($0)) fichas" } ?? ""
        var lines = ["Pessoa: \(p.string("first_name") ?? ""). Objetivo: \(goals[p.string("goal") ?? ""] ?? ""). Nível: \(p.string("level") ?? ""). \(fmt(p.number("gym_days") ?? 0)) dias de academia por semana, \(fmt(p.number("minutes") ?? 0)) min por treino.",
            "Foco: \(focus.isEmpty ? "equilibrado" : focus.joined(separator: ", ")). Divisão: \(p.string("split_style") ?? "automática")\(count)."]
        if let gender = p.string("gender"), gender != "nao_informar", !gender.isEmpty { lines.append("Gênero informado: \(gender).") }
        lines.append("Modo retorno: \(c.bool("returnMode") == true ? "ligado" : "desligado"). Dados de saúde: \(health ? "permitidos" : "não permitidos").")
        let joints = strings(p, "spare_joints")
        if health && !joints.isEmpty { lines.append("Articulações a poupar: \(joints.joined(separator: ", ")).") }
        lines += ["", "Fichas em uso:"]
        for f in c.array("fichas") {
            let items = f.array("items").map { i in
                let id = i.string("exercise_id") ?? ""
                return "\(id) (\(name(id, catalog))) \(fmt(i.number("sets") ?? 0))x\(fmt(i.number("target_min") ?? 0))-\(fmt(i.number("target_max") ?? 0)), descanso \(fmt(i.number("rest_sec") ?? 0)) s"
            }.joined(separator: "; ")
            lines.append("- ficha_id \(f.id), \"\(f.string("name") ?? "")\": \(items)")
        }
        let order = volume(c.array("fichas")).order
        lines += ["", "Séries por semana no plano: " + order.map { "\(label($0).lowercased()) \(fmt(c.object("volume").number($0) ?? 0))" }.joined(separator: ", ") + "."]
        return lines.joined(separator: "\n")
    }
    static func name(_ id: String, _ catalog: [ReadRow]) -> String { catalog.first { $0.id == id }?.string("name") ?? id }
    static func outcome(_ text: String, proposal: ReadRow? = nil, level: Double = 0) -> ReadRow {
        ReadRow(fields: ["result": .string(text), "proposal": proposal.map { .object($0.fields) } ?? .null, "level": .number(level)])
    }
    public static func execute(_ tool: String, input i: ReadRow, context c: ReadRow, catalog: [ReadRow]) -> ReadRow {
        switch tool {
        case "editar_ficha": return edit(i, context: c, catalog: catalog)
        case "substitutos": return outcome(substitutes(i, params: c.object("params"), catalog: catalog), level: 1)
        case "propor_plano", "nova_ficha": return outcome(siteNotice, proposal: ReadRow(fields: ["kind": .string("site"), "text": .string(siteNotice)]))
        case "mostrar_onde":
            guard let text = places.string(i.string("lugar") ?? "") else { return outcome("Lugar desconhecido: \(i.string("lugar") ?? "undefined").") }
            return outcome("O app mostra à pessoa um atalho para: \(text) No iPhone, algumas funções ainda precisam do site.", proposal: ReadRow(fields: ["kind": .string("lugar"), "place": i.fields["lugar"] ?? .null, "text": .string(text)]), level: 1)
        case "nao_consigo": return outcome("Este pedido ainda não pode ser atendido no iPhone. Não foi enviado à equipe. Use Fale com o Anilha no site.", proposal: ReadRow(fields: ["kind": .string("site"), "path": .string("/mensagens"), "text": .string("Para enviar este pedido à equipe, abra Fale com o Anilha no site.")]), level: 3)
        default: return outcome("Ferramenta desconhecida: \(tool).")
        }
    }
    static let places: ReadRow = {
        let url = Bundle.module.url(forResource: "chat-places", withExtension: "json")!
        return try! JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }()
    static func integer(_ r: ReadRow, _ key: String, _ min: Double, _ max: Double) -> Bool {
        guard let n = r.number(key) else { return false }; return n.isFinite && n == floor(n) && n >= min && n <= max
    }
    static func edit(_ i: ReadRow, context c: ReadRow, catalog: [ReadRow]) -> ReadRow {
        func fail(_ text: String) -> ReadRow { outcome("Não foi: " + text) }
        guard let f = c.array("fichas").first(where: { $0.id == i.string("ficha_id") }) else { return fail("não existe ficha com id \(i.string("ficha_id") ?? "undefined"). Veja os ids no contexto.") }
        let changes = i.array("mudancas")
        guard case .array(let raw) = i.fields["mudancas"], !raw.isEmpty else { return fail("diga o que muda nesta ficha.") }
        guard raw.count == changes.count else { return fail("mudança de ficha desconhecida.") }
        let ids = Set(catalog.map(\.id)), existing = Set(f.array("items").compactMap { $0.string("exercise_id") })
        var items = f.array("items")
        for m in changes {
            let type = m.string("tipo") ?? ""
            guard ["trocar", "adicionar", "remover", "series", "repeticoes", "descanso", "mover"].contains(type) else { return fail("mudança de ficha desconhecida.") }
            let at = items.firstIndex { $0.string("exercise_id") == m.string("exercicio_id") }
            if type != "adicionar" && at == nil { return fail("\(name(m.string("exercicio_id") ?? "null", catalog)) não está em \(f.string("name") ?? "").") }
            if ["trocar", "adicionar"].contains(type) && !ids.contains(m.string("novo_exercicio_id") ?? "") { return fail("use só exercícios do catálogo.") }
            if (type == "series" || (type == "adicionar" && m.fields["series"] != nil && m.fields["series"] != .null)) && !integer(m, "series", 1, 12) { return fail("as séries precisam ser um número inteiro de 1 a 12.") }
            if ["repeticoes", "adicionar"].contains(type) {
                for key in ["repeticoes_min", "repeticoes_max"] where m.fields[key] != nil && m.fields[key] != .null {
                    if !integer(m, key, 1, 3600) { return fail("as repetições precisam ser inteiras, de 1 a 3600.") }
                }
            }
            if type == "descanso" && !integer(m, "descanso_segundos", 0, 600) { return fail("o descanso precisa ser um número inteiro de 0 a 600 segundos.") }
            if type == "mover" && !integer(m, "posicao", 1, Double(items.count)) { return fail("a posição precisa ser um número inteiro de 1 a \(items.count).") }
            if let at {
                switch type {
                case "trocar": items[at].fields["exercise_id"] = m.fields["novo_exercicio_id"]
                case "remover": items.remove(at: at)
                case "series": items[at].fields["sets"] = m.fields["series"]
                case "repeticoes":
                    if let n = m.number("repeticoes_min") { items[at].fields["target_min"] = .number(n) }
                    if let n = m.number("repeticoes_max") { items[at].fields["target_max"] = .number(n) }
                case "descanso": items[at].fields["rest_sec"] = m.fields["descanso_segundos"]
                case "mover": let row = items.remove(at: at); items.insert(row, at: Int(m.number("posicao")!) - 1)
                default: break
                }
            }
            if type == "adicionar" { items.append(ReadRow(fields: ["exercise_id": m.fields["novo_exercicio_id"]!, "sets": .number(m.number("series") ?? 3), "target_min": .number(m.number("repeticoes_min") ?? 10), "target_max": .number(m.number("repeticoes_max") ?? 15), "rest_sec": .number(90)])) }
        }
        if let invalid = invalidItems(items, existing: existing, ids: ids) { return fail(invalid) }
        let after = f.changing(["items": rows(items)]), fichas = c.array("fichas")
        let beforeVolume = volume(fichas), afterVolume = volume(fichas.map { $0.id == f.id ? after : $0 })
        let order = beforeVolume.order + afterVolume.order.filter { !beforeVolume.order.contains($0) }
        let changesVolume = order.compactMap { g -> ReadRow? in
            let a = beforeVolume.values[g] ?? 0, b = afterVolume.values[g] ?? 0
            return a == b ? nil : ReadRow(fields: ["group": .string(g), "before": .number(a), "after": .number(b)])
        }
        // Reuse the part C risk engine, supplying the complete edited ficha and its frequency.
        let routines = fichas.map { $0.changing(["origin": .string("plano"), "split_key": .string($0.id)]) }
        let days = fichas.flatMap { f -> [ReadRow] in [ReadRow(fields: ["kind": .string("gym"), "split_key": .string(f.id), "frequency": f.fields["per_week"] ?? .number(1)])] }
        let binding = ReadRow(fields: ["params": c.fields["params"] ?? .null, "routine": .object(routines.first { $0.id == f.id }!.fields), "items": rows([ReadRow(fields: [:])]),
            "routines": rows(routines), "allRoutineItems": rows(fichas.flatMap { f in f.array("items").map { $0.changing(["routine_id": .string(f.id)]) } }),
            "plan": .object(["id": .string("chat"), "days": rows(days)])])
        let risks = WorkoutAnalysis.risks(ReadRow(fields: ["slot": .number(0)]), binding: binding, afterItems: items)
        let summary = items.map { "\(name($0.string("exercise_id") ?? "", catalog)) \(fmt($0.number("sets") ?? 0))x\(fmt($0.number("target_min") ?? 0))-\(fmt($0.number("target_max") ?? 0))" }.joined(separator: "; ")
        let volumeText = changesVolume.isEmpty ? "O volume da semana não muda." : "Séries por semana que mudam: " + changesVolume.map { "\(label($0.string("group")!)) \(fmt($0.number("before")!)) para \(fmt($0.number("after")!))" }.joined(separator: ", ") + "."
        let riskText = risks.isEmpty ? "Avisos: nenhum." : "Avisos (explique cada um e deixe a pessoa decidir):\n" + risks.map { "- \($0.string("text") ?? "") Fonte: \($0.string("source") ?? "")" }.joined(separator: "\n")
        return outcome(["Proposta montada, ainda não salva: a pessoa revisa no cartão e toca em Salvar.", "\(f.string("name") ?? "") depois: \(summary).", volumeText, riskText].joined(separator: "\n"),
            proposal: ReadRow(fields: ["kind": .string("ficha"), "before": .object(f.fields), "after": .object(after.fields), "volume": rows(changesVolume), "risks": rows(risks)]), level: 2)
    }
    static func substitutes(_ i: ReadRow, params: ReadRow, catalog: [ReadRow]) -> String {
        let id = i.string("exercicio_id") ?? "undefined"
        guard let e = catalog.first(where: { $0.id == id }) else { return "Não foi: exercício \(id) fora do catálogo." }
        let reason = i.string("por_que"), available = strings(params, "equipment"), restrictEquipment = params.fields["equipment"] != nil
        func ranked(spare: Bool) -> [ReadRow] {
            let scored = catalog.enumerated().compactMap { index, x -> (ReadRow, Double, Int)? in
                guard x.id != id else { return nil }
                let equipment = x.string("equipment") ?? ""
                if ["sem_aparelho", "ocupado"].contains(reason ?? "") && equipment == e.string("equipment") { return nil }
                if restrictEquipment && equipment != "peso_corporal" && !available.contains(equipment) { return nil }
                if spare && !Set(strings(x, "joints")).isDisjoint(with: strings(e, "joints")) { return nil }
                var score: Double = 0
                if x.fields["pattern"] == e.fields["pattern"] { score += 4 }
                if let muscle = strings(x, "muscles").first, muscle == strings(e, "muscles").first { score += 2 }
                if x.fields["primary_group"] == e.fields["primary_group"] { score += 1 }
                if x.fields["compound"] == e.fields["compound"] { score += 0.5 }
                if x.fields["measure"] == e.fields["measure"] { score += 0.25 }
                return score >= 2 ? (x, score, index) : nil
            }
            return scored.sorted { $0.1 == $1.1 ? $0.2 < $1.2 : $0.1 > $1.1 }.prefix(4).map(\.0)
        }
        let spared = ranked(spare: reason == "dor"), options = spared.isEmpty ? ranked(spare: false) : spared
        guard !options.isEmpty else { return "Nenhum substituto para \(name(id, catalog)) com o que a pessoa tem." }
        let list = options.map { "\($0.id) (\(name($0.id, catalog)))" }.joined(separator: ", ")
        return !spared.isEmpty || reason != "dor" ? "Substitutos de \(name(id, catalog)), melhores primeiro: \(list). Para propor a troca, use editar_ficha."
            : "Todos os substitutos de \(name(id, catalog)) usam a mesma articulação: \(list). Com dor, o indicado é um profissional avaliar antes; se a pessoa quiser, proponha tirar o exercício da ficha."
    }
    public static func binding(_ data: ReadData, routineID: String, today: String) throws -> ReadRow { try RoutineReview.binding(data, routineID: routineID, today: today) }
    static func invalidItems(_ items: [ReadRow], existing: Set<String>, ids: Set<String>) -> String? {
        for item in items {
            if !ids.contains(item.string("exercise_id") ?? "") && !existing.contains(item.string("exercise_id") ?? "") { return "Use só exercícios do catálogo." }
            if !integer(item, "sets", 1, 12) { return "As séries precisam ser um número inteiro de 1 a 12." }
            if !integer(item, "target_min", 1, 3600) || !integer(item, "target_max", item.number("target_min") ?? 1, 3600) { return "As repetições precisam ser inteiras, de 1 a 3600, com o máximo maior ou igual ao mínimo." }
            if !integer(item, "rest_sec", 0, 600) { return "O descanso precisa ser um número inteiro de 0 a 600 segundos." }
        }
        return nil
    }
    public static func changes(_ proposal: ReadRow, binding: ReadRow, catalog: [ReadRow], newID: () -> String = Workout.id) throws -> [PushChange] {
        let routine = binding.object("routine"), before = proposal.object("before"), after = proposal.object("after")
        guard proposal.string("kind") == "ficha", routine.id == before.id, after.id == before.id, !routine.deleted, routine.bool("archived") != true else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        let existing = Set(binding.array("routineItems").compactMap { $0.string("exercise_id") })
        guard invalidItems(after.array("items"), existing: existing, ids: Set(catalog.map(\.id))) == nil else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        return WorkoutAnalysis.fichaChanges(routineID: routine.id, old: binding.array("routineItems"), after: after.array("items"), newID: newID)
    }
    /// Display only. Wire blocks must be kept intact for tool_use/tool_result pairing.
    public static func displayText(_ text: String) -> String {
        text.replacingOccurrences(of: "[\\x{2013}\\x{2014}]", with: ", ", options: .regularExpression)
            .replacingOccurrences(of: "[\\p{Extended_Pictographic}\\x{FE0F}\\x{200D}]", with: "", options: .regularExpression)
    }
    public struct Turn: Sendable {
        public var messages: [ReadRow]
        public var text: String
        public var proposals: [ReadRow]
    }
    /// Same four-round protocol and context refresh as runTurn in the PWA. Injected model for tests.
    @MainActor public static func run(history: [ReadRow], ask: String, context: ReadRow, withContext: Bool, catalog: [ReadRow],
        stage: @MainActor (String) -> Void, call: @MainActor ([ReadRow]) async throws -> ReadRow) async throws -> Turn {
        var messages = history + [ReadRow(fields: ["role": .string("user"), "content": .string(withContext ? contextText(context, catalog: catalog) + "\n\nPedido: " + ask : ask)])]
        var proposals: [ReadRow] = []
        for _ in 0..<4 {
            try Task.checkCancellation(); stage("Lendo seu pedido")
            let reply = try await call(messages)
            try Task.checkCancellation()
            guard case .array = reply.fields["assistant"] else { throw ReadSync.Failure.invalidPage }
            messages.append(ReadRow(fields: ["role": .string("assistant"), "content": reply.fields["assistant"]!]))
            let uses = reply.array("assistant").filter { $0.string("type") == "tool_use" }
            if reply.string("stop") != "tool_use" || uses.isEmpty { return Turn(messages: messages, text: displayText(reply.string("text") ?? "Não veio uma resposta. Tente novamente."), proposals: proposals) }
            var results: [ReadRow] = []
            for use in uses {
                guard let id = use.string("id"), let name = use.string("name") else { throw ReadSync.Failure.invalidPage }
                stage(name == "editar_ficha" ? "Montando proposta" : "Consultando ferramenta local")
                let out = execute(name, input: use.object("input"), context: context, catalog: catalog)
                let proposal = out.object("proposal")
                if !proposal.fields.isEmpty { proposals.append(proposal) }
                results.append(ReadRow(fields: ["type": .string("tool_result"), "tool_use_id": .string(id), "content": out.fields["result"]!]))
            }
            messages.append(ReadRow(fields: ["role": .string("user"), "content": rows(results)]))
        }
        return Turn(messages: messages, text: proposals.isEmpty ? "Não consegui fechar uma resposta agora. Pode pedir de outro jeito?" : "Montei a proposta abaixo. Revise e toque em Salvar se estiver de acordo.", proposals: proposals)
    }
}
