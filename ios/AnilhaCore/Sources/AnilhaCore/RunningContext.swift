import Foundation

public enum RunningContext {
    public static func build(_ data: ReadData, date: String, window: Int) -> ReadRow {
        let types = ["leve", "longo", "intervalado"]
        func numeric(_ n: Double?, max: Double) -> JSONValue {
            guard let n, n.isFinite, n >= 0, n <= max else { return .null }
            return .number(n)
        }
        func ordered(_ a: ReadRow, _ b: ReadRow) -> Bool {
            let x = a.string("local_date") ?? "", y = b.string("local_date") ?? ""
            return x == y ? a.id < b.id : x < y
        }
        let done = data.active("runs").filter { row in
            guard let day = row.string("local_date"), types.contains(row.string("run_type") ?? ""), row.string("activity") == nil || row.string("activity") == "corrida" else { return false }
            return (0...window).contains(LocalDay.distance(day, date))
        }.sorted(by: ordered).map { r in
            ReadRow(fields: ["days_ago": .number(Double(LocalDay.distance(r.string("local_date")!, date))), "type": .string(r.string("run_type")!),
                "km": numeric(r.number("distance_km"), max: 1000), "moving_sec": numeric(r.number("duration_sec"), max: 604800), "effort": numeric(r.number("rpe"), max: 10)])
        }
        let planned = data.active("external_plan_items").filter { row in
            guard let day = row.string("local_date"), row.string("source") == "crunning", row.string("kind") == "corrida", types.contains(row.string("run_type") ?? ""), ["planejada", "feita", "perdida"].contains(row.string("status") ?? "") else { return false }
            return (0...window).contains(LocalDay.distance(date, day))
        }.sorted(by: ordered).map { r in
            let day = r.string("local_date")!
            return ReadRow(fields: ["days_ahead": .number(Double(LocalDay.distance(date, day))), "weekday": .number(Double(LocalDay.weekday(day))),
                "type": .string(r.string("run_type")!), "km": numeric(r.number("distance_m").map { $0 / 1000 }, max: 1000), "status": .string(r.string("status")!), "important": .bool(r.bool("important") == true)])
        }
        return ReadRow(fields: ["done": .array(done.map { .object($0.fields) }), "planned": .array(planned.map { .object($0.fields) })])
    }
}
