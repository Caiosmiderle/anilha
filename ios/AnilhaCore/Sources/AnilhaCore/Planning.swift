import Foundation

// Only calendar/rotation projection, not the fatigue recommender or execution engine.
public struct PlanDay: Codable, Equatable, Sendable {
    public var weekday: Int
    public var kind: String
    public var split_key: String?
    public var run_type: String?
    public var time: String?
}

public struct PlanRules: Codable, Equatable, Sendable {
    public var no_legs_before_run: Bool
    public var rotation: [String]?
}

public struct Plan: Codable, Sendable {
    public var id: String
    public var active_from: String
    public var updated_at: Double
    public var days: [PlanDay]
    public var rules: PlanRules
}

public struct SessionSummary: Codable, Sendable {
    public var local_date: String
    public var split_key: String?
    public init(local_date: String, split_key: String?) {
        self.local_date = local_date
        self.split_key = split_key
    }
}

public struct RunSummary: Codable, Sendable {
    public var local_date: String
    public var run_type: String?
    public init(local_date: String, run_type: String?) {
        self.local_date = local_date
        self.run_type = run_type
    }
}

public struct OverrideSummary: Codable, Sendable {
    public var local_date: String
    public var action: String
    public init(local_date: String, action: String) {
        self.local_date = local_date
        self.action = action
    }
}

public struct TodayRecommendation: Codable, Sendable {
    public var kind: String
    public var split_key: String?
    public var run_type: String?
}

public struct ProjectionInput: Codable, Sendable {
    public struct Schedule: Codable, Sendable {
        public var days: [PlanDay]
        public var rules: PlanRules
        public init(days: [PlanDay], rules: PlanRules) { self.days = days; self.rules = rules }
    }
    public var plan: Schedule
    public var sessions: [SessionSummary]
    public var runs: [RunSummary]
    public var overrides: [OverrideSummary]?
    public var today: String
    public var todayRec: TodayRecommendation?
    public init(plan: Schedule, sessions: [SessionSummary], runs: [RunSummary],
                overrides: [OverrideSummary], today: String) {
        self.plan = plan; self.sessions = sessions; self.runs = runs
        self.overrides = overrides; self.today = today
    }
}

public struct DayView: Codable, Equatable, Sendable {
    public var date: String
    public var weekday: Int
    public var kind: String
    public var split_key: String?
    public var run_type: String?
    public var time: String?
    public var state: String
}

