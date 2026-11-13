import AnilhaCache
@testable import AnilhaCore
import Foundation
import XCTest

final class DayAdjustmentsTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "today", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    private func data(_ input: ReadRow) -> ReadData {
        let tables = input.object("tables")
        return ReadData(tables: Dictionary(uniqueKeysWithValues: tables.fields.keys.map { ($0, tables.array($0)) }))
    }
    private func encoded(_ changes: [PushChange]) -> [ReadRow] {
        changes.map { ReadRow(fields: ["table": .string($0.table), "row": .object($0.row.fields)]) }
    }
    func testAllChoicesMatchRealTypeScriptRecommendationAdjustmentAndDescriptions() throws {
        let f = try fixture()
        XCTAssertEqual(try DayAdjustments.options(), f.object("options"))
        XCTAssertGreaterThan(f.array("cases").count, 25)
        for v in f.array("cases") {
            let input = v.object("input")
            XCTAssertEqual(try DayAdjustments.evaluate(data(input), catalog: f.array("catalog"), today: input.string("today")!, health: input.bool("health") == true), v.object("expected"), v.string("name") ?? "")
        }
    }
    func testWritesAndUndoMatchActualSiteOperations() throws {
        let f = try fixture()
        for v in f.array("writes") {
            let request = v.object("request"), before = ReadData(tables: ["day_overrides": v.array("before")])
            XCTAssertEqual(encoded(try DayAdjustments.changes(before, today: f.string("today")!, action: request.string("action"), value: request.string("value"), health: true)), v.array("changes"))
        }
    }
    func testAdjustedOpeningUsesReviewedItemsAndLeavesOriginalFichaAndOtherChoiceIntact() throws {
        let f = try fixture(), today = f.string("today")!, catalog = f.array("catalog")
        for v in f.array("cases") {
            let expected = v.object("expected"), input = data(v.object("input")), routine = expected.object("routine")
            guard expected.object("rec").string("kind") == "gym", !routine.id.isEmpty, !expected.array("items").isEmpty else { continue }
            let items = expected.array("items")
            let changes = Workout.start(input, routine: routine, catalog: catalog, today: today, now: 100,
                                        planned: items, adjustment: expected.string("summary"))
            let opened = changes.filter { $0.table == "session_items" }.map(\.row)
            XCTAssertEqual(opened.count, items.count)
            for (actual, planned) in zip(opened, items) {
                for key in ["exercise_id", "target_min", "target_max", "rest_sec", "superset"] {
                    XCTAssertEqual(actual.fields[key] ?? .null, planned.fields[key] ?? .null)
                }
                XCTAssertEqual(actual.number("planned_sets"), planned.number("sets"))
            }
            let summary = expected.string("summary") ?? ""
            XCTAssertEqual(changes.first?.row.fields["adjustments"], .array(summary.isEmpty ? [] : [.string(summary)]))
            XCTAssertFalse(changes.contains { ["routines", "routine_items", "day_overrides"].contains($0.table) })
            let other = try XCTUnwrap(input.routines.first { $0.id == "manual" })
            let alternate = Workout.start(input, routine: other, catalog: catalog, today: today, now: 100)
            XCTAssertEqual(alternate.filter { $0.table == "session_items" }.map { $0.row.string("exercise_id") }, input.items(other.id).map { $0.string("exercise_id") })
            XCTAssertEqual(alternate.first?.row.fields["adjustments"], .array([]))
            var active = input
            active.tables["sessions", default: []].append(changes.first!.row)
            XCTAssertTrue(Workout.start(active, routine: other, catalog: catalog, today: today, now: 101).isEmpty)
        }
    }
    @MainActor func testAtomicQueueConsentUndoAccountsAndRevocationPull() throws {
        let f = try fixture(), cache = try CacheLeitura(inMemory: true), today = f.string("today")!
        let yes = ReadRow(fields: ["saude": .object(["granted": .bool(true)])])
        let no = ReadRow(fields: ["saude": .object(["granted": .bool(false)])])
        let joint = try DayAdjustments.changes(ReadData(), today: today, action: "spare_joint", value: "ombro", health: true)
        XCTAssertThrowsError(try cache.gravar(joint, dono: "a"))
        try cache.guardarConsentimento(yes, dono: "a")
        try cache.gravar(joint, dono: "a", now: 100)
        let sent = try cache.lote("a")
        XCTAssertThrowsError(try cache.gravar(joint, dono: "b"))
        XCTAssertTrue(try cache.ler("b").tables.isEmpty)
        let undo = try DayAdjustments.changes(cache.ler("a"), today: today, action: nil, health: true)
        try cache.gravar(undo, dono: "a", now: 101)
        try cache.confirmar(sent, dono: "a", rejeitadas: [])
        XCTAssertEqual(try cache.pendentes("a"), 1)
        XCTAssertTrue(try cache.lote("a").changes.first!.row.deleted)
        XCTAssertTrue(try cache.ler("a").active("day_overrides").isEmpty)
        let time = try DayAdjustments.changes(cache.ler("a"), today: today, action: "time", value: "30", health: false)
        let before = encoded(try cache.lote("a").changes)
        XCTAssertThrowsError(try cache.gravar(time + [PushChange("invalid", joint[0].row)], dono: "a"))
        XCTAssertEqual(encoded(try cache.lote("a").changes), before)
        try cache.gravar(time, dono: "b", now: 102)
        XCTAssertEqual(try cache.ler("b").active("day_overrides").first?.string("action"), "time")
        try cache.gravar(joint, dono: "a", now: 103)
        try cache.guardarConsentimento(no, dono: "a")
        XCTAssertTrue(try cache.ler("a").active("day_overrides").isEmpty)
        XCTAssertEqual(try cache.pendentes("a"), 0)
        let payload = ReadRow(fields: ["rows": .array([.object(["table": .string("day_overrides"), "row": .object(joint[0].row.changing(["user_id": .string("a"), "updated_at": .number(200)]).fields)])]), "cursor": .number(200), "more": .bool(false)])
        try cache.aplicar(payload.decode(PullPage.self), dono: "a", since: 0)
        XCTAssertTrue(try cache.ler("a").active("day_overrides").isEmpty)
        XCTAssertEqual(try cache.ler("b").active("day_overrides").first?.string("action"), "time")
        XCTAssertThrowsError(try DayAdjustments.changes(ReadData(), today: today, action: "spare_joint", value: "ombro", health: false))
    }
}
