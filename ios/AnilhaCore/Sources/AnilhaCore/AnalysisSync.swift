import Foundation

/// Account metadata transport. Fingerprints are local, deterministic JSON, not server clocks.
public enum AnalysisSync {
    public static let cursorKey = "analysis-sync-cursor"
    public static func hashKey(_ key: String) -> String { "analysis-sync-hash:\(key)" }
    public static func syncedKey(_ key: String) -> Bool { key.hasPrefix("analysis:") || key.hasPrefix("review:") }
    private static let undoKeys = ["undo", "undoBefore", "undoAfter"]

    public static func stableText(_ row: ReadRow) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return String(decoding: try encoder.encode(row), as: UTF8.self)
    }
    /// JS stableText sorts keys with localeCompare, then JSON.stringify visits integer keys first.
    public static func wireText(_ value: JSONValue) throws -> String {
        switch value {
        case .object(let fields):
            func integerKey(_ key: String) -> UInt32? {
                guard let n = UInt32(key), n < UInt32.max, String(n) == key else { return nil }
                return n
            }
            let keys = fields.keys.sorted { a, b in
                if let x = integerKey(a) { return integerKey(b).map { x < $0 } ?? true }
                if integerKey(b) != nil { return false }
                return a.compare(b, locale: Locale(identifier: "en_US")) == .orderedAscending
            }
            return "{" + (try keys.map { try wireText(.string($0)) + ":" + wireText(fields[$0]!) }).joined(separator: ",") + "}"
        case .array(let values): return "[" + (try values.map(wireText)).joined(separator: ",") + "]"
        default:
            let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
            return String(decoding: try encoder.encode(value), as: UTF8.self)
        }
    }
    public static func syncPayload(_ value: ReadRow) -> ReadRow {
        var out = value
        for key in undoKeys { out.fields.removeValue(forKey: key) }
        if case .array(let decisions) = out.fields["decisions"] {
            out.fields["decisions"] = .array(decisions.map { value in
                guard case .object(var fields) = value else { return value }
                for key in undoKeys { fields.removeValue(forKey: key) }
                return .object(fields)
            })
        }
        return out
    }
    public static func mergePulled(_ remote: ReadRow, local: ReadRow?) -> ReadRow {
        var out = syncPayload(remote)
        guard let local else { return out }
        func keepingUndo(_ remote: ReadRow, _ local: ReadRow) -> ReadRow {
            var row = remote
            if remote.fields["status"] == local.fields["status"] {
                for key in undoKeys where local.fields[key] != nil && local.fields[key] != .null {
                    row.fields[key] = local.fields[key]
                }
            }
            return row
        }
        out = keepingUndo(out, local)
        if case .array(let decisions) = out.fields["decisions"], case .array(let mine) = local.fields["decisions"] {
            out.fields["decisions"] = .array(decisions.enumerated().map { i, value in
                guard case .object(let fields) = value, mine.indices.contains(i), case .object(let old) = mine[i] else { return value }
                return .object(keepingUndo(ReadRow(fields: fields), ReadRow(fields: old)).fields)
            })
        }
        return out
    }
    /// The site uses a JSON string [routine, items]; Swift keeps an object for equality checks.
    /// Preserve the original exercise slots even after an adjustment replaces a row.
    public static func wirePayload(_ row: ReadRow, key: String) throws -> ReadRow {
        var out = syncPayload(row)
        if key.hasPrefix("review:"), case .object(let version) = out.fields["version"] {
            let pair: [JSONValue] = [version["routine"] ?? .null, version["items"] ?? .array([])]
            out.fields["version"] = .string(try wireText(.array(pair)))
            if out.fields["exercises"] == nil {
                out.fields["exercises"] = .array(out.object("binding").array("items").map { $0.fields["exercise_id"] ?? .null })
            }
        }
        return out
    }
    public static func nativePayload(_ row: ReadRow, key: String) throws -> ReadRow {
        var out = syncPayload(row)
        if key.hasPrefix("review:"), out.fields["version"] != nil {
            out.fields["routineID"] = .string(String(key.dropFirst(7)))
            if let text = out.string("version"),
               let pair = try? JSONDecoder().decode([JSONValue].self, from: Data(text.utf8)), pair.count == 2 {
                out.fields["version"] = .object(["routine": pair[0], "items": pair[1]])
            }
            if out.fields["binding"] == nil, case .array(let exercises) = out.fields["exercises"] {
                out.fields["binding"] = .object(["items": .array(exercises.map { .object(["exercise_id": $0]) })])
            }
        }
        return out
    }
    /// Compare parsed version values: JSON object ordering differs between JS and Foundation.
    public static func fingerprint(_ row: ReadRow, key: String) throws -> String {
        try stableText(nativePayload(wirePayload(row, key: key), key: key))
    }
    public struct Item: Codable, Sendable {
        public let id: String
        public let payload: ReadRow
        public let updated_at: Double
        public init(id: String, payload: ReadRow, updated_at: Double) {
            self.id = id; self.payload = payload; self.updated_at = updated_at
        }
    }
    public struct Page: Codable, Sendable {
        public let rows: [Item]
        public let cursor: Int64
        public let more: Bool
        public init(rows: [Item], cursor: Int64, more: Bool) { self.rows = rows; self.cursor = cursor; self.more = more }
    }
}
