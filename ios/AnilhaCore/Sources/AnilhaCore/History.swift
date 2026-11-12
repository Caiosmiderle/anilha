import Foundation

/// Numeric projections used by History.tsx, ExerciseProgress and BodyTab.
/// Ported from adherence.ts, cardio.ts, volume.ts, records.ts and body.ts.
public enum History {
    public static func weekStart(_ day: String) -> String { LocalDay.add(day, -LocalDay.weekday(day)) }
    private static func rows(_ rows: [ReadRow]) -> JSONValue { .array(rows.map { .object($0.fields) }) }
    private static func round(_ n: Double, _ places: Double) -> Double { floor(n * places + 0.5) / places }
    public static func plan(_ data: ReadData, day: String) -> ReadRow? {
        data.active("plans").filter { ($0.string("active_from") ?? "") <= LocalDay.add(weekStart(day), 6) }.sorted {
            let a = $0.string("active_from") ?? "", b = $1.string("active_from") ?? ""
            return a == b ? ($0.number("updated_at") ?? 0) > ($1.number("updated_at") ?? 0) : a > b
        }.first
    }
    /// countedCardio: running always counts; other cardio fills only remaining planned slots.
    public static func countedCardio(_ data: ReadData) -> [ReadRow] {
        let groups = Dictionary(grouping: data.active("runs")) { weekStart($0.string("local_date") ?? "") }
        return groups.keys.sorted().flatMap { week -> [ReadRow] in
            let sorted = groups[week]!.enumerated().sorted {
                let a = $0.element.string("local_date") ?? "", b = $1.element.string("local_date") ?? ""
                return a == b ? $0.offset < $1.offset : a < b
            }.map(\.element)
            let running = sorted.filter { ($0.string("activity") ?? "corrida") == "corrida" }
            let others = sorted.filter { ($0.string("activity") ?? "corrida") != "corrida" }
            let slots = max(0, Int(plan(data, day: week)?.number("run_per_week") ?? 0) - running.count)
            return running + Array(others.prefix(slots))
        }
    }
    /// Only the fields rendered by History are projected. No new adherence rule.
    public static func weekReport(_ data: ReadData, day: String, today: String) -> ReadRow {
        let from = weekStart(day), to = LocalDay.add(from, 6), plan = plan(data, day: day)
        let gym = data.active("sessions").filter { $0.string("status") == "done" }.compactMap { $0.string("local_date") }.filter { $0 >= from && $0 <= to }
        let run = countedCardio(data).compactMap { $0.string("local_date") }.filter { $0 >= from && $0 <= to }
        let pg = plan?.number("gym_per_week") ?? 0, pr = plan?.number("run_per_week") ?? 0
        let g = Double(gym.count), r = Double(run.count), finished = today > to
        let elapsed = max(0, LocalDay.distance(from, finished ? to : today) + 1)
        let rest = max(0, elapsed - Set(gym + run).count)
        let status = plan == nil ? "sem_plano" : g > pg || r > pr ? "desvio" : g == pg && r == pr ? "cumprida" : finished ? "parcial" : "em_andamento"
        let other = data.active("runs").contains { row in
            let date = row.string("local_date") ?? ""
            return date >= from && date <= to && (row.string("activity") ?? "corrida") != "corrida"
        }
        return ReadRow(fields: ["week_start": .string(from), "week_end": .string(to),
            "planned_gym": .number(pg), "planned_run": .number(pr), "done_gym": .number(g), "done_run": .number(r),
            "rest_days": .number(Double(rest)), "status": .string(status),
            "pct": .number(pg + pr > 0 ? (min(g, pg) + min(r, pr)) / (pg + pr) : 0),
            "cardio": .string(other ? "Cardio" : "Corrida")])
    }
    public static func weeks(_ data: ReadData, today: String) -> [ReadRow] {
        (0..<12).compactMap { i in
            let report = weekReport(data, day: LocalDay.add(weekStart(today), -7 * i), today: today)
            return i == 0 || (report.number("done_gym") ?? 0) > 0 || (report.number("done_run") ?? 0) > 0 || (report.number("planned_gym") ?? 0) > 0 ? report : nil
        }
    }
    private static let taxonomy: ReadRow = {
        guard let url = Bundle.module.url(forResource: "history-taxonomy", withExtension: "json"),
              let bytes = try? Data(contentsOf: url), let row = try? JSONDecoder().decode(ReadRow.self, from: bytes) else {
            preconditionFailure("Missing generated history taxonomy")
        }
        return row
    }()
    public static func groupLabel(_ group: String) -> String { taxonomy.object("labels").string(group) ?? group }
    public static func weeklyGroupSets(_ data: ReadData, catalog: [ReadRow], today: String) -> [ReadRow] {
        let exercises = data.exercises(catalog: catalog)
        let sessions = Dictionary(uniqueKeysWithValues: data.active("sessions").map { ($0.id, $0) })
        let from = weekStart(today), to = LocalDay.add(from, 6)
        var order: [String] = [], counts: [String: Double] = [:]
        for set in data.active("sets") where set.string("kind") == "work" && set.number("completed_at") != nil {
            guard let session = sessions[set.string("session_id") ?? ""], let day = session.string("local_date"),
                  day >= from, day <= to, let ex = exercises[set.string("exercise_id") ?? ""] else { continue }
            var muscle: String?
            if case .array(let list) = ex.fields["muscles"], let first = list.first, case .string(let value) = first { muscle = value }
            let group = muscle.flatMap { taxonomy.object("muscles").string($0) } ?? "core"
            if counts[group] == nil { order.append(group) }
            counts[group, default: 0] += 1
        }
        return order.enumerated().sorted {
            let a = counts[$0.element]!, b = counts[$1.element]!
            return a == b ? $0.offset < $1.offset : a > b
        }.map { ReadRow(fields: ["group": .string($0.element), "value": .number(counts[$0.element]!)]) }
    }
    public static func exercises(_ data: ReadData, catalog: [ReadRow]) -> [ReadRow] {
        let map = data.exercises(catalog: catalog)
        var order: [String] = [], sessions: [String: Set<String>] = [:], loaded: Set<String> = []
        for set in data.active("sets") where set.string("kind") == "work" && set.number("completed_at") != nil {
            guard let id = set.string("exercise_id"), let session = set.string("session_id") else { continue }
            if sessions[id] == nil { order.append(id) }
            sessions[id, default: []].insert(session)
            if (set.number("load_kg") ?? 0) > 0 { loaded.insert(id) }
        }
        return order.enumerated().sorted {
            let a = sessions[$0.element]!.count, b = sessions[$1.element]!.count
            if a != b { return a > b }
            if loaded.contains($0.element) != loaded.contains($1.element) { return loaded.contains($0.element) }
            return $0.offset < $1.offset
        }.compactMap { map[$0.element] }
    }
    public static func estimate1RM(_ kg: Double, _ reps: Double) -> Double? {
        guard kg > 0, reps >= 1, reps <= 12 else { return nil }
        return reps == 1 ? kg : kg * (1 + reps / 30)
    }
    public static func sessionBest(_ log: ReadRow, timed: Bool) -> ReadRow {
        let work = log.array("sets").filter { $0.string("kind") == "work" && $0.number(timed ? "seconds" : "reps") != nil }
        let loaded = work.filter { ($0.number("load_kg") ?? 0) > 0 && ($0.number("reps") ?? 0) >= 1 }
        return ReadRow(fields: ["local_date": log.fields["local_date"] ?? .null, "session_id": log.fields["session_id"] ?? .null,
            "max_load": jsonNumber(loaded.compactMap { $0.number("load_kg") }.max()),
            "best_e1rm": jsonNumber(loaded.compactMap { estimate1RM($0.number("load_kg") ?? 0, $0.number("reps") ?? 0) }.max()),
            "max_reps": jsonNumber(work.compactMap { $0.number("reps") }.max()),
            "max_seconds": jsonNumber(work.compactMap { $0.number("seconds") }.max()),
            "volume": .number(loaded.reduce(0) { $0 + ($1.number("load_kg") ?? 0) * ($1.number("reps") ?? 0) })])
    }
    public static func progress(_ data: ReadData, exercise: ReadRow, unit: String) -> ReadRow {
        let logs = Workout.logs(data, exercise: exercise.id), timed = exercise.string("measure") == "time"
        let bests = logs.map { sessionBest($0, timed: timed) }, loaded = bests.contains { $0.number("max_load") != nil }
        func converted(_ n: Double) -> Double { unit == "lb" ? n * 2.2046226218 : n }
        let main = bests.map { best in
            ReadRow(fields: ["day": best.fields["local_date"] ?? .null,
                "value": .number(timed ? best.number("max_seconds") ?? 0 : loaded ? round(converted(best.number("max_load") ?? 0), 10) : best.number("max_reps") ?? 0)])
        }.filter { ($0.number("value") ?? 0) > 0 }
        let compare = loaded ? bests.filter { $0.number("best_e1rm") != nil }.map {
            ReadRow(fields: ["day": $0.fields["local_date"] ?? .null, "value": .number(round(converted($0.number("best_e1rm") ?? 0), 10))])
        } : []
        let last1rm = logs.last?.array("sets").filter { $0.string("kind") == "work" }.compactMap { estimate1RM($0.number("load_kg") ?? 0, $0.number("reps") ?? 0) }.max() ?? 0
        return ReadRow(fields: ["count": .number(Double(logs.count)), "loaded": .bool(loaded), "main": rows(main), "compare": rows(compare),
            "max_load": jsonNumber(bests.compactMap { $0.number("max_load") }.max()), "last1rm": .number(last1rm),
            "last_volume": jsonNumber(bests.last?.number("volume")), "last_date": logs.last?.fields["local_date"] ?? .null])
    }
    public static func bodyTrend(_ logs: [ReadRow], goal: String?, today: String) -> ReadRow {
        let live = logs.filter { !$0.deleted && ($0.string("local_date") ?? "") <= today }
        let sorted = live.enumerated().sorted {
            let a = $0.element.string("local_date") ?? "", b = $1.element.string("local_date") ?? ""
            return a == b ? $0.offset < $1.offset : a > b
        }.map(\.element)
        let groups = Dictionary(grouping: live) { weekStart($0.string("local_date") ?? "") }
        func avg(_ list: [ReadRow], _ key: String) -> Double? {
            let values = list.compactMap { $0.number(key) }
            return values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
        }
        let weeks = groups.keys.sorted().map { week in
            let list = groups[week]!
            return ReadRow(fields: ["week": .string(week), "weight_kg": jsonNumber(avg(list, "weight_kg")), "waist_cm": jsonNumber(avg(list, "waist_cm")),
                "count": .number(Double(list.compactMap { $0.number("weight_kg") }.count + list.compactMap { $0.number("waist_cm") }.count))])
        }
        let recent = weeks.filter { ($0.string("week") ?? "") >= weekStart(LocalDay.add(today, -42)) }
        let weights = Array(recent.filter { $0.number("weight_kg") != nil }.suffix(4))
        let waists = Array(recent.filter { $0.number("waist_cm") != nil }.suffix(4))
        var rate: Double?, waist: Double?, advice: String?
        if weights.count >= 2, let first = weights.first, let last = weights.last, let kg = first.number("weight_kg"), kg != 0 {
            let n = round(Double(LocalDay.distance(first.string("week")!, last.string("week")!)) / 7, 1)
            if n >= 1 { rate = ((last.number("weight_kg")! - kg) / kg / n) * 100 }
        }
        if waists.count >= 2 { waist = waists.last!.number("waist_cm")! - waists.first!.number("waist_cm")! }
        if let rate {
            if goal == "hipertrofia" {
                advice = rate < 0.125 ? "Peso quase parado. Para ganhar massa, a referência é subir de 0,3% a 0,5% por semana: um pouco mais de comida ajuda." : rate > 0.75 ? "Subindo rápido: acima de 0,5% por semana costuma vir mais gordura que músculo." : "No ritmo de quem está ganhando massa."
                if let waist, waist >= 2, rate > 0 { advice! += " A cintura subiu 2 cm ou mais: vale segurar um pouco." }
            } else if goal == "emagrecimento" {
                advice = rate > -0.25 ? "Peso quase parado. Para emagrecer sem perder músculo, a referência é cair de 0,5% a 1% por semana." : rate < -1.5 ? "Caindo rápido: acima de 1% por semana aumenta a perda de músculo. Vale comer um pouco mais." : "No ritmo de quem emagrece mantendo o músculo."
                if let waist, waist <= -1, rate > -0.25 { advice! += " A cintura caiu: o corpo está mudando mesmo com o peso parado." }
            }
        } else if !sorted.isEmpty { advice = "Com duas semanas de pesagens dá para ver o ritmo. Pese de manhã, no mesmo horário." }
        let latest = sorted.first.map { ReadRow(fields: ["local_date": $0.fields["local_date"] ?? .null, "weight_kg": $0.fields["weight_kg"] ?? .null, "waist_cm": $0.fields["waist_cm"] ?? .null]) }
        return ReadRow(fields: ["latest": latest.map { .object($0.fields) } ?? .null, "weeks": rows(weeks),
            "rate_pct_week": jsonNumber(rate.map { round($0, 100) }), "waist_change_cm": jsonNumber(waist.map { round($0, 10) }), "advice": advice.map(JSONValue.string) ?? .null])
    }
    public static func healthOn(_ consent: ReadRow?) -> Bool { consent?.object("saude").bool("granted") == true }
    private static func validDay(_ day: String) -> Bool {
        guard day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX"); format.timeZone = TimeZone(secondsFromGMT: 0)
        format.dateFormat = "yyyy-MM-dd"; format.isLenient = false
        guard let date = format.date(from: day) else { return false }
        return format.string(from: date) == day
    }
    public static func bodyChange(_ row: ReadRow, consent: ReadRow?, today: String) throws -> PushChange {
        guard healthOn(consent) else { throw ReadSync.Failure.invalidPage }
        if !row.deleted {
            guard let day = row.string("local_date"), validDay(day), day <= today,
                  row.number("weight_kg") != nil || row.number("waist_cm") != nil else { throw ReadSync.Failure.invalidPage }
            if let kg = row.number("weight_kg"), !kg.isFinite || kg < 20 || kg > 400 { throw ReadSync.Failure.invalidPage }
            if let cm = row.number("waist_cm"), !cm.isFinite || cm < 30 || cm > 250 { throw ReadSync.Failure.invalidPage }
        }
        return PushChange("body_logs", row)
    }
}
