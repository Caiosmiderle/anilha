import AnilhaCore
import AnilhaCache
import Foundation
import XCTest

final class ReviewTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "review", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    private func data(_ input: ReadRow) -> ReadData {
        var tables: [String: [ReadRow]] = [:]
        for (source, target) in [("routines", "routines"), ("items", "routine_items"), ("sessions", "sessions"), ("runs", "runs"), ("externalPlans", "external_plan_items"), ("overrides", "day_overrides")] { tables[target] = input.array(source) }
        tables["plans"] = input.fields["plan"] == .null ? [] : [input.object("plan")]
        tables["profiles"] = [ReadRow(fields: ["id": .string("profile"), "onboarding": input.fields["params"]!])]
        return ReadData(tables: tables)
    }
    func testContextParityAndPrivacy() throws {
        let f = try fixture()
        for vector in f.array("contexts") {
            let input = vector.object("input")
            let actual = try RoutineReview.context(data(input), routineID: vector.string("routineID")!, today: input.string("today")!, catalog: f.array("catalog"))
            XCTAssertEqual(actual, vector.object("expected"))
            let text = String(decoding: try JSONEncoder().encode(actual), as: UTF8.self)
            XCTAssertFalse(text.contains("private-"))
            for key in ["name", "email", "note", "age_range", "weight_kg", "pain_joint", "spare_joints", "gps", "started_at", "local_date", "source_type"] { XCTAssertFalse(text.contains("\"\(key)\"")) }
        }
    }
    func testReplyValidationAndCost() throws {
        let f = try fixture()
        for vector in f.array("replies") {
            let result = RoutineReview.parseReply(vector.object("input"), slots: 2, catalog: f.array("catalog"))
            if vector.fields["expected"] == .null { XCTAssertNil(result) } else { XCTAssertEqual(result, vector.object("expected")) }
        }
        let usage = ReadRow(fields: ["model": .string("claude-sonnet-5-5"), "input_tokens": .number(2000), "output_tokens": .number(1000)])
        XCTAssertEqual(WorkoutAnalysis.estimatedCost(usage) ?? 0, 0.014, accuracy: 0.000000001)
    }
    @MainActor func testThreeChangesRefusalUndoAndVersionConflict() throws {
        let f = try fixture(), vector = try XCTUnwrap(f.array("contexts").first), input = vector.object("input")
        let original = data(input), id = vector.string("routineID")!, today = input.string("today")!, owner = "synthetic-owner"
        let reply = f.array("replies")[0].object("expected")
        for index in 0..<3 {
            let cache = try CacheLeitura(inMemory: true)
            let rows = original.tables.mapValues { $0.map { $0.changing(["user_id": .string(owner), "deleted": .bool(false)]) } }
            let remote = rows.flatMap { table, values in values.map { row in JSONValue.object(["table": .string(table), "row": .object(row.fields)]) } }
            let page = ReadRow(fields: ["rows": .array(remote), "cursor": .number(1), "more": .bool(false)])
            try cache.aplicar(try page.decode(PullPage.self), dono: owner, since: 0)
            let live = try cache.ler(owner), binding = try RoutineReview.binding(live, routineID: id, today: today)
            let saved = ReadRow(fields: ["routineID": .string(id), "version": .object(RoutineReview.version(live, routineID: id).fields), "binding": .object(binding.fields), "reply": .object(reply.fields), "decisions": .array((0..<3).map { _ in .object(["status": .string("proposed")]) })])
            try cache.guardarRevisao(saved, routineID: id, dono: owner)
            try cache.decidirRevisao(routineID: id, index: index, action: "apply", dono: owner, catalog: f.array("catalog"), today: today)
            XCTAssertEqual(try cache.metadados(owner)["review:\(id)"]?.array("decisions")[index].string("status"), "saved")
            try cache.decidirRevisao(routineID: id, index: index, action: "undo", dono: owner, catalog: f.array("catalog"), today: today)
            XCTAssertEqual(try cache.ler(owner).items(id).map { $0.string("exercise_id") }, live.items(id).map { $0.string("exercise_id") })
            XCTAssertEqual(try cache.ler(owner).items(id).map { $0.number("sets") }, live.items(id).map { $0.number("sets") })
            let other = (index + 1) % 3
            try cache.decidirRevisao(routineID: id, index: other, action: "refuse", dono: owner, catalog: f.array("catalog"), today: today)
            XCTAssertEqual(try cache.metadados(owner)["review:\(id)"]?.array("decisions")[other].string("status"), "refused")
            let item = try XCTUnwrap(try cache.ler(owner).items(id).first)
            try cache.gravar([PushChange("routine_items", item.changing(["sets": .number(5)]))], dono: owner)
            XCTAssertThrowsError(try cache.decidirRevisao(routineID: id, index: index, action: "apply", dono: owner, catalog: f.array("catalog"), today: today))
        }
    }
    @MainActor func testCombinedAdjustmentsUndoInReverse() throws {
        let f = try fixture(), vector = try XCTUnwrap(f.array("contexts").first), input = vector.object("input")
        let original = data(input), id = vector.string("routineID")!, today = input.string("today")!, owner = "synthetic-owner"
        let cache = try CacheLeitura(inMemory: true)
        let remote = original.tables.flatMap { table, values in values.map { row in JSONValue.object(["table": .string(table), "row": .object(row.changing(["user_id": .string(owner), "deleted": .bool(false)]).fields)]) } }
        let page = ReadRow(fields: ["rows": .array(remote), "cursor": .number(1), "more": .bool(false)])
        try cache.aplicar(try page.decode(PullPage.self), dono: owner, since: 0)
        let live = try cache.ler(owner), binding = try RoutineReview.binding(live, routineID: id, today: today)
        let saved = ReadRow(fields: ["routineID": .string(id), "version": .object(RoutineReview.version(live, routineID: id).fields), "binding": .object(binding.fields), "reply": .object(f.array("replies")[0].object("expected").fields), "decisions": .array((0..<3).map { _ in .object(["status": .string("proposed")]) })])
        try cache.guardarRevisao(saved, routineID: id, dono: owner)
        for index in [0, 1, 2] { try cache.decidirRevisao(routineID: id, index: index, action: "apply", dono: owner, catalog: f.array("catalog"), today: today) }
        for index in [2, 1, 0] { try cache.decidirRevisao(routineID: id, index: index, action: "undo", dono: owner, catalog: f.array("catalog"), today: today) }
        XCTAssertEqual(try cache.ler(owner).items(id).map { $0.string("exercise_id") }, live.items(id).map { $0.string("exercise_id") })
        XCTAssertEqual(try cache.ler(owner).items(id).map { $0.number("sets") }, live.items(id).map { $0.number("sets") })
        XCTAssertEqual(try cache.ler(owner).items(id).map { $0.number("target_max") }, live.items(id).map { $0.number("target_max") })
    }
}
