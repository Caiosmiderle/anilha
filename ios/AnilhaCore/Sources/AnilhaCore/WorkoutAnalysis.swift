import Foundation

/// Allowlist projection and deterministic editar_ficha subset, ported from TypeScript.
public enum WorkoutAnalysis {
    public struct CardState: Equatable, Sendable {
        public let canAnalyze: Bool
        public let canDecide: Bool
        public let canUndo: Bool
        public let waiting: Bool
        public let interrupted: Bool
    }
    public static func cardState(_ saved: ReadRow, busy: Bool, online: Bool) -> CardState {
        let hasReply = saved.object("reply").string("summary") != nil
        return CardState(canAnalyze: !busy && online && !hasReply, canDecide: !busy && hasReply && saved.string("status") == "proposed",
            canUndo: !busy && hasReply && saved.string("status") == "saved" && !saved.array("undoAfter").isEmpty,
            waiting: !hasReply && saved.string("status") == "pending", interrupted: !hasReply && saved.string("status") == "requesting")
    }
    public static let rules = ["first_time", "increase", "progress_variation", "confirm", "reps_first", "hold_effort", "hold_reps", "hold_below", "decrease", "retrain", "unknown"]
    public static let focus = ["equilibrado", "pernas", "costas_ombros", "peito_bracos", "abdomen"]
    public enum Failure: Error { case invalidSession, invalidAdjustment, conflict }
    private static func rows(_ a: [ReadRow]) -> JSONValue { .array(a.map { .object($0.fields) }) }
    private static func whole(_ row: ReadRow, _ key: String, _ max: Double, min: Double = 0) -> JSONValue {
        guard let n = row.number(key), n.isFinite, n >= min, n <= max, n == floor(n) else { return .null }
        return .number(n)
    }
    public static func numericSet(_ row: ReadRow) -> ReadRow {
        let load = row.number("load_kg").flatMap { $0.isFinite && $0 >= 0 && $0 <= 1000 ? $0 : nil }
        return ReadRow(fields: ["kind": .string(row.string("kind") == "warmup" ? "warmup" : "work"), "load_kg": jsonNumber(load),
            "reps": whole(row, "reps", 500), "seconds": whole(row, "seconds", 7200), "rir": whole(row, "rir", 10)])
    }
    public static func context(_ data: ReadData, sessionID: String, catalog: [ReadRow], planned: [String: ReadRow] = [:], appliedRules: [String: String] = [:]) throws -> ReadRow {
        guard let session = data.active("sessions").first(where: { $0.id == sessionID }), session.string("status") == "done", session.string("detail") == "full", let date = session.string("local_date") else { throw Failure.invalidSession }
        // Only built-in names; custom exercise names can contain arbitrary personal text.
        let names = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0.string("name") ?? "Exercício personalizado") })
        func name(_ id: String?) -> String { id.flatMap { names[$0] } ?? "Exercício personalizado" }
        let plans = data.active("plans").filter { ($0.string("active_from") ?? "") <= date }.sorted {
            let a = $0.string("active_from") ?? "", b = $1.string("active_from") ?? ""
            if a != b { return a > b }
            let x = $0.number("updated_at") ?? 0, y = $1.number("updated_at") ?? 0
            return x == y ? $0.id < $1.id : x > y
        }
        let plan = plans.first
        let params = plan?.object("params") ?? ReadRow(fields: [:])
        let rawFocus: [JSONValue]
        if case .array(let values) = params.fields["focus"] { rawFocus = values }
        else { rawFocus = [params.fields["focus"] == .null ? .string("equilibrado") : params.fields["focus"] ?? .string("equilibrado")] }
        let allowedFocus = rawFocus.filter { if case .string(let f) = $0 { return focus.contains(f) }; return false }
        func items(_ s: ReadRow) -> [ReadRow] {
            Workout.items(data, s.id).enumerated().map { slot, item in
                let sets = Workout.ordered((data.tables["sets"] ?? []).filter { $0.string("session_id") == s.id && $0.string("item_id") == item.id && $0.string("exercise_id") == item.string("exercise_id") })
                let rule = appliedRules[item.id] ?? "unknown"
                return ReadRow(fields: ["slot": .number(Double(slot)), "exercise": .string(name(item.string("exercise_id"))),
                    "original": item.string("original_exercise_id").map { .string(name($0)) } ?? .null,
                    "status": .string(["done", "skipped", "not_done", "pending"].contains(item.string("status") ?? "") ? item.string("status")! : "not_done"),
                    "planned_sets": item.fields["planned_sets"] ?? .number(0), "target_min": item.fields["target_min"] ?? .number(0), "target_max": item.fields["target_max"] ?? .number(0), "warmup_sets": item.fields["warmup_sets"] ?? .number(0),
                    "planned": rows(sets.compactMap { planned[$0.id].map(numericSet) }),
                    "done": rows(sets.filter { !$0.deleted && $0.number("completed_at") != nil }.map(numericSet)),
                    "rule": .string(rules.contains(rule) ? rule : "unknown")])
            }
        }
        let previous: [ReadRow] = session.string("routine_id") == nil ? [] : data.active("sessions").filter {
            $0.id != session.id && $0.string("routine_id") == session.string("routine_id") && $0.string("status") == "done" && $0.string("detail") == "full" && ($0.number("started_at") ?? 0) < (session.number("started_at") ?? 0)
        }.sorted { ($0.number("started_at") ?? 0) == ($1.number("started_at") ?? 0) ? $0.id < $1.id : ($0.number("started_at") ?? 0) > ($1.number("started_at") ?? 0) }.prefix(3).map {
            ReadRow(fields: ["days_ago": .number(Double(max(0, LocalDay.distance($0.string("local_date") ?? date, date)))), "deload": .bool($0.bool("deload") == true), "items": rows(items($0))])
        }
        return ReadRow(fields: ["version": .number(1), "week": plan.map { .number(floor(Double(LocalDay.distance($0.string("active_from") ?? date, date)) / 7) + 1) } ?? .null,
            "focus": .array(allowedFocus), "deload": .bool(session.bool("deload") == true), "items": rows(items(session)), "previous": rows(previous)])
    }
    public static func validAdjustment(_ a: ReadRow, slots: Int, catalog: [ReadRow]) -> Bool {
        guard Set(a.fields.keys) == Set(["operation", "slot", "sets", "min", "max", "replacement"]),
              let slot = a.number("slot"), slot >= 0, slot < Double(slots), slot == floor(slot) else { return false }
        let empty: (String) -> Bool = { a.fields[$0] == .null }
        switch a.string("operation") {
        case "series": return whole(a, "sets", 12, min: 1) != .null && empty("min") && empty("max") && empty("replacement")
        case "repeticoes": return empty("sets") && whole(a, "min", 3600, min: 1) != .null && whole(a, "max", 3600, min: a.number("min") ?? 1) != .null && empty("replacement")
        case "trocar": return empty("sets") && empty("min") && empty("max") && catalog.contains { $0.id == a.string("replacement") }
        default: return false
        }
    }
    public static func parseReply(_ raw: ReadRow, slots: Int, catalog: [ReadRow]) -> ReadRow? {
        func validText(_ s: String?, max: Int) -> Bool {
            guard let s, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, s.utf16.count <= max else { return false }
            return s.range(of: "[\\x{2013}\\x{2014}\\p{Extended_Pictographic}]", options: .regularExpression) == nil
        }
        guard validText(raw.string("summary"), max: 600), case .array(let points) = raw.fields["points"], points.count <= 3,
              points.allSatisfy({ if case .string(let s) = $0 { return validText(s, max: 300) }; return false }) else { return nil }
        let a = raw.object("adjustment")
        return ReadRow(fields: ["summary": raw.fields["summary"]!, "points": .array(points), "adjustment": validAdjustment(a, slots: slots, catalog: catalog) ? .object(a.fields) : .null])
    }
    /// Local-only binding, never serialized into the HTTP context.
    public static func binding(_ data: ReadData, sessionID: String) throws -> ReadRow {
        guard let session = data.active("sessions").first(where: { $0.id == sessionID }), session.string("status") == "done" else { throw Failure.invalidSession }
        let routine = data.active("routines").first { $0.id == session.string("routine_id") }
        let planID = data.plan(session.string("local_date") ?? LocalDay.today())?.id
        let plan = data.active("plans").first { $0.id == planID }
        let params = data.active("profiles").first?.fields["onboarding"] ?? plan?.fields["params"] ?? .null
        return ReadRow(fields: ["session": .object(session.fields), "items": rows(Workout.items(data, sessionID)),
            "routine": routine.map { .object($0.fields) } ?? .null, "routineItems": rows(routine.map { data.items($0.id) } ?? []),
            "routines": rows(data.routines), "allRoutineItems": rows(Workout.ordered(data.active("routine_items"))),
            "plan": plan.map { .object($0.fields) } ?? .null, "params": params == .null ? plan?.fields["params"] ?? .null : params])
    }
    public static func withoutSequence(_ row: ReadRow) -> ReadRow {
        var row = row; row.fields.removeValue(forKey: "server_seq"); return row
    }
    /// Mirrors executeTool(editar_ficha) and apply.fichaChanges, including replacement tombstones.
    public static func changes(_ a: ReadRow, binding: ReadRow, catalog: [ReadRow], newID: () -> String = Workout.id) throws -> [PushChange] {
        let items = binding.array("items"), routine = binding.object("routine"), old = binding.array("routineItems")
        guard validAdjustment(a, slots: items.count, catalog: catalog), !routine.id.isEmpty, routine.bool("archived") != true, !routine.deleted else { throw Failure.invalidAdjustment }
        let item = items[Int(a.number("slot")!)]
        let exercise = item.string("original_exercise_id") ?? item.string("exercise_id") ?? ""
        guard let at = old.firstIndex(where: { $0.string("exercise_id") == exercise }), old.filter({ $0.string("exercise_id") == exercise }).count == 1 else { throw Failure.invalidAdjustment }
        var after = old
        switch a.string("operation") {
        case "series": after[at].fields["sets"] = a.fields["sets"]
        case "repeticoes": after[at].fields["target_min"] = a.fields["min"]; after[at].fields["target_max"] = a.fields["max"]
        case "trocar":
            guard !old.contains(where: { $0.string("exercise_id") == a.string("replacement") }) else { throw Failure.invalidAdjustment }
            after[at].fields["exercise_id"] = a.fields["replacement"]
        default: throw Failure.invalidAdjustment
        }
        // Same persisted bounds as the Waltér tool, including rows the adjustment keeps.
        for row in after {
            guard whole(row, "sets", 12, min: 1) != .null, whole(row, "target_min", 3600, min: 1) != .null,
                  whole(row, "target_max", 3600, min: row.number("target_min") ?? 1) != .null,
                  whole(row, "rest_sec", 600) != .null else { throw Failure.invalidAdjustment }
        }
        var unused = old, changes: [PushChange] = []
        for (position, row) in after.enumerated() {
            let kept = unused.firstIndex { $0.string("exercise_id") == row.string("exercise_id") }
            var next: ReadRow
            if let kept { next = unused.remove(at: kept) }
            else { next = ReadRow(fields: ["id": .string(newID()), "deleted": .bool(false), "routine_id": .string(routine.id), "warmup_sets": .number(0), "note": .null, "reason": .null]) }
            for key in ["exercise_id", "sets", "target_min", "target_max", "rest_sec"] { next.fields[key] = row.fields[key] }
            next.fields["position"] = .number(Double(position))
            changes.append(PushChange("routine_items", next))
        }
        changes += unused.map { PushChange("routine_items", $0.changing(["deleted": .bool(true)])) }
        return changes
    }
}
