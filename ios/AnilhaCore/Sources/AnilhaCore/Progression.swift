import Foundation

public extension ReadRow {
    func changing(_ changes: [String: JSONValue]) -> ReadRow {
        ReadRow(fields: fields.merging(changes) { _, new in new })
    }
    func object(_ key: String) -> ReadRow {
        if case .object(let fields) = fields[key] { return ReadRow(fields: fields) }
        return ReadRow(fields: [:])
    }
    func array(_ key: String) -> [ReadRow] {
        if case .array(let values) = fields[key] {
            return values.compactMap { if case .object(let f) = $0 { return ReadRow(fields: f) }; return nil }
        }
        return []
    }
}
public func jsonNumber(_ value: Double?) -> JSONValue { value.map(JSONValue.number) ?? .null }

/// Numeric decision contract from progression.ts. Portuguese explanations live in the UI.
public struct LoadSuggestion: Codable, Equatable, Sendable {
    public var kind: String
    public var load_kg: Double?
    public var target_min: Double
    public var target_max: Double
    public var confidence: String
    public var missing_effort: Bool
    public var based_on: ReadRow?

    public func last(_ index: Int) -> ReadRow {
        guard let based_on else { return ReadRow(fields: ["load_kg": .null, "value": .null]) }
        let count: Int
        if case .array(let values) = based_on.fields["values"] { count = values.count }
        else { count = 0 }
        let at = min(index, count - 1)
        func value(_ key: String) -> JSONValue {
            guard case .array(let values) = based_on.fields[key], values.indices.contains(at) else { return .null }
            return values[at]
        }
        return ReadRow(fields: ["load_kg": value("loads"), "value": value("values")])
    }
    public func prefill(_ index: Int) -> ReadRow {
        guard let based_on else { return last(index) }
        let last = last(index)
        let moved = kind == "increase" || kind == "decrease"
        if case .array(let loads) = based_on.fields["loads"] {
            let numbers = loads.map { value -> Double in if case .number(let n) = value { return n }; return 0 }
            if Set(numbers.map { Progression.round($0 * 100) }).count > 1 {
                let heaviest = last.number("load_kg").map { abs($0 - (based_on.number("load_kg") ?? 0)) < 0.01 } ?? false
                return moved && heaviest ? ReadRow(fields: ["load_kg": jsonNumber(load_kg), "value": .number(target_min)]) : last
            }
        }
        return ReadRow(fields: ["load_kg": jsonNumber(load_kg), "value": moved ? .number(target_min) : (last.fields["value"] == .null ? .number(target_min) : last.fields["value"] ?? .number(target_min))])
    }
}

public enum Progression {
    public static let lbPerKg = 2.20462262185
    // JavaScript Math.round, including negative halves.
    public static func round(_ n: Double) -> Double { floor(n + 0.5) }
    public static func repsBeforeJump(_ load: Double, up: Double, floor: Double) -> Double {
        min(30, floor + max(0, ceil((up / load - 1) / 0.025 - 1e-9)))
    }
    public static func nextLoad(_ load: Double, increment: Double, unit: String, down: Bool = false) -> Double {
        let direction = down ? -1.0 : 1.0
        if unit == "kg" { return round(max(0, load + increment * direction) * 100) / 100 }
        let step = max(2.5, round(increment * lbPerKg / 2.5) * 2.5)
        return max(0, round(load * lbPerKg * 2) / 2 + direction * step) / lbPerKg
    }
    public static func suggest(_ input: ReadRow) -> LoadSuggestion {
        let exercise = input.object("exercise"), target = input.object("target")
        let time = exercise.string("measure") == "time"
        let unit = input.string("unit") ?? "kg"
        let logs = input.array("logs").enumerated().sorted {
            let a = $0.element.string("local_date") ?? "", b = $1.element.string("local_date") ?? ""
            return a == b ? $0.offset < $1.offset : a < b
        }.map(\.element)
        struct Evaluation {
            let log: ReadRow; let sets: [ReadRow]; let values: [Double]; let load: Double?
            var top: Bool { values.allSatisfy { $0 >= max(log.number("target_min") ?? 0, log.number("target_max") ?? 0) } }
            var below: Bool { values.contains { $0 < (log.number("target_min") ?? 0) } }
        }
        let evaluated = logs.compactMap { log -> Evaluation? in
            let sets = log.array("sets").filter { $0.string("kind") == "work" && $0.number(time ? "seconds" : "reps") != nil }
            guard !sets.isEmpty else { return nil }
            return Evaluation(log: log, sets: sets, values: sets.compactMap { $0.number(time ? "seconds" : "reps") },
                              load: sets.compactMap { $0.number("load_kg") }.filter { $0 > 0 }.max())
        }
        var result = LoadSuggestion(kind: "first_time", load_kg: nil, target_min: target.number("min") ?? 0,
                                    target_max: target.number("max") ?? 0, confidence: "normal", missing_effort: false, based_on: nil)
        guard let last = evaluated.last else { return result }
        result.load_kg = last.load
        result.based_on = ReadRow(fields: ["local_date": last.log.fields["local_date"] ?? .null,
            "load_kg": jsonNumber(last.load), "values": .array(last.values.map(JSONValue.number)),
            "loads": .array(last.sets.map { $0.fields["load_kg"] ?? .null }), "last_rir": last.sets.last?.fields["rir"] ?? .null])
        let gap = LocalDay.distance(last.log.string("local_date") ?? "", input.string("today") ?? "")
        if gap > 21 { result.kind = "retrain"; return result }
        let prev = evaluated.count > 1 ? evaluated[evaluated.count - 2] : nil
        let increment = exercise.number("increment_kg") ?? 2.5
        if last.top {
            if let rir = last.sets.last?.number("rir"), rir <= 1 { result.kind = "hold_effort"; return result }
            if let load = last.load, !time, exercise.bool("bodyweight") != true {
                let up = nextLoad(load, increment: increment, unit: unit)
                let need = repsBeforeJump(load, up: up, floor: result.target_min)
                if (last.values.min() ?? 0) < need { result.kind = "reps_first"; return result }
            }
            let again = prev.map { $0.top && abs(($0.load ?? 0) - (last.load ?? 0)) < 0.01 } ?? false
            let maximum = max(last.log.number("target_min") ?? 0, last.log.number("target_max") ?? 0)
            let clear = last.values.allSatisfy { $0 >= maximum + (time ? 10 : 2) }
            if !again && !clear { result.kind = "confirm"; return result }
            result.missing_effort = last.sets.last?.number("rir") == nil
            result.confidence = result.missing_effort ? "low" : "normal"
            result.kind = last.load == nil ? "progress_variation" : "increase"
            result.load_kg = last.load.map { nextLoad($0, increment: increment, unit: unit) }
        } else if last.below {
            if prev?.below == true, let load = last.load {
                let down = nextLoad(load, increment: increment, unit: unit, down: true)
                if down > 0 { result.kind = "decrease"; result.load_kg = down; return result }
            }
            result.kind = "hold_below"
        } else { result.kind = "hold_reps" }
        return result
    }
    public static func warmupLoads(_ load: Double?, count: Int, increment: Double, simple: Bool) -> [Double?] {
        guard count > 0 else { return [] }
        return (0..<count).map { i in
            let percent = simple ? 0.4 : count == 1 ? 0.8 : 0.4 + 0.4 * Double(i) / Double(count - 1)
            guard let load, load > 0 else { return nil }
            let step = increment > 0 ? increment : 1
            return max(0, round(round(load * percent / step) * step * 100) / 100)
        }
    }
}
