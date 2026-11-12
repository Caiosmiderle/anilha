import Foundation

public enum WorkoutEvolution {
    private static func jsonRows(_ rows: [ReadRow]) -> JSONValue { .array(rows.map { .object($0.fields) }) }
    private static func work(_ sets: [ReadRow]) -> [ReadRow] { sets.filter { $0.string("kind") == "work" } }
    private static func maximum(_ sets: [ReadRow]) -> Double? { work(sets).compactMap { $0.number("load_kg") }.max() }
    private static func volume(_ sets: [ReadRow], timed: Bool) -> Double? {
        let rows = work(sets)
        guard !timed, !rows.isEmpty, rows.allSatisfy({ $0.number("load_kg") != nil && $0.number("reps") != nil }) else { return nil }
        return rows.reduce(0) { $0 + ($1.number("load_kg") ?? 0) * ($1.number("reps") ?? 0) }
    }
    private static func difference(_ a: Double?, _ b: Double?) -> Double? {
        guard let a, let b else { return nil }; return a - b
    }
    private static func bestAt(_ sets: [ReadRow], load: Double?, timed: Bool = false) -> Double? {
        work(sets).filter { $0.number("load_kg") == load }.compactMap { $0.number(timed ? "seconds" : "reps") }.max()
    }
    private static func through(_ data: ReadData, session: ReadRow) -> ReadData {
        var data = data
        data.tables["sessions"] = data.active("sessions").filter { $0.id == session.id || ($0.number("started_at") ?? 0) < (session.number("started_at") ?? 0) }
        return data
    }
    public static func timeline(_ data: ReadData, session: ReadRow, exercise: String) -> [ReadRow] {
        let data = through(data, session: session)
        let sessions = Dictionary(uniqueKeysWithValues: data.active("sessions").map { ($0.id, $0) })
        return Workout.logs(data, exercise: exercise, includeDeload: true).map { log in
            log.changing(["sets": jsonRows(log.array("sets").map(WorkoutAnalysis.numericSet))])
        }.filter { !work($0.array("sets")).isEmpty }.sorted {
            let a = sessions[$0.string("session_id") ?? ""]?.number("started_at") ?? 0
            let b = sessions[$1.string("session_id") ?? ""]?.number("started_at") ?? 0
            return a == b ? ($0.string("session_id") ?? "") < ($1.string("session_id") ?? "") : a > b
        }
    }
    public static func history(_ data: ReadData, session: ReadRow, exercise: ReadRow) -> [ReadRow] {
        let timed = exercise.string("measure") == "time"
        return timeline(data, session: session, exercise: exercise.id).filter { $0.string("session_id") != session.id }.prefix(5).map { log in
            let best = work(log.array("sets")).sorted {
                let a = $0.number("load_kg") ?? 0, b = $1.number("load_kg") ?? 0
                return a == b ? ($0.number(timed ? "seconds" : "reps") ?? 0) > ($1.number(timed ? "seconds" : "reps") ?? 0) : a > b
            }.first!
            return ReadRow(fields: ["days_ago": .number(Double(max(0, LocalDay.distance(log.string("local_date") ?? "", session.string("local_date") ?? "")))),
                "best": .object(best.fields), "volume": jsonNumber(volume(log.array("sets"), timed: timed))])
        }
    }
    /// Preview using the actual workout prefill, current routine and analyzed day's week.
    public static func next(_ data: ReadData, session: ReadRow, item: ReadRow, catalog: [ReadRow]) -> ReadRow? {
        guard let exercise = data.exercises(catalog: catalog)[item.string("exercise_id") ?? ""],
              let routine = data.active("routines").first(where: { $0.id == session.string("routine_id") && $0.bool("archived") != true }) else { return nil }
        let matching = data.items(routine.id).filter { $0.string("exercise_id") == exercise.id }
        guard matching.count == 1 else { return nil }
        let data = through(data, session: session), date = session.string("local_date") ?? ""
        let monday = LocalDay.add(date, -LocalDay.weekday(date))
        let deload = data.active("profiles").first?.string("deload_week") == monday
        var plan = matching[0]
        if deload { plan.fields["sets"] = .number(max(1, ceil((plan.number("sets") ?? 0) * 0.5))) }
        guard let count = plan.number("sets"), count >= 1, count <= 12, count == floor(count) else { return nil }
        let suggestion = Workout.suggestion(data, exercise: exercise, plan: plan, today: date)
        guard suggestion.based_on != nil else { return nil }
        plan.fields["warmup_sets"] = .number(0)
        let sets = Workout.plannedSets(data, exercise: exercise, plan: plan, session: "preview-only", item: "preview-only", today: date, simple: true, deload: deload, newID: { "preview-only" }).map { row in
            ReadRow(fields: ["load_kg": row.fields["load_kg"] ?? .null, "reps": row.fields["reps"] ?? .null, "seconds": row.fields["seconds"] ?? .null])
        }
        return ReadRow(fields: ["rule": .string(suggestion.kind), "sets": jsonRows(sets)])
    }
    public static func build(_ data: ReadData, sessionID: String, catalog: [ReadRow]) -> [ReadRow] {
        guard let session = data.active("sessions").first(where: { $0.id == sessionID }), session.string("status") == "done", session.string("detail") == "full" else { return [] }
        return Workout.items(data, sessionID).enumerated().flatMap { slot, item -> [ReadRow] in
            let sets = Workout.ordered(data.active("sets").filter { $0.string("session_id") == sessionID && $0.string("item_id") == item.id && $0.number("completed_at") != nil })
            var ids = [item.string("exercise_id") ?? ""]
            for id in sets.compactMap({ $0.string("exercise_id") }) where !ids.contains(id) { ids.append(id) }
            return ids.filter { id in sets.contains { $0.string("exercise_id") == id } }.map { id in
                let today = sets.filter { $0.string("exercise_id") == id }.map(WorkoutAnalysis.numericSet)
                let past = timeline(data, session: session, exercise: id).filter { $0.string("session_id") != sessionID }
                let previous = past.first?.array("sets") ?? [], allPast = past.flatMap { $0.array("sets") }
                let exercise = catalog.first { $0.id == id }
                let timed = data.exercises(catalog: catalog)[id]?.string("measure") == "time"
                var loads: [Double?] = []
                for load in work(today).map({ $0.number("load_kg") }) where !loads.contains(load) { loads.append(load) }
                let maxLoad = maximum(today), oldMax = maximum(allPast)
                let same = loads.compactMap { load -> ReadRow? in
                    guard let delta = difference(bestAt(today, load: load, timed: timed), bestAt(previous, load: load, timed: timed)) else { return nil }
                    return ReadRow(fields: ["load_kg": jsonNumber(load), "delta": .number(delta)])
                }
                let records: [ReadRow] = timed ? [] : loads.compactMap { load in
                    guard let before = bestAt(allPast, load: load), let reps = bestAt(today, load: load), reps > before else { return nil }
                    return ReadRow(fields: ["load_kg": jsonNumber(load), "reps": .number(reps)])
                }
                return ReadRow(fields: ["slot": .number(Double(slot)), "exercise": .string(exercise?.string("name") ?? "Exercício personalizado"),
                    "today": jsonRows(today), "previous": jsonRows(previous),
                    "days_ago": past.first.map { .number(Double(max(0, LocalDay.distance($0.string("local_date") ?? "", session.string("local_date") ?? "")))) } ?? .null,
                    "max_load": jsonNumber(maxLoad), "max_load_delta": jsonNumber(difference(maxLoad, maximum(previous))),
                    "volume": jsonNumber(volume(today, timed: timed)), "volume_delta": jsonNumber(difference(volume(today, timed: timed), volume(previous, timed: timed))),
                    "same_load": jsonRows(same), "load_record": .bool(maxLoad != nil && oldMax != nil && maxLoad! > oldMax!), "reps_records": jsonRows(records)])
            }
        }
    }
}
