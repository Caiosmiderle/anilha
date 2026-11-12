import Foundation

public struct TrainingCalendarInput: Codable, Sendable {
    public var month: String
    public var today: String
    public var plans: [ReadRow]
    public var routines: [ReadRow]
    public var sessions: [ReadRow]
    public var runs: [ReadRow]
    public var externalPlans: [ReadRow]
    public var overrides: [ReadRow]
    public init(data: ReadData, month: String, today: String) {
        self.month = month
        self.today = today
        plans = data.active("plans")
        routines = data.active("routines")
        sessions = data.active("sessions")
        runs = data.active("runs")
        externalPlans = data.active("external_plan_items")
        overrides = data.active("day_overrides")
    }
}

public struct CalendarEvent: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var kind: String
    public var status: String
    public var title: String
    public var split: String?
    public var sessionID: String?
    public var routineID: String?
    public var runID: String?
    public var externalID: String?
    public var runType: String?
    public var distanceKm: Double?
    public var important: Bool = false
}

public struct CalendarDay: Codable, Equatable, Identifiable, Sendable {
    public var date: String
    public var today: Bool
    public var events: [CalendarEvent]
    public var warnings: [String]
    public var id: String { date }
}

/// Port of src/engine/calendar.ts. The fixtures are emitted from that function.
public enum TrainingCalendar {
    public static func days(_ input: TrainingCalendarInput) -> [CalendarDay] {
        let sessions = input.sessions.filter { !$0.deleted && $0.string("status") == "done" }.sorted {
            let a = $0.string("local_date") ?? "", b = $1.string("local_date") ?? ""
            if a != b { return a > b }
            let x = $0.number("started_at") ?? 0, y = $1.number("started_at") ?? 0
            return x == y ? $0.id < $1.id : x > y
        }
        let runs = input.runs.filter { !$0.deleted }
        let plans = input.plans.filter { !$0.deleted }.compactMap { try? $0.decode(Plan.self) }
        let overrides = input.overrides.filter { !$0.deleted }
        let external = input.externalPlans.filter {
            !$0.deleted && $0.string("source") == "crunning" && $0.string("kind") == "corrida"
        }
        let routines = input.routines.filter { !$0.deleted && $0.bool("archived") != true }.sorted {
            let a = $0.number("position") ?? 0, b = $1.number("position") ?? 0
            return a == b ? $0.id < $1.id : a < b
        }
        var dates: [String] = []
        let first = "\(input.month)-01"
        var current = first
        while current.hasPrefix(input.month + "-") {
            dates.append(current)
            current = LocalDay.add(current, 1)
        }
        var projections: [String: [DayView]] = [:]
        return dates.map { date in
            var events: [CalendarEvent] = []
            var warnings: [String] = []
            for row in sessions where row.string("local_date") == date {
                events.append(CalendarEvent(id: "session:\(row.id)", kind: "strength", status: "done",
                    title: row.string("title") ?? "", split: row.string("split_key"),
                    sessionID: row.id, routineID: row.string("routine_id")))
            }
            for row in runs where row.string("local_date") == date &&
                (row.string("activity") == nil || row.string("activity") == "corrida") {
                events.append(CalendarEvent(id: "run:\(row.id)", kind: "run", status: "done", title: "Corrida",
                    runID: row.id, runType: row.string("source_type") ?? row.string("run_type"),
                    distanceKm: row.number("distance_km")))
            }
            for row in external where row.string("local_date") == date &&
                ["planejada", "perdida"].contains(row.string("status") ?? "") {
                events.append(CalendarEvent(id: "external:\(row.id)", kind: "run",
                    status: row.string("status") == "perdida" ? "missed" : "planned",
                    title: row.string("name") ?? "Corrida", externalID: row.id,
                    runType: row.string("source_type") ?? row.string("run_type"),
                    distanceKm: row.number("distance_m").map { $0 / 1000 }, important: row.bool("important") == true))
            }
            if date >= input.today, let plan = Planning.planForDay(plans, day: date),
               !events.contains(where: { $0.kind == "strength" }) {
                if projections[plan.id] == nil {
                    let projection = ProjectionInput(plan: .init(days: plan.days, rules: plan.rules),
                        sessions: sessions.map { SessionSummary(local_date: $0.string("local_date") ?? "", split_key: $0.string("split_key")) },
                        runs: runs.map { RunSummary(local_date: $0.string("local_date") ?? "", run_type: $0.string("run_type")) },
                        overrides: overrides.map { OverrideSummary(local_date: $0.string("local_date") ?? "", action: $0.string("action") ?? "") },
                        today: input.today)
                    projections[plan.id] = Planning.projectDays(projection, from: first, count: dates.count)
                }
                if let day = projections[plan.id]?.first(where: { $0.date == date }), day.kind == "gym",
                   day.state != "feito", let split = day.split_key {
                    let same = routines.filter { $0.string("split_key") == split }
                    let routine = same.first(where: isPlanRoutine) ?? same.first
                    events.append(CalendarEvent(id: "strength:\(date)", kind: "strength", status: "planned",
                        title: routine?.string("name") ?? Planning.splits.first { $0.id == split }?.name ?? split,
                        split: split, routineID: routine?.id))
                    if let warning = legsBeforeRunAlert(day: date, split: split, plan: plan, overrides: overrides, external: external) {
                        warnings.append(warning)
                    }
                }
            }
            return CalendarDay(date: date, today: date == input.today, events: events, warnings: warnings)
        }
    }

    private static func isPlanRoutine(_ row: ReadRow) -> Bool {
        if let origin = row.string("origin") { return origin == "plano" }
        let reason = row.string("reason") ?? ""
        if row.id.hasPrefix("pronta-") || row.id.hasPrefix("recebida-") ||
            reason == "Ficha pronta do Anilha" || reason.hasPrefix("Enviada ") { return false }
        return reason.range(of: #"^\d+ exercícios, \d+ séries de trabalho\.$"#, options: .regularExpression) != nil
    }

    // Same guard and wording as recommend.ts legsBeforeRunAlert, without fatigue rules.
    static func legsBeforeRunAlert(day: String, split: String, plan: Plan,
                                            overrides: [ReadRow], external: [ReadRow]) -> String? {
        guard plan.rules.no_legs_before_run, Planning.splits.contains(where: { $0.id == split && $0.legs }) else { return nil }
        let tomorrow = LocalDay.add(day, 1)
        let action = overrides.first { $0.string("local_date") == tomorrow }?.string("action")
        let run = external.first {
            $0.string("local_date") == tomorrow && $0.string("status") == "planejada" && $0.bool("important") == true
        }
        let planned = plan.days.first { $0.weekday == LocalDay.weekday(tomorrow) }
        guard run != nil || action == "run" || (planned?.kind == "run" && action != "rest") else { return nil }
        if let run {
            return "Corrida planejada no CRUNNING: \(run.string("name") ?? "corrida importante"), amanhã (\(tomorrow)). Sugiro deixar perna para outro dia. Confirme ao iniciar ou escolha outro treino."
        }
        return "Corrida amanhã cedo, então perna fica para outro dia."
    }
}
