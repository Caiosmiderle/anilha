import Foundation

public enum DayAdjustments {
    public enum Failure: LocalizedError {
        case invalid, changed, engine
        public var errorDescription: String? {
            switch self {
            case .invalid: "Confira o ajuste e a permissão de saúde."
            case .changed: "O dia ou a conta mudou. Abra Hoje novamente."
            case .engine: "Não foi possível calcular o treino de hoje. Tente atualizar."
            }
        }
    }
    public static func evaluate(_ data: ReadData, catalog: [ReadRow], today: String, health: Bool) throws -> ReadRow {
        let input = ReadRow(fields: ["tables": .object(data.tables.mapValues { AgentChat.rows($0) }),
            "catalog": AgentChat.rows(catalog), "today": .string(today), "health": .bool(health)])
        do { return try PlanEngine.invoke("today", params: input) }
        catch { throw Failure.engine }
    }
    public static func options() throws -> ReadRow { try PlanEngine.invoke("dayOptions", params: ReadRow(fields: [:])) }
    public static func validate(_ row: ReadRow, health: Bool) throws {
        guard let day = row.string("local_date"), row.id == "day-\(day)",
              day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { throw Failure.invalid }
        if row.deleted { return }
        guard let action = row.string("action") else { throw Failure.invalid }
        if action == "spare_joint" && !health { throw Failure.invalid }
        if ["run", "rest"].contains(action) {
            guard row.fields["value"] == .null else { throw Failure.invalid }
        } else {
            guard try options().array(action).contains(where: { $0.id == row.string("value") }) else { throw Failure.invalid }
        }
    }
    /// Same id, tombstone and replacement semantics as setDayOverride. Stamps belong to the cache.
    public static func changes(_ data: ReadData, today: String, action: String?, value: String? = nil, health: Bool) throws -> [PushChange] {
        let existing = data.tables["day_overrides"]?.first { $0.id == "day-\(today)" }
        guard let action else {
            return existing.map { [PushChange("day_overrides", $0.changing(["deleted": .bool(true)]))] } ?? []
        }
        let row = ReadRow(fields: ["id": .string("day-\(today)"), "deleted": .bool(false), "local_date": .string(today),
            "action": .string(action), "value": value.map(JSONValue.string) ?? .null])
        try validate(row, health: health)
        return [PushChange("day_overrides", row)]
    }
}
