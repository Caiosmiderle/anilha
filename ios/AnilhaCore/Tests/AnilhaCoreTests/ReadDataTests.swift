import Foundation
import XCTest
@testable import AnilhaCore

final class ReadDataTests: XCTestCase {
    private func row(_ json: String) throws -> ReadRow {
        try JSONDecoder().decode(ReadRow.self, from: Data(json.utf8))
    }
    func testCatalogOverridesAndTombstonesDoNotResurrectBuiltins() throws {
        let builtin = try row(#"{"id":"builtin","name":"Original"}"#)
        let changed = try row(#"{"id":"builtin","name":"My exercise","deleted":false}"#)
        let tombstone = try row(#"{"id":"builtin","deleted":true}"#)
        let custom = try row(#"{"id":"custom","name":"Custom","deleted":false}"#)
        var snapshot = ReadData(tables: ["exercises": [changed, custom]])
        XCTAssertEqual(snapshot.exercises(catalog: [builtin])["builtin"]?.string("name"), "My exercise")
        XCTAssertEqual(snapshot.exercises(catalog: [builtin]).count, 2)
        snapshot.tables["exercises"] = [tombstone, custom]
        XCTAssertNil(snapshot.exercises(catalog: [builtin])["builtin"])
        XCTAssertEqual(snapshot.exercises(catalog: [builtin])["custom"], custom)
    }
    func testLastLoadSkipsWarmupIncompleteDeletedAndForeignItems() throws {
        let session = try row(#"{"id":"session","status":"done","local_date":"2026-11-10"}"#)
        let active = try row(#"{"id":"active","status":"active","local_date":"2026-11-12"}"#)
        let item = try row(#"{"id":"item","session_id":"session","exercise_id":"exercise","status":"done"}"#)
        let good = try row(#"{"id":"good","exercise_id":"exercise","session_id":"session","item_id":"item","kind":"work","load_kg":30,"completed_at":100}"#)
        let later = try row(#"{"id":"later","exercise_id":"exercise","session_id":"session","item_id":"item","kind":"work","load_kg":32,"completed_at":200}"#)
        var excluded: [ReadRow] = []
        let changes: [[String: JSONValue]] = [
            ["kind": .string("warmup")], ["deleted": .bool(true)],
            ["completed_at": .null], ["session_id": .string("active")],
            ["item_id": .string("missing")], ["load_kg": .null],
        ]
        for change in changes {
            var bad = later
            bad.fields.merge(change) { _, new in new }
            bad.fields["id"] = .string("excluded-\(excluded.count)")
            if bad.number("completed_at") != nil { bad.fields["completed_at"] = .number(999) }
            excluded.append(bad)
        }
        var snapshot = ReadData(tables: ["sessions": [session, active], "session_items": [item],
                                        "sets": [good, later] + excluded])
        XCTAssertEqual(snapshot.lastLoads["exercise"]?.kg, 32)
        XCTAssertEqual(snapshot.lastLoads["exercise"]?.date, "2026-11-10")
        var deleted = item; deleted.fields["deleted"] = .bool(true)
        snapshot.tables["session_items"] = [deleted]
        XCTAssertTrue(snapshot.lastLoads.isEmpty)
    }
    func testRoutinesAndItemsRespectDeletesArchiveAndPosition() throws {
        let a = try row(#"{"id":"a","position":2}"#)
        let b = try row(#"{"id":"b","position":1}"#)
        let archived = try row(#"{"id":"archive","position":0,"archived":true}"#)
        let deleted = try row(#"{"id":"deleted","position":0,"deleted":true}"#)
        let first = try row(#"{"id":"first","routine_id":"b","position":1}"#)
        let last = try row(#"{"id":"last","routine_id":"b","position":2}"#)
        let removed = try row(#"{"id":"removed","routine_id":"b","deleted":true}"#)
        let other = try row(#"{"id":"other","routine_id":"a","position":0}"#)
        let snapshot = ReadData(tables: ["routines": [a, b, archived, deleted],
                                        "routine_items": [last, removed, first, other]])
        XCTAssertEqual(snapshot.routines.map(\.id), ["b", "a"])
        XCTAssertEqual(snapshot.items("b").map(\.id), ["first", "last"])
    }
    func testPlannedTodayStaysSeparateFromCompletionsAndActiveSessions() throws {
        let plan = try row(#"{"id":"p","active_from":"2026-11-09","updated_at":1,"days":[{"weekday":3,"kind":"gym","split_key":"perna"}],"rules":{"no_legs_before_run":false,"rotation":["perna","costas_biceps","peito_triceps"]}}"#)
        let yesterday = try row(#"{"id":"yesterday","local_date":"2026-11-11","split_key":"perna","status":"done"}"#)
        let today = try row(#"{"id":"today","local_date":"2026-11-12","split_key":"peito_triceps","status":"done"}"#)
        let active = try row(#"{"id":"active","local_date":"2026-11-11","split_key":"costas_biceps","status":"active"}"#)
        var snapshot = ReadData(tables: ["plans": [plan], "sessions": [yesterday, today, active]])
        XCTAssertEqual(snapshot.plannedToday("2026-11-12")?.split_key, "costas_biceps")
        let override = try row(#"{"id":"rest","local_date":"2026-11-12","action":"rest"}"#)
        snapshot.tables["day_overrides"] = [override]
        XCTAssertEqual(snapshot.plannedToday("2026-11-12")?.kind, "rest")
    }
    func testProtocolAdvancesAcrossUnusedTablesButRejectsNonProgressingPages() throws {
        let unknown = try JSONDecoder().decode(PullPage.self, from: Data(#"{"rows":[{"table":"messages","row":{"id":"unused"}}],"cursor":501,"more":true}"#.utf8))
        try ReadSync.validate(unknown, since: 500, owner: "fictional")
        XCTAssertFalse(ReadSync.tables.contains("messages"))
        XCTAssertThrowsError(try ReadSync.validate(unknown, since: 501, owner: "fictional"))
    }
    func testPurgedTombstonesRebuildOnlyOnceDuringPaginatedFullPull() {
        var cycle = ReadSync.PullCycle()
        XCTAssertTrue(cycle.shouldRebuild(since: 99, horizon: 100))
        XCTAssertFalse(cycle.shouldRebuild(since: 0, horizon: 100))
        // Old surviving rows can be before the purge horizon. They must not reset every page.
        XCTAssertFalse(cycle.shouldRebuild(since: 50, horizon: 100))
        var fresh = ReadSync.PullCycle()
        XCTAssertFalse(fresh.shouldRebuild(since: 0, horizon: 100))
        XCTAssertFalse(fresh.shouldRebuild(since: 50, horizon: 100))
    }
}
