import Foundation

/// Row construction only, ported from data/ops.ts planChanges. No training rules here.
public enum NewPlan {
    public static func isPlanRoutine(_ row: ReadRow) -> Bool {
        if let origin = row.string("origin"), !origin.isEmpty { return origin == "plano" }
        let reason = row.string("reason") ?? ""
        if row.id.hasPrefix("pronta-") || row.id.hasPrefix("recebida-") || reason == "Ficha pronta do Anilha" || reason.hasPrefix("Enviada ") { return false }
        return reason.range(of: #"^[0-9]+ exercícios, [0-9]+ séries de trabalho\.$"#, options: .regularExpression) != nil
    }
    /// Snapshot only of the rows whose edits would invalidate the preview. A new workout is safe.
    public static func binding(_ data: ReadData) -> ReadRow {
        ReadRow(fields: Dictionary(uniqueKeysWithValues: ["profiles", "plans", "routines", "routine_items"].map { table in
            (table, JSONValue.array((data.tables[table] ?? []).sorted { $0.id < $1.id }.map { row in
                var fields = row.fields; fields.removeValue(forKey: "server_seq")
                return .object(fields)
            }))
        }))
    }
    public static func changes(_ generated: ReadRow, params: ReadRow, today: String, profile: ReadRow,
                               routines: [ReadRow], newID: () -> String = Workout.id) -> [PushChange] {
        var changes = routines.filter { !$0.deleted && $0.bool("archived") != true && isPlanRoutine($0) }.sorted { $0.id < $1.id }.map {
            PushChange("routines", $0.changing(["origin": .string("plano"), "archived": .bool(true)]))
        }
        let rotation = generated.object("rules").fields["rotation"]
        // In JS even an empty array is truthy; only absence/null/false disables rotation.
        let rotates = rotation != nil && rotation != .null && rotation != .bool(false)
        let days = generated.array("days").map { day in
            rotates && day.string("kind") == "gym" ? day.changing(["split_key": .null]) : day
        }
        changes.append(PushChange("plans", ReadRow(fields: ["id": .string(newID()), "deleted": .bool(false),
            "active_from": .string(today), "gym_per_week": generated.fields["gym_per_week"] ?? .number(0),
            "run_per_week": generated.fields["run_per_week"] ?? .number(0), "days": .array(days.map { .object($0.fields) }),
            "rules": generated.fields["rules"] ?? .object([:]), "params": .object(params.fields), "reasons": generated.fields["reasons"] ?? .array([])])))
        for (position, routine) in generated.array("routines").enumerated() {
            let id = newID()
            changes.append(PushChange("routines", ReadRow(fields: ["id": .string(id), "deleted": .bool(false),
                "name": routine.fields["name"] ?? .string(""), "split_key": routine.fields["split_key"] ?? .null,
                "position": .number(Double(position)), "reason": routine.fields["reason"] ?? .null, "archived": .bool(false), "origin": .string("plano")])))
            for (index, item) in routine.array("items").enumerated() {
                changes.append(PushChange("routine_items", ReadRow(fields: ["id": .string(newID()), "deleted": .bool(false),
                    "routine_id": .string(id), "position": .number(Double(index)), "note": .null].merging(item.fields) { _, value in value })))
            }
        }
        let name = [params.string("first_name") ?? "", params.string("last_name") ?? ""].map {
            $0.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        }.filter { !$0.isEmpty }.joined(separator: " ")
        let returning = params.bool("returning") == true
        changes.append(PushChange("profiles", profile.changing(["display_name": name.isEmpty ? profile.fields["display_name"] ?? .string("") : .string(name),
            "onboarding": .object(params.fields), "return_mode": returning ? .string("on") : profile.string("return_mode") == "on" ? .string("auto") : profile.fields["return_mode"] ?? .string("auto"),
            "return_started_on": returning ? profile.string("return_started_on").map(JSONValue.string) ?? .string(today) : profile.fields["return_started_on"] ?? .null])))
        return changes
    }
}
