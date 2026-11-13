import AnilhaCache
@testable import AnilhaCore
import Foundation
import XCTest

final class NewPlanTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "new-plans", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    private func encoded(_ changes: [PushChange]) -> [ReadRow] {
        changes.map { ReadRow(fields: ["table": .string($0.table), "row": .object($0.row.fields)]) }
    }
    func testJavaScriptCoreMatchesAllTypeScriptGeneratorOutputs() throws {
        let cases = try fixture().array("cases")
        XCTAssertEqual(cases.count, 12)
        for v in cases {
            let params = try PlanEngine.parameters(v.object("input"), picked: v.bool("picked") == true, health: true)
            XCTAssertEqual(params, v.object("params"), v.string("name") ?? "")
            XCTAssertEqual(try PlanEngine.generate(params), v.object("expected"), v.string("name") ?? "")
        }
    }
    func testRowConstructionMatchesRealPlanChangesIncludingOriginsRotationReturnAndName() throws {
        let f = try fixture()
        for v in f.array("writes") {
            var index = 0
            let changes = NewPlan.changes(v.object("generated"), params: v.object("params"), today: f.string("today")!, profile: v.object("profile"), routines: f.array("routines"), newID: { defer { index += 1 }; return "new-\(index)" })
            XCTAssertEqual(encoded(changes), v.array("changes"), v.string("name") ?? "")
        }
    }
    func testConsentAndEngineFailureNeverReturnPartialPlan() throws {
        let v = try fixture().array("cases")[9]
        XCTAssertFalse(AgentChat.strings(v.object("params"), "spare_joints").isEmpty)
        let safe = try PlanEngine.parameters(v.object("params"), picked: true, health: false)
        XCTAssertEqual(safe.fields["spare_joints"], .array([]))
        XCTAssertThrowsError(try PlanEngine.invoke("generate", params: safe, source: "throw new Error('fixture');"))
        XCTAssertThrowsError(try PlanEngine.invoke("generate", params: safe, source: "var AnilhaPlanEngine = { generate: function() { throw new Error('fixture'); } };"))
        XCTAssertThrowsError(try PlanEngine.invoke("generate", params: safe, source: "var AnilhaPlanEngine = { generate: function() { return 'invalid JSON'; } };"))
        XCTAssertThrowsError(try PlanEngine.validate(safe.changing(["gym_days": .number(0), "run_days": .number(0)]), today: "2026-11-12"))
        XCTAssertThrowsError(try PlanEngine.validate(safe.changing(["race": .object(["date": .string("2026-11-01")])]), today: "2026-11-12"))
    }
    @MainActor func testAtomicQueuePreservesOtherRoutinesWorkoutsAndAccountsAndRejectsStalePreview() throws {
        let f = try fixture(), cache = try CacheLeitura(inMemory: true), owner = f.string("owner")!, today = f.string("today")!
        let v = f.array("writes")[0], profile = v.object("profile")
        let session = ReadRow(fields: ["id": .string("done"), "deleted": .bool(false), "status": .string("done"), "routine_id": .string("old-plan")])
        let originalItem = v.object("generated").array("routines")[0].array("items")[0].changing(["id": .string("old-item"), "routine_id": .string("old-plan")])
        let item = originalItem.changing(["id": .string("done-item"), "session_id": .string("done"), "status": .string("done")])
        let set = ReadRow(fields: ["id": .string("done-set"), "session_id": .string("done"), "item_id": .string("done-item"), "completed_at": .number(100)])
        let record = ReadRow(fields: ["id": .string("record"), "session_id": .string("done"), "value": .number(20)])
        let seed = f.array("routines").map { PushChange("routines", $0) } + [PushChange("profiles", profile), PushChange("sessions", session),
            PushChange("routine_items", originalItem), PushChange("session_items", item), PushChange("sets", set), PushChange("records", record)]
        try cache.gravar(seed, dono: owner, now: 100)
        let before = try cache.ler(owner), binding = NewPlan.binding(before)
        try cache.adotarPlano(v.object("generated"), params: v.object("params"), baseline: binding, today: today, dono: owner)
        let after = try cache.ler(owner)
        XCTAssertEqual(after.active("plans").count, 1)
        XCTAssertEqual(after.active("sessions"), before.active("sessions"))
        for table in ["session_items", "sets", "records"] { XCTAssertEqual(after.active(table), before.active(table)) }
        XCTAssertEqual(after.items("old-plan"), before.items("old-plan"))
        for id in ["manual", "pronta-exemplo", "recebida-exemplo", "added", "archived", "deleted"] {
            XCTAssertEqual(after.tables["routines"]?.first { $0.id == id }, before.tables["routines"]?.first { $0.id == id })
        }
        XCTAssertTrue(after.tables["routines"]!.first { $0.id == "old-plan" }!.bool("archived") == true)
        XCTAssertTrue(try cache.lote(owner).changes.contains { $0.table == "plans" })
        XCTAssertTrue(try cache.ler("other").tables.isEmpty)
        let queue = encoded(try cache.lote(owner).changes)
        XCTAssertThrowsError(try cache.adotarPlano(v.object("generated"), params: v.object("params"), baseline: binding, today: today, dono: owner))
        XCTAssertEqual(encoded(try cache.lote(owner).changes), queue)
        let pending = NewPlan.changes(v.object("generated"), params: v.object("params"), today: today, profile: profile, routines: [])
        XCTAssertThrowsError(try cache.gravar(pending + [PushChange("invalid", profile)], dono: owner))
        XCTAssertEqual(try cache.ler(owner).active("plans"), after.active("plans"))
        XCTAssertEqual(encoded(try cache.lote(owner).changes), queue)
        let health = f.array("writes")[9]
        XCTAssertThrowsError(try cache.adotarPlano(health.object("generated"), params: health.object("params"), baseline: NewPlan.binding(after), today: today, dono: owner))
        XCTAssertEqual(encoded(try cache.lote(owner).changes), queue)
    }
}
