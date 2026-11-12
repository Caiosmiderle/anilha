import Foundation

// Preserve nullable/unknown columns, without coupling the read cache to all web domain types.
public enum JSONValue: Codable, Equatable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])
    public init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let x): try c.encode(x)
        case .number(let x): try c.encode(x)
        case .string(let x): try c.encode(x)
        case .array(let x): try c.encode(x)
        case .object(let x): try c.encode(x)
        }
    }
}

public struct ReadRow: Codable, Equatable, Identifiable, Sendable {
    public var fields: [String: JSONValue]
    public init(fields: [String: JSONValue]) { self.fields = fields }
    public init(from decoder: any Decoder) throws { fields = try decoder.singleValueContainer().decode([String: JSONValue].self) }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer(); try c.encode(fields)
    }
    public func string(_ key: String) -> String? {
        if case .string(let x) = fields[key] { return x }; return nil
    }
    public func number(_ key: String) -> Double? {
        if case .number(let x) = fields[key] { return x }; return nil
    }
    public func bool(_ key: String) -> Bool? {
        if case .bool(let x) = fields[key] { return x }; return nil
    }
    public var id: String { string("id") ?? "" }
    public var deleted: Bool { bool("deleted") == true }
    public func decode<T: Decodable>(_ type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: JSONEncoder().encode(self))
    }
}

public struct PullChange: Codable, Sendable {
    public let table: String
    public let row: ReadRow
}

public struct PullPage: Codable, Sendable {
    public let rows: [PullChange]
    public let cursor: Int64
    public let more: Bool
    public let horizon: Int64?
}

public enum ReadSync {
    public struct PullCycle: Sendable {
        private var checkedHorizon = false
        public init() {}
        public mutating func shouldRebuild(since: Int64, horizon: Int64?) -> Bool {
            guard !checkedHorizon else { return false }
            checkedHorizon = true
            return ReadSync.requiresRebuild(since: since, horizon: horizon)
        }
    }
    public static let tables: Set<String> = [
        "profiles", "plans", "routines", "routine_items", "exercises", "sessions",
        "session_items", "sets", "runs", "day_overrides", "external_plan_items", "records",
    ]
    public enum Failure: Error { case invalidPage, accountChanged, tooManyPages }
    public static func requiresRebuild(since: Int64, horizon: Int64?) -> Bool {
        since > 0 && (horizon ?? 0) > since
    }
    public static func validate(_ page: PullPage, since: Int64, owner: String) throws {
        guard page.cursor >= since, !page.more || page.cursor > since else { throw Failure.invalidPage }
        for change in page.rows where tables.contains(change.table) {
            guard !change.row.id.isEmpty,
                  change.row.string("user_id")?.lowercased() == owner.lowercased(),
                  change.row.bool("deleted") != nil else { throw Failure.invalidPage }
        }
    }
}
