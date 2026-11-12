import Foundation

public struct ReadData: Sendable {
    public var tables: [String: [ReadRow]]
    public init(tables: [String: [ReadRow]] = [:]) { self.tables = tables }
    public func active(_ table: String) -> [ReadRow] { (tables[table] ?? []).filter { !$0.deleted } }
    public func exercises(catalog: [ReadRow]) -> [String: ReadRow] {
        var all = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        for row in tables["exercises"] ?? [] {
            if row.deleted { all.removeValue(forKey: row.id) }
            else { all[row.id] = row }
        }
        return all
    }
    public var routines: [ReadRow] {
        active("routines").filter { $0.bool("archived") != true }.sorted {
            let a = $0.number("position") ?? 0, b = $1.number("position") ?? 0
            return a == b ? $0.id < $1.id : a < b
        }
    }
    public func items(_ routineID: String) -> [ReadRow] {
        active("routine_items").filter { $0.string("routine_id") == routineID }.sorted {
            let a = $0.number("position") ?? 0, b = $1.number("position") ?? 0
            return a == b ? $0.id < $1.id : a < b
        }
    }
    public var lastLoads: [String: (kg: Double, date: String)] {
        let done = Dictionary(uniqueKeysWithValues: active("sessions")
            .filter { $0.string("status") == "done" }.map { ($0.id, $0) })
        let items = Dictionary(uniqueKeysWithValues: active("session_items").map { ($0.id, $0) })
        var latest: [String: (kg: Double, date: String, completed: Double, id: String)] = [:]
        for set in active("sets") {
            guard let exerciseID = set.string("exercise_id"), set.string("kind") == "work",
                  let completed = set.number("completed_at"), let kg = set.number("load_kg"),
                  let sessionID = set.string("session_id"), let session = done[sessionID],
                  let date = session.string("local_date"),
                  let itemID = set.string("item_id"), let item = items[itemID],
                  item.string("session_id") == sessionID,
                  item.string("exercise_id") == exerciseID,
                  item.string("status") != "skipped", item.string("status") != "not_done" else { continue }
            if let old = latest[exerciseID],
               old.completed > completed || (old.completed == completed && old.id > set.id) { continue }
            latest[exerciseID] = (kg, date, completed, set.id)
        }
        return latest.mapValues { ($0.kg, $0.date) }
    }
    public func plan(_ today: String) -> Plan? {
        Planning.planForDay(active("plans").compactMap { try? $0.decode(Plan.self) }, day: today)
    }
    public func plannedToday(_ today: String) -> DayView? {
        guard let plan = plan(today) else { return nil }
        // Keep planned separate from done: today's completions appear in their own section.
        let sessions = active("sessions").filter {
            $0.string("status") == "done" && ($0.string("local_date") ?? "") < today
        }.sorted {
            // Match useSessions() in the PWA before rotationQueue resolves same-date ties.
            let a = $0.string("local_date") ?? "", b = $1.string("local_date") ?? ""
            if a != b { return a > b }
            let x = $0.number("started_at") ?? 0, y = $1.number("started_at") ?? 0
            return x == y ? $0.id < $1.id : x > y
        }.map { SessionSummary(local_date: $0.string("local_date") ?? "", split_key: $0.string("split_key")) }
        let overrides = active("day_overrides").map {
            OverrideSummary(local_date: $0.string("local_date") ?? "", action: $0.string("action") ?? "")
        }
        let input = ProjectionInput(plan: .init(days: plan.days, rules: plan.rules),
                                    sessions: sessions, runs: [], overrides: overrides, today: today)
        return Planning.projectDays(input, from: today, count: 1).first
    }
}