public enum LocalDay {
    // UTC Gregorian arithmetic on date-only strings, independent of device DST/locale.
    private static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        return c
    }
    private static func date(_ day: String) -> Date {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        precondition(parts.count == 3, "Invalid calendar day")
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }
    public static func add(_ day: String, _ n: Int) -> String {
        let d = calendar.date(byAdding: .day, value: n, to: date(day))!
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    public static func weekday(_ day: String) -> Int {
        (calendar.component(.weekday, from: date(day)) + 5) % 7
    }
    public static func today(_ date: Date = .now) -> String {
        var local = Calendar(identifier: .gregorian)
        local.timeZone = .current
        let c = local.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
}

public struct SplitInfo: Codable, Sendable {
    public let id: String
    public let name: String
    public let legs: Bool
}

public enum Planning {
    public static let splits: [SplitInfo] = {
        // A missing/corrupt build resource must fail in CI, never silently change rotation.
        let url = Bundle.module.url(forResource: "splits", withExtension: "json")!
        return try! JSONDecoder().decode([SplitInfo].self, from: Data(contentsOf: url))
    }()

    public static func planForDay(_ plans: [Plan], day: String) -> Plan? {
        let end = LocalDay.add(day, 6 - LocalDay.weekday(day))
        var best: Plan?
        for p in plans where p.active_from <= end {
            if best == nil || p.active_from > best!.active_from ||
                (p.active_from == best!.active_from && p.updated_at > best!.updated_at) { best = p }
        }
        return best
    }

    public static func rotationQueue(_ rotation: [String], sessions: [SessionSummary]) -> [String] {
        var last: (index: Int, date: String)?
        for s in sessions {
            guard let split = s.split_key, let i = rotation.firstIndex(of: split) else { continue }
            if last == nil || s.local_date >= last!.date { last = (i, s.local_date) }
        }
        guard !rotation.isEmpty else { return [] }
        let start = last.map { ($0.index + 1) % rotation.count } ?? 0
        return rotation.indices.map { rotation[(start + $0) % rotation.count] }
    }

    // Port of src/engine/weekView.ts projectDays. Keep the order of inputs (same-day ties).
    public static func projectDays(_ input: ProjectionInput, from: String, count: Int) -> [DayView] {
        let today = input.today
        let plan = input.plan
        let rotation = plan.rules.rotation.flatMap { $0.isEmpty ? nil : $0 }
        let done = input.sessions.filter { $0.local_date <= today }
        func sessionOn(_ d: String) -> SessionSummary? { done.first { $0.local_date == d } }
        func runOn(_ d: String) -> RunSummary? { input.runs.first { $0.local_date == d && d <= today } }
        func planned(_ d: String) -> PlanDay? { plan.days.first { $0.weekday == LocalDay.weekday(d) } }
        func kindOn(_ d: String) -> String {
            let action = input.overrides?.first { $0.local_date == d }?.action
            if action == "rest" { return "rest" }
            if action == "run" { return "run" }
            return planned(d)?.kind ?? "rest"
        }
        var queue = rotation.map { rotationQueue($0, sessions: done) } ?? []
        let rec = input.todayRec
        if rotation != nil, sessionOn(today) == nil, rec?.kind == "gym", let split = rec?.split_key {
            queue = [split] + queue.filter { $0 != split }
        }
        func take(_ d: String) -> String? {
            guard !queue.isEmpty else { return nil }
            let avoid = plan.rules.no_legs_before_run && kindOn(LocalDay.add(d, 1)) == "run"
            let i = avoid ? queue.firstIndex { s in !splits.contains { $0.id == s && $0.legs } } ?? 0 : 0
            let picked = queue.remove(at: i)
            queue.append(picked)
            return picked
        }
        if from > today {
            let todayGym = rec.map { $0.kind == "gym" } ?? (kindOn(today) == "gym")
            if todayGym && sessionOn(today) == nil { _ = take(today) }
            var d = LocalDay.add(today, 1)
            while d < from {
                if kindOn(d) == "gym" { _ = take(d) }
                d = LocalDay.add(d, 1)
            }
        }
        return (0..<max(0, count)).map { i in
            let d = LocalDay.add(from, i)
            let p = planned(d)
            var out = DayView(date: d, weekday: LocalDay.weekday(d), kind: "rest",
                              split_key: nil, run_type: nil, time: p?.time,
                              state: d == today ? "hoje" : "por_vir")
            if d <= today, let session = sessionOn(d) {
                out.kind = "gym"; out.split_key = session.split_key; out.state = "feito"
            } else if d <= today, let run = runOn(d) {
                out.kind = "run"; out.run_type = run.run_type; out.state = "feito"
            } else if d < today {
                out.kind = kindOn(d); out.state = "passou"
                out.split_key = out.kind == "gym" ? p?.split_key : nil
                out.run_type = out.kind == "run" ? p?.run_type ?? "leve" : nil
            } else if d == today, let rec {
                out.kind = rec.kind
                out.split_key = rec.kind == "gym" ? (rotation != nil ? take(d) : rec.split_key) : nil
                out.run_type = rec.kind == "run" ? rec.run_type ?? "leve" : nil
            } else {
                out.kind = kindOn(d)
                out.split_key = out.kind == "gym" ? (rotation != nil ? take(d) : p?.split_key) : nil
                out.run_type = out.kind == "run" ? p?.run_type ?? "leve" : nil
            }
            return out
        }
    }
}
