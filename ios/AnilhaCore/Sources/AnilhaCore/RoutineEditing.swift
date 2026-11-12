import Foundation

public enum RoutineEditing {
    public enum Failure: Error { case invalid, conflict }

    public static func blank(id: String = Workout.id(), position: Int) -> ReadRow {
        ReadRow(fields: ["id": .string(id), "deleted": .bool(false), "name": .string("Novo treino"),
            "split_key": .string("livre"), "position": .number(Double(position)), "reason": .null,
            "archived": .bool(false), "origin": .string("pessoa")])
    }

    /// Defaults from generator.targetFor/restFor used by RoutineEdit, including custom exercises.
    public static func added(_ exercise: ReadRow, params: ReadRow) -> ReadRow {
        let compound = exercise.bool("compound") == true
        let easy = params.bool("returning") == true || params.string("level") == "iniciante"
        let goal = params.string("goal") ?? "hipertrofia"
        let range: (Double, Double)
        if exercise.string("measure") == "time" {
            range = exercise.string("pattern") == "core_lateral" ? (20, 30) : (30, 45)
        } else if exercise.string("primary_group") == "core" { range = (12, 15) }
        else if goal == "condicionamento" { range = compound ? (10, 15) : (12, 20) }
        else if compound { range = !easy && ["forca", "corrida"].contains(goal) ? (5, 8) : (8, 12) }
        else { range = easy ? (12, 15) : (10, 15) }
        let rest: Double = goal == "condicionamento" ? (compound ? 90 : 60) : (compound ? 120 : 90)
        return ReadRow(fields: ["exercise_id": .string(exercise.id), "sets": .number(3),
            "target_min": .number(range.0), "target_max": .number(range.1), "rest_sec": .number(rest),
            "warmup_sets": .number(0), "note": .null, "reason": .null])
    }

    /// Moving/removing a member breaks a bi-set when its two members cease to be adjacent.
    public static func unpairBroken(_ items: [ReadRow]) -> [ReadRow] {
        let keys = Set(items.compactMap { $0.string("superset") }.filter { !$0.isEmpty })
        let broken = keys.filter { key in
            let at = items.indices.filter { items[$0].string("superset") == key }
            return at.count != 2 || at[1] - at[0] != 1
        }
        return items.map { row in
            guard let key = row.string("superset"), broken.contains(key) else { return row }
            return row.changing(["superset": .null])
        }
    }

    public static func changes(routine: ReadRow, old: [ReadRow], after: [ReadRow], catalog: [ReadRow],
                               newID: () -> String = Workout.id) throws -> [PushChange] {
        let name = (routine.string("name") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80, Planning.splits.contains(where: { $0.id == routine.string("split_key") }) else { throw Failure.invalid }
        let exercises = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        let normalized = try unpairBroken(after).map { row -> ReadRow in
            guard let exercise = exercises[row.string("exercise_id") ?? ""] else { throw Failure.invalid }
            func whole(_ key: String, _ min: Double, _ max: Double) -> Bool {
                guard let value = row.number(key) else { return false }
                return value.isFinite && value == floor(value) && value >= min && value <= max
            }
            let limit: Double = exercise.string("measure") == "time" ? 600 : 50
            guard whole("sets", 1, 10), whole("warmup_sets", 0, 3), whole("target_min", 1, limit),
                  whole("target_max", 1, limit), whole("rest_sec", 0, 300) else { throw Failure.invalid }
            let lo = row.number("target_min")!, hi = row.number("target_max")!
            return row.changing(["target_min": .number(min(lo, hi)), "target_max": .number(max(lo, hi))])
        }
        return [PushChange("routines", routine.changing(["name": .string(name)]))]
            + WorkoutAnalysis.fichaChanges(routineID: routine.id, old: old, after: normalized, explicitExtras: true, newID: newID)
    }

    public static func deleteChanges(_ routine: ReadRow, items: [ReadRow]) -> [PushChange] {
        [PushChange("routines", routine.changing(["deleted": .bool(true)]))]
            + items.filter { $0.string("routine_id") == routine.id }.map { PushChange("routine_items", $0.changing(["deleted": .bool(true)])) }
    }
}
