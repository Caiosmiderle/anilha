import Foundation

/// Review of the engine, with the same closed adjustment contract as WorkoutAnalysis.
public enum RoutineReview {
    public static let groups = ["costas", "peito", "ombros", "biceps", "triceps", "quadriceps", "posteriores", "panturrilha", "core"]
    private static func rows(_ a: [ReadRow]) -> JSONValue { .array(a.map { .object($0.fields) }) }
    public static func binding(_ data: ReadData, routineID: String, today: String) throws -> ReadRow {
        guard let routine = data.routines.first(where: { $0.id == routineID }) else { throw WorkoutAnalysis.Failure.invalidSession }
        let plan = data.active("plans").first { $0.id == data.plan(today)?.id }
        let profile = data.active("profiles").first
        let params = profile?.fields["onboarding"].flatMap { $0 == .null ? nil : $0 } ?? plan?.fields["params"] ?? .null
        return ReadRow(fields: ["routine": .object(routine.fields), "items": rows(data.items(routineID)), "routineItems": rows(data.items(routineID)),
            "routines": rows(data.routines), "allRoutineItems": rows(Workout.ordered(data.active("routine_items"))), "plan": plan.map { .object($0.fields) } ?? .null, "params": params])
    }
    public static func version(_ data: ReadData, routineID: String) -> ReadRow {
        let routine = data.routines.first { $0.id == routineID }
        return ReadRow(fields: ["routine": routine.map { .object(WorkoutAnalysis.withoutSequence($0).fields) } ?? .null,
            "items": rows(data.items(routineID).map(WorkoutAnalysis.withoutSequence))])
    }
    public static func context(_ data: ReadData, routineID: String, today: String, catalog: [ReadRow]) throws -> ReadRow {
        let b = try binding(data, routineID: routineID, today: today), routine = b.object("routine"), plan = b.object("plan")
        let names = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0.string("name") ?? "Exercício personalizado") })
        var pairs: [String: Int] = [:]
        let items = data.items(routineID).enumerated().map { slot, i -> ReadRow in
            if let pair = i.string("superset"), pairs[pair] == nil { pairs[pair] = pairs.count }
            return ReadRow(fields: ["slot": .number(Double(slot)), "exercise": .string(names[i.string("exercise_id") ?? ""] ?? "Exercício personalizado"),
                "sets": i.fields["sets"] ?? .number(0), "min": i.fields["target_min"] ?? .number(0), "max": i.fields["target_max"] ?? .number(0),
                "warmup": i.fields["warmup_sets"] ?? .number(0), "pair": i.string("superset").flatMap { pairs[$0] }.map { .number(Double($0)) } ?? .null])
        }
        let p = b.object("params"), profile = data.active("profiles").first
        let raw = p.fields["focus"] ?? .string("equilibrado")
        let focus: [JSONValue]
        if case .array(let a) = raw { focus = a } else { focus = [raw == .null ? .string("equilibrado") : raw] }
        let allowed = focus.filter { if case .string(let s) = $0 { return WorkoutAnalysis.focus.contains(s) }; return false }
        var schedule: [ReadRow] = []
        if let decoded = try? plan.decode(Plan.self) {
            let sessions = data.active("sessions").filter { $0.string("status") == "done" }.map { SessionSummary(local_date: $0.string("local_date") ?? "", split_key: $0.string("split_key")) }
            let runs = data.active("runs").map { RunSummary(local_date: $0.string("local_date") ?? "", run_type: $0.string("run_type")) }
            let overrides = data.active("day_overrides")
            let external = data.active("external_plan_items").filter { $0.string("source") == "crunning" && $0.string("kind") == "corrida" }
            let input = ProjectionInput(plan: .init(days: decoded.days, rules: decoded.rules), sessions: sessions, runs: runs,
                overrides: overrides.map { OverrideSummary(local_date: $0.string("local_date") ?? "", action: $0.string("action") ?? "") }, today: today)
            schedule = Planning.projectDays(input, from: today, count: 15).enumerated().map { offset, d in
                let alert = d.split_key.flatMap { TrainingCalendar.legsBeforeRunAlert(day: d.date, split: $0, plan: decoded, overrides: overrides, external: external) }
                return ReadRow(fields: ["days_ahead": .number(Double(offset)), "weekday": .number(Double(d.weekday)), "kind": .string(d.kind), "split": d.split_key.map(JSONValue.string) ?? .null,
                    "target": .bool(d.split_key != nil && d.split_key == routine.string("split_key")), "legs_before_run": .bool(alert != nil)])
            }
        }
        let metrics = WorkoutAnalysis.reviewMetrics(b)
        return ReadRow(fields: ["version": .number(1), "split": routine.fields["split_key"] ?? .string(""), "days": plan.fields["gym_per_week"] ?? p.fields["gym_days"] ?? .number(0),
            "focus": .array(allowed), "deload": .bool(profile?.string("deload_week") == History.weekStart(today)), "items": rows(items), "volume": metrics.fields["volume"]!, "warnings": metrics.fields["warnings"]!,
            "running": .object(RunningContext.build(data, date: today, window: 14).fields), "schedule": rows(schedule)])
    }
    public static func parseReply(_ raw: ReadRow, slots: Int, catalog: [ReadRow]) -> ReadRow? {
        func text(_ s: String?, max: Int) -> Bool {
            guard let s, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, s.utf16.count <= max else { return false }
            return s.range(of: "[\\x{2013}\\x{2014}\\p{Extended_Pictographic}]", options: .regularExpression) == nil
        }
        guard Set(raw.fields.keys) == Set(["avaliacao", "resumo", "pontos", "ajustes"]), ["boa", "ajustavel", "revisar"].contains(raw.string("avaliacao") ?? ""),
              text(raw.string("resumo"), max: 600), case .array(let points) = raw.fields["pontos"], points.count <= 3,
              points.allSatisfy({ if case .string(let s) = $0 { return text(s, max: 300) }; return false }),
              case .array(let adjustments) = raw.fields["ajustes"], adjustments.count <= 3 else { return nil }
        let valid = raw.array("ajustes").filter { a in
            var stripped = a; stripped.fields.removeValue(forKey: "motivo")
            return text(a.string("motivo"), max: 180) && WorkoutAnalysis.validAdjustment(stripped, slots: slots, catalog: catalog)
        }
        return raw.changing(["ajustes": rows(valid)])
    }
    public static func adjustment(_ saved: ReadRow, index: Int) throws -> ReadRow {
        let a = saved.object("reply").array("ajustes")
        guard a.indices.contains(index) else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        var row = a[index]; row.fields.removeValue(forKey: "motivo"); return row
    }
}
