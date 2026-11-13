import Foundation

public struct PushChange: Codable, Equatable, Sendable {
    public var table: String
    public var row: ReadRow
    public init(_ table: String, _ row: ReadRow) { self.table = table; self.row = row }
}
public struct PushPayload: Codable, Sendable {
    public var changes: [PushChange]
    public init(changes: [PushChange]) { self.changes = changes }
}

public enum Workout {
    /// setValues.lastTimeUpdates. Index counts completed work sets as in the PWA.
    public static func lastTimeUpdates(_ suggestion: LoadSuggestion, itemSets: [ReadRow], measure: String) -> [ReadRow] {
        itemSets.filter { $0.string("kind") == "work" }.enumerated().compactMap { index, set in
            guard set.number("completed_at") == nil else { return nil }
            let last = suggestion.last(index)
            return ReadRow(fields: ["id": .string(set.id), "load_kg": last.fields["load_kg"] ?? .null,
                "reps": measure == "time" ? .null : last.fields["value"] ?? .null,
                "seconds": measure == "time" ? last.fields["value"] ?? .null : .null])
        }
    }
    /// screens/parts/setValues.ts, shared one-tap/editor fallback and unit rounding.
    public static func editorStart(_ set: ReadRow, itemSets: [ReadRow], exercise: ReadRow, unit: String) -> ReadRow {
        let done = itemSets.filter { $0.number("completed_at") != nil }
        let previous = done.reversed().first { $0.string("kind") == set.string("kind") } ?? done.last
        let load = set.number("load_kg") ?? previous?.number("load_kg")
        let time = exercise.string("measure") == "time"
        let value = set.number(time ? "seconds" : "reps") ?? previous?.number(time ? "seconds" : "reps")
        let bodyweight = exercise.bool("bodyweight") == true || exercise.string("measure") == "reps"
        return ReadRow(fields: ["load": jsonNumber(load.map { Progression.round($0 * (unit == "lb" ? Progression.lbPerKg : 1) * 2) / 2 }),
            "value": jsonNumber(value), "showLoad": .bool(!bodyweight || (load ?? 0) > 0), "kind": set.fields["kind"] ?? .string("work")])
    }
    public static func editorSave(_ draft: ReadRow, exercise: ReadRow, unit: String) -> ReadRow {
        let load = draft.bool("showLoad") == true ? draft.number("load").map { Progression.round($0 / (unit == "lb" ? Progression.lbPerKg : 1) * 100) / 100 } : nil
        let time = exercise.string("measure") == "time"
        return ReadRow(fields: ["kind": draft.fields["kind"] ?? .string("work"), "load_kg": jsonNumber(load),
            "reps": time ? .null : draft.fields["value"] ?? .null, "seconds": time ? draft.fields["value"] ?? .null : .null])
    }
    public static func id() -> String { UUID().uuidString.lowercased() }
    public static func ordered(_ rows: [ReadRow]) -> [ReadRow] {
        rows.sorted { ($0.number("position") ?? 0) == ($1.number("position") ?? 0) ? $0.id < $1.id : ($0.number("position") ?? 0) < ($1.number("position") ?? 0) }
    }
    public static func items(_ data: ReadData, _ session: String) -> [ReadRow] {
        ordered(data.active("session_items").filter { $0.string("session_id") == session })
    }
    public static func sets(_ data: ReadData, _ item: String) -> [ReadRow] {
        ordered(data.active("sets").filter { $0.string("item_id") == item })
    }
    public static func logs(_ data: ReadData, exercise: String, exclude: String? = nil, includeDeload: Bool = false) -> [ReadRow] {
        let sessions = Dictionary(uniqueKeysWithValues: data.active("sessions").filter {
            $0.string("status") == "done" && (includeDeload || $0.bool("deload") != true) && $0.id != exclude
        }.map { ($0.id, $0) })
        let items = Dictionary(uniqueKeysWithValues: data.active("session_items").map { ($0.id, $0) })
        let sets = data.active("sets").filter { $0.string("exercise_id") == exercise && $0.number("completed_at") != nil }.sorted {
            let a = $0.number("completed_at") ?? 0, b = $1.number("completed_at") ?? 0
            return a == b ? ($0.number("position") ?? 0) < ($1.number("position") ?? 0) : a < b
        }
        var groups: [ReadRow] = []
        for set in sets {
            guard let session = sessions[set.string("session_id") ?? ""] else { continue }
            if let index = groups.firstIndex(where: { $0.string("session_id") == session.id }) {
                let previous = groups[index].array("sets")
                groups[index].fields["sets"] = .array((previous + [set]).map { .object($0.fields) })
            } else {
                let item = items[set.string("item_id") ?? ""]
                groups.append(ReadRow(fields: ["local_date": session.fields["local_date"] ?? .null,
                    "session_id": .string(session.id), "target_min": item?.fields["target_min"] ?? .number(0),
                    "target_max": item?.fields["target_max"] ?? .number(0), "sets": .array([.object(set.fields)])]))
            }
        }
        return groups.enumerated().sorted {
            let a = $0.element.string("local_date") ?? "", b = $1.element.string("local_date") ?? ""
            return a == b ? $0.offset < $1.offset : a < b
        }.map(\.element)
    }
    public static func returning(_ data: ReadData, today: String) -> Bool {
        let profile = data.active("profiles").first
        let setting = profile?.string("return_mode") ?? "auto"
        if setting == "off" { return false }
        if setting == "on" { return today <= LocalDay.add(profile?.string("return_started_on") ?? today, 27) }
        let dates = Set(data.active("sessions").filter { $0.string("status") == "done" }.compactMap { $0.string("local_date") }.filter { $0 <= today }).sorted()
        guard let last = dates.last else { return false }
        if LocalDay.distance(last, today) > 21 { return true }
        if dates.count > 1 {
            for i in stride(from: dates.count - 1, through: 1, by: -1) {
                if LocalDay.distance(dates[i - 1], dates[i]) > 21 { return today <= LocalDay.add(dates[i], 27) }
            }
        }
        return false
    }
    public static func suggestion(_ data: ReadData, exercise: ReadRow, plan: ReadRow, today: String, exclude: String? = nil) -> LoadSuggestion {
        Progression.suggest(ReadRow(fields: ["exercise": .object(exercise.fields),
            "logs": .array(logs(data, exercise: exercise.id, exclude: exclude).map { .object($0.fields) }),
            "target": .object(["sets": plan.fields["sets"] ?? plan.fields["planned_sets"] ?? .number(0),
                "min": plan.fields["target_min"] ?? .number(0), "max": plan.fields["target_max"] ?? .number(0)]),
            "today": .string(today), "unit": .string(data.active("profiles").first?.string("unit") ?? "kg")]))
    }
    private static func blankSet(_ session: String, _ item: String, _ exercise: String, _ position: Int, _ kind: String, newID: () -> String) -> ReadRow {
        ReadRow(fields: ["id": .string(newID()), "deleted": .bool(false), "session_id": .string(session),
            "item_id": .string(item), "exercise_id": .string(exercise), "position": .number(Double(position)),
            "kind": .string(kind), "load_kg": .null, "reps": .null, "seconds": .null,
            "rir": .null, "note": .null, "completed_at": .null])
    }
    public static func plannedSets(_ data: ReadData, exercise: ReadRow, plan: ReadRow, session: String, item: String,
                                   today: String, simple: Bool, deload: Bool = false, newID: () -> String = id) -> [ReadRow] {
        let s = suggestion(data, exercise: exercise, plan: plan, today: today, exclude: session)
        let time = exercise.string("measure") == "time", weighted = exercise.string("measure") == "weight_reps"
        let step = exercise.number("increment_kg") ?? 2.5
        func lighter(_ kg: Double?) -> Double? {
            kg.map { deload ? Progression.round(Progression.round($0 * 0.9 / step) * step * 100) / 100 : $0 }
        }
        let count = Int(plan.number("warmup_sets") ?? 0)
        let loads = weighted ? Progression.warmupLoads(lighter(s.prefill(0).number("load_kg")), count: count, increment: step, simple: simple) : []
        let warm = data.active("sets").filter { $0.string("exercise_id") == exercise.id && $0.string("session_id") != session && $0.number("completed_at") != nil && $0.string("kind") == "warmup" }
        let lastSession = warm.max { ($0.number("completed_at") ?? 0) < ($1.number("completed_at") ?? 0) }?.string("session_id")
        let previous = ordered(warm.filter { $0.string("session_id") == lastSession })
        var result: [ReadRow] = []
        for i in 0..<max(0, count) {
            let prev = previous.isEmpty ? nil : previous[min(i, previous.count - 1)]
            let load = i < loads.count ? loads[i] : nil
            result.append(blankSet(session, item, exercise.id, i, "warmup", newID: newID).changing([
                "load_kg": jsonNumber(load ?? prev?.number("load_kg")),
                "reps": weighted ? .number(simple ? 10 : 6) : prev?.fields["reps"] ?? .null,
                "seconds": prev?.fields["seconds"] ?? .null]))
        }
        for i in 0..<max(0, Int(plan.number("sets") ?? plan.number("planned_sets") ?? 0)) {
            let pre = s.prefill(i)
            result.append(blankSet(session, item, exercise.id, count + i, "work", newID: newID).changing([
                "load_kg": jsonNumber(lighter(pre.number("load_kg"))), "reps": time ? .null : pre.fields["value"] ?? .null,
                "seconds": time ? pre.fields["value"] ?? .null : .null]))
        }
        return result
    }
    public static func start(_ data: ReadData, routine: ReadRow, catalog: [ReadRow], today: String, now: Double,
                             planned: [ReadRow]? = nil, adjustment: String? = nil,
                             newID: () -> String = id) -> [PushChange] {
        guard !data.active("sessions").contains(where: { $0.string("status") == "active" }) else { return [] }
        let session = newID(), profile = data.active("profiles").first
        let simple = profile?.object("onboarding").string("level") == "iniciante" || returning(data, today: today)
        let monday = LocalDay.add(today, -LocalDay.weekday(today))
        let deload = profile?.string("deload_week") == monday
        var adjustments: [JSONValue] = []
        if let adjustment, !adjustment.isEmpty { adjustments.append(.string(adjustment)) }
        if deload { adjustments.append(.string("Semana leve: metade das séries e 10% menos carga.")) }
        var changes = [PushChange("sessions", ReadRow(fields: ["id": .string(session), "deleted": .bool(false),
            "local_date": .string(today), "started_at": .number(floor(now)), "ended_at": .null, "status": .string("active"),
            "split_key": routine.fields["split_key"] ?? .null, "title": routine.fields["name"] ?? .string("Treino"),
            "routine_id": .string(routine.id), "source": .string("routine"), "note": .null, "detail": .string("full"),
            "rest_started_at": .null, "rest_duration_sec": .null,
            "adjustments": .array(adjustments),
            "deload": deload ? .bool(true) : .null]))]
        let exercises = data.exercises(catalog: catalog)
        var firstWeighted = true
        for (position, original) in (planned ?? data.items(routine.id)).enumerated() {
            guard let exercise = exercises[original.string("exercise_id") ?? ""] else { continue }
            var plan = original
            if deload { plan.fields["sets"] = .number(max(1, ceil((plan.number("sets") ?? 0) * 0.5))) }
            if exercise.string("measure") == "weight_reps" && firstWeighted {
                firstWeighted = false
                plan.fields["warmup_sets"] = .number(max(plan.number("warmup_sets") ?? 0, simple ? 1 : 2))
            }
            let item = newID()
            changes.append(PushChange("session_items", ReadRow(fields: ["id": .string(item), "deleted": .bool(false),
                "session_id": .string(session), "position": .number(Double(position)), "exercise_id": .string(exercise.id),
                "original_exercise_id": .null, "substitution_reason": .null, "status": .string("pending"), "skip_reason": .null,
                "planned_sets": plan.fields["sets"] ?? .number(0), "target_min": plan.fields["target_min"] ?? .number(0),
                "target_max": plan.fields["target_max"] ?? .number(0), "rest_sec": plan.fields["rest_sec"] ?? .number(90),
                "warmup_sets": plan.fields["warmup_sets"] ?? .number(0), "note": .null, "pain_joint": .null, "added": .bool(false),
                "superset": plan.fields["superset"] ?? .null])))
            changes += plannedSets(data, exercise: exercise, plan: plan, session: session, item: item, today: today,
                                   simple: simple, deload: deload, newID: newID).map { PushChange("sets", $0) }
        }
        return changes
    }
    public static func next(_ items: [ReadRow], sets: [ReadRow]) -> ReadRow? {
        let ordered = ordered(items.filter { $0.string("status") != "skipped" })
        func pending(_ item: ReadRow) -> [ReadRow] { Self.ordered(sets.filter { $0.string("item_id") == item.id && $0.number("completed_at") == nil }) }
        func done(_ item: ReadRow) -> Int { sets.filter { $0.string("item_id") == item.id && $0.string("kind") == "work" && $0.number("completed_at") != nil }.count }
        for item in ordered {
            guard let first = pending(item).first else { continue }
            guard let key = item.string("superset"), !key.isEmpty else { return first }
            let group = ordered.filter { $0.string("superset") == key && !pending($0).isEmpty }
            for member in group { if let warm = pending(member).first(where: { $0.string("kind") == "warmup" }) { return warm } }
            let pick = group.sorted { done($0) == done($1) ? ($0.number("position") ?? 0) < ($1.number("position") ?? 0) : done($0) < done($1) }.first
            if let pick { return pending(pick).first }
        }
        return nil
    }
    public static func complete(_ data: ReadData, set: ReadRow, now: Double) -> [PushChange] {
        guard let session = data.active("sessions").first(where: { $0.id == set.string("session_id") && $0.string("status") == "active" }),
              let item = data.active("session_items").first(where: { $0.id == set.string("item_id") }),
              let live = data.active("sets").first(where: { $0.id == set.id }),
              live.number("completed_at") == nil, item.string("status") != "skipped" else { return [] }
        let values = ["load_kg", "reps", "seconds"].reduce(into: [String: JSONValue]()) { $0[$1] = set.fields[$1] ?? .null }
        let completed = live.changing(values).changing(["completed_at": .number(floor(now)), "rir": live.string("kind") == "warmup" ? .null : live.fields["rir"] ?? .null])
        let items = items(data, session.id)
        let all = data.active("sets").filter { $0.string("session_id") == session.id }.map { $0.id == set.id ? completed : $0 }
        var rest = true
        if let key = item.string("superset"), !key.isEmpty, set.string("kind") == "work" {
            let group = items.filter { $0.string("superset") == key && $0.string("status") != "skipped" }
            let partnerLeft = group.contains { x in x.id != item.id && all.contains { $0.string("item_id") == x.id && $0.string("kind") == "work" && $0.number("completed_at") == nil } }
            let counts = group.map { x in all.filter { $0.string("item_id") == x.id && $0.string("kind") == "work" && $0.number("completed_at") != nil }.count }
            rest = !partnerLeft || Set(counts).count == 1
        }
        let duration = set.string("kind") == "warmup" ? 60 : item.number("rest_sec") ?? data.active("profiles").first?.number("rest_sec") ?? 90
        var changes = [PushChange("sets", completed)]
        if item.string("status") != "done" { changes.append(PushChange("session_items", item.changing(["status": .string("done")]))) }
        changes.append(PushChange("sessions", session.changing(["rest_started_at": rest && duration > 0 ? .number(floor(now)) : .null,
            "rest_duration_sec": rest && duration > 0 ? .number(duration) : .null])))
        return changes
    }
    public static func finish(_ data: ReadData, session: ReadRow, now: Double) -> [PushChange] {
        guard let live = data.active("sessions").first(where: { $0.id == session.id }),
              live.string("status") == "active" else { return [] }
        let sets = data.active("sets").filter { $0.string("session_id") == session.id }
        var changes = sets.filter { $0.number("completed_at") == nil }.map { PushChange("sets", $0.changing(["deleted": .bool(true)])) }
        for item in items(data, session.id) {
            let done = sets.contains { $0.string("item_id") == item.id && $0.number("completed_at") != nil }
            let status = item.string("status") == "skipped" ? "skipped" : done ? "done" : "not_done"
            if status != item.string("status") { changes.append(PushChange("session_items", item.changing(["status": .string(status)]))) }
        }
        changes.append(PushChange("sessions", live.changing(["status": .string("done"), "ended_at": .number(floor(now)),
            "rest_started_at": .null, "rest_duration_sec": .null])))
        return changes
    }
    public static func skip(_ data: ReadData, item: ReadRow) -> [PushChange] {
        [PushChange("session_items", item.changing(["status": .string("skipped"), "skip_reason": .null]))] +
        sets(data, item.id).filter { $0.number("completed_at") == nil }.map { PushChange("sets", $0.changing(["deleted": .bool(true)])) }
    }
    public static func substitute(_ data: ReadData, item: ReadRow, exercise: ReadRow, catalog: [ReadRow], today: String,
                                  newID: () -> String = id) -> [PushChange] {
        guard item.string("exercise_id") != exercise.id else { return [] }
        let all = sets(data, item.id), done = all.filter { $0.number("completed_at") != nil }, pending = all.filter { $0.number("completed_at") == nil }
        var changes = pending.map { PushChange("sets", $0.changing(["deleted": .bool(true)])) }
        let remaining = max(1, pending.filter { $0.string("kind") == "work" }.count == 0 ? Int(item.number("planned_sets") ?? 0) : pending.filter { $0.string("kind") == "work" }.count)
        let old = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })[item.string("exercise_id") ?? ""]
        var targetMin = item.number("target_min") ?? 0, targetMax = item.number("target_max") ?? 0
        if (old?.string("measure") == "time") != (exercise.string("measure") == "time") {
            if exercise.string("measure") == "time" { targetMin = exercise.string("pattern") == "core_lateral" ? 20 : 30; targetMax = targetMin == 20 ? 30 : 45 }
            else { targetMin = exercise.string("primary_group") == "core" ? 12 : exercise.bool("compound") == true ? 8 : 10; targetMax = targetMin == 8 ? 12 : 15 }
        }
        var next = item.changing(["exercise_id": .string(exercise.id), "original_exercise_id": item.fields["original_exercise_id"] == .null ? item.fields["exercise_id"] ?? .null : item.fields["original_exercise_id"] ?? item.fields["exercise_id"] ?? .null,
            "substitution_reason": .null, "target_min": .number(targetMin), "target_max": .number(targetMax), "warmup_sets": .number(0)])
        if !done.isEmpty {
            let position = item.number("position") ?? 0, session = item.string("session_id") ?? ""
            for sibling in items(data, session) where (sibling.number("position") ?? 0) > position {
                changes.append(PushChange("session_items", sibling.changing(["position": .number((sibling.number("position") ?? 0) + 1)])))
            }
            changes.append(PushChange("session_items", item.changing(["status": .string("done"), "planned_sets": .number(Double(done.count))])))
            next = next.changing(["id": .string(newID()), "position": .number(position + 1), "status": .string("pending"),
                "planned_sets": .number(Double(remaining)), "pain_joint": .null, "note": .null, "added": .bool(false)])
        }
        changes.append(PushChange("session_items", next))
        let plan = next.changing(["sets": .number(Double(remaining))])
        changes += plannedSets(data, exercise: exercise, plan: plan, session: item.string("session_id") ?? "", item: next.id,
                               today: today, simple: false, newID: newID).map { PushChange("sets", $0) }
        return changes
    }
    public static func restEnd(_ session: ReadRow) -> Double? {
        guard session.string("status") == "active", let start = session.number("rest_started_at"), let duration = session.number("rest_duration_sec") else { return nil }
        return start + duration * 1000
    }
    public static func move(_ data: ReadData, item: ReadRow, end: Bool) -> [PushChange] {
        let all = items(data, item.string("session_id") ?? "")
        let key = item.string("superset")
        let block = all.filter { key != nil && key != "" ? $0.string("superset") == key : $0.id == item.id }
        let ids = Set(block.map(\.id))
        var rest = all.filter { !ids.contains($0.id) }
        let at = end ? rest.count : rest.firstIndex { $0.string("status") != "skipped" && sets(data, $0.id).contains { $0.number("completed_at") == nil } } ?? rest.count
        rest.insert(contentsOf: block, at: at)
        return rest.enumerated().compactMap { index, row in
            row.number("position") == Double(index) ? nil : PushChange("session_items", row.changing(["position": .number(Double(index))]))
        }
    }
    /// records.ts detectRecords, only events belonging to the newly finished session.
    public static func records(_ data: ReadData, session: String, catalog: [ReadRow]) -> [PushChange] {
        let exercises = data.exercises(catalog: catalog)
        let ids = Set(data.active("sets").filter { $0.string("session_id") == session && $0.string("kind") == "work" && $0.number("completed_at") != nil }.compactMap { $0.string("exercise_id") })
        return ids.sorted().flatMap { exerciseID -> [PushChange] in
            guard let ex = exercises[exerciseID] else { return [] }
            return recordRows(data, exercise: exerciseID, ex: ex, session: session).map { PushChange("records", $0) }
        }
    }
    /// detectRecords over the finished history of one exercise; `session` keeps only its events.
    static func recordRows(_ data: ReadData, exercise exerciseID: String, ex: ReadRow, session onlySession: String?) -> [ReadRow] {
        var out: [ReadRow] = []
        var seen = 0, bestLoad: Double?, bestE1: Double?, bestReps: Double?, bestSec: Double?
        for log in logs(data, exercise: exerciseID) {
            let sets = log.array("sets").filter { $0.string("kind") == "work" && $0.number(ex.string("measure") == "time" ? "seconds" : "reps") != nil }
            let loaded = sets.filter { ($0.number("load_kg") ?? 0) > 0 && ($0.number("reps") ?? 0) >= 1 }
            let load = loaded.compactMap { $0.number("load_kg") }.max()
            let e1 = loaded.compactMap { row -> Double? in
                guard let kg = row.number("load_kg"), let reps = row.number("reps"), reps <= 12 else { return nil }
                return reps == 1 ? kg : kg * (1 + reps / 30)
            }.max()
            let reps = sets.compactMap { $0.number("reps") }.max(), sec = sets.compactMap { $0.number("seconds") }.max()
            if load == nil && reps == nil && sec == nil { continue }
            let logSession = log.string("session_id") ?? ""
            func event(_ kind: String, _ value: Double?, _ previous: Double?, unit: String, margin: Double = 0) {
                guard seen > 0, let value, let previous, value > previous + margin, onlySession == nil || logSession == onlySession else { return }
                out.append(ReadRow(fields: ["id": .string("\(exerciseID):\(kind):\(logSession)"), "deleted": .bool(false),
                    "exercise_id": .string(exerciseID), "exercise_name": ex.fields["name"] ?? .string("Exercício"), "kind": .string(kind),
                    "value": .number(Progression.round(value * 100) / 100), "unit": .string(unit), "local_date": log.fields["local_date"] ?? .null,
                    "session_id": .string(logSession), "run_id": .null]))
            }
            if ex.string("measure") == "time" { event("tempo", sec, bestSec, unit: "s"); if let sec { bestSec = max(bestSec ?? 0, sec) } }
            else if let load {
                if seen > 0, let bestLoad, load > bestLoad { event("carga", load, bestLoad, unit: "kg") }
                else { event("e1rm", e1, bestE1, unit: "kg", margin: 0.01) }
                bestLoad = max(bestLoad ?? 0, load)
                if let e1 { bestE1 = max(bestE1 ?? 0, e1) }
            } else if ex.bool("bodyweight") == true, let reps {
                event("repeticoes", reps, bestReps, unit: "reps"); bestReps = max(bestReps ?? 0, reps)
            }
            seen += 1
        }
        return out
    }
    /// ops.ts deleteSession: tombstones for the session, its items and sets, then recomputeRecords
    /// for the exercises it touched (a record can move to a later session or disappear).
    public static func deleteSession(_ data: ReadData, session: String, catalog: [ReadRow]) -> [PushChange] {
        guard let row = data.active("sessions").first(where: { $0.id == session }) else { return [] }
        let sets = data.active("sets").filter { $0.string("session_id") == session }
        let items = data.active("session_items").filter { $0.string("session_id") == session }
        var changes = sets.map { PushChange("sets", $0.changing(["deleted": .bool(true)])) }
            + items.map { PushChange("session_items", $0.changing(["deleted": .bool(true)])) }
            + [PushChange("sessions", row.changing(["deleted": .bool(true)]))]
        var after = data
        for change in changes {
            after.tables[change.table] = (after.tables[change.table] ?? []).map { $0.id == change.row.id ? change.row : $0 }
        }
        let exercises = data.exercises(catalog: catalog)
        for exerciseID in Set(sets.compactMap { $0.string("exercise_id") }).sorted() {
            guard let ex = exercises[exerciseID] else { continue }
            var wanted = Dictionary(recordRows(after, exercise: exerciseID, ex: ex, session: nil).map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
            let existing = (data.tables["records"] ?? []).filter { $0.string("exercise_id") == exerciseID && $0.string("run_id") == nil }
            for record in existing {
                if let w = wanted[record.id] {
                    if record.deleted || record.number("value") != w.number("value") || record.string("local_date") != w.string("local_date") {
                        changes.append(PushChange("records", w))
                    }
                    wanted.removeValue(forKey: record.id)
                } else if !record.deleted {
                    changes.append(PushChange("records", record.changing(["deleted": .bool(true)])))
                }
            }
            changes += wanted.keys.sorted().compactMap { wanted[$0].map { PushChange("records", $0) } }
        }
        return changes
    }
}
