import AnilhaCore
import AnilhaCache
import Foundation
import XCTest

final class AnalysisTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "analysis", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    private func tables(_ row: ReadRow) -> [String: [ReadRow]] {
        row.fields.reduce(into: [:]) { result, entry in
            if case .array(let values) = entry.value {
                result[entry.key] = values.compactMap { if case .object(let f) = $0 { return ReadRow(fields: f) }; return nil }
            }
        }
    }
    func testContextParityAndForbiddenData() throws {
        let f = try fixture()
        for v in f.array("contexts") {
            let input = v.object("input")
            let planned = input.object("planned").fields.mapValues { value in if case .object(let fields) = value { return ReadRow(fields: fields) }; return ReadRow(fields: [:]) }
            let rules = input.object("rules").fields.compactMapValues { value -> String? in if case .string(let s) = value { return s }; return nil }
            let result = try WorkoutAnalysis.context(ReadData(tables: tables(input.object("tables"))), sessionID: input.string("sessionID") ?? "", catalog: f.array("catalog"), planned: planned, appliedRules: rules)
            XCTAssertEqual(result, v.object("expected"))
            let encoded = String(decoding: try JSONEncoder().encode(result), as: UTF8.self)
            XCTAssertFalse(encoded.contains("private-"))
            for key in ["user_id", "email", "note", "pain_joint", "skip_reason", "substitution_reason", "started_at", "local_date", "title", "gender", "spare_joints", "returning"] {
                XCTAssertFalse(encoded.contains("\"\(key)\""))
            }
        }
    }
    func testOutputValidationParity() throws {
        let f = try fixture()
        for v in f.array("replies") {
            let reply = WorkoutAnalysis.parseReply(v.object("input"), slots: Int(v.number("slots") ?? 0), catalog: f.array("catalog"))
            if v.fields["expected"] == .null { XCTAssertNil(reply) }
            else { XCTAssertEqual(reply, v.object("expected")) }
        }
        for scalar in [0x2013, 0x2014, 0x1f600] {
            let raw = ReadRow(fields: ["summary": .string(String(UnicodeScalar(scalar)!)), "points": .array([]), "adjustment": .null])
            XCTAssertNil(WorkoutAnalysis.parseReply(raw, slots: 1, catalog: f.array("catalog")))
        }
    }
    func testEditsMatchRealWalterToolAndApply() throws {
        let f = try fixture()
        for v in f.array("changes") {
            let changes = try WorkoutAnalysis.changes(v.object("adjustment"), binding: v.object("binding"), catalog: f.array("catalog"), newID: { "00000000-0000-4000-8000-000000000099" })
            let actual = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(changes))
            XCTAssertEqual(actual, v.fields["expected"])
        }
    }
    func testRiskWarningsMatchWalterEngine() throws {
        for v in try fixture().array("risks") {
            XCTAssertEqual(WorkoutAnalysis.risks(v.object("adjustment"), binding: v.object("binding")), v.array("expected"))
        }
    }
    func testCardStatesPreventRepeatedPaidAnalysis() throws {
        let empty = ReadRow(fields: ["status": .string("pending")])
        XCTAssertTrue(WorkoutAnalysis.cardState(empty, busy: false, online: false).waiting)
        XCTAssertFalse(WorkoutAnalysis.cardState(empty, busy: false, online: false).canAnalyze)
        XCTAssertTrue(WorkoutAnalysis.cardState(empty, busy: false, online: true).canAnalyze)
        XCTAssertFalse(WorkoutAnalysis.cardState(empty, busy: true, online: true).canAnalyze)
        let reply = try fixture().array("replies")[1].object("expected")
        let saved = ReadRow(fields: ["status": .string("proposed"), "reply": .object(reply.fields)])
        XCTAssertFalse(WorkoutAnalysis.cardState(saved, busy: false, online: true).canAnalyze)
        XCTAssertTrue(WorkoutAnalysis.cardState(saved, busy: false, online: false).canDecide)
        XCTAssertFalse(WorkoutAnalysis.cardState(saved.changing(["status": .string("refused")]), busy: false, online: true).canDecide)
        XCTAssertTrue(WorkoutAnalysis.cardState(empty.changing(["status": .string("requesting")]), busy: false, online: true).interrupted)
    }
    @MainActor func testAdjustmentQueuePersistenceUndoAndConflict() async throws {
        let f = try fixture(), b = f.array("changes")[0].object("binding"), id = b.object("session").id
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("analysis.store")
        var cache: CacheLeitura? = try CacheLeitura(storeURL: url)
        let seed = [PushChange("sessions", b.object("session"))] + b.array("items").map { PushChange("session_items", $0) }
        // Routine rows arrive by pull, just as on the phone.
        let remote = [PushChange("routines", b.object("routine"))] + b.array("routineItems").map { PushChange("routine_items", $0) }
        let pageRow = ReadRow(fields: ["rows": .array(remote.map { .object(["table": .string($0.table), "row": .object($0.row.changing(["user_id": .string("a")]).fields)]) }), "cursor": .number(1), "more": .bool(false)])
        let page = try pageRow.decode(PullPage.self)
        try cache?.aplicar(page, dono: "a", since: 0)
        try cache?.gravar(seed, dono: "a", catalog: f.array("catalog"))
        let live = try WorkoutAnalysis.binding(try XCTUnwrap(cache).ler("a"), sessionID: id)
        let reply = f.array("replies")[1].object("expected")
        let saved = ReadRow(fields: ["status": .string("proposed"), "reply": .object(reply.fields), "binding": .object(live.fields)])
        try cache?.guardarAnalise(saved, sessionID: id, dono: "a")
        try cache?.salvarAjuste(saved, sessionID: id, dono: "a", catalog: f.array("catalog"))
        XCTAssertEqual(try cache?.ler("a").items("routine").first?.number("sets"), 2)
        XCTAssertTrue(try XCTUnwrap(cache).lote("a").changes.contains { $0.table == "routine_items" })
        XCTAssertTrue(try XCTUnwrap(cache).metadados("b").isEmpty)
        cache = nil
        let reopened = try CacheLeitura(storeURL: url)
        let persisted = try XCTUnwrap(reopened.metadados("a")["analysis:\(id)"])
        XCTAssertEqual(persisted.object("reply"), reply)
        XCTAssertTrue(WorkoutAnalysis.cardState(persisted, busy: false, online: false).canUndo)
        try reopened.desfazerAjuste(sessionID: id, dono: "a")
        XCTAssertEqual(try reopened.ler("a").items("routine").first?.number("sets"), 3)
        try reopened.guardarAnalise(saved, sessionID: id, dono: "a")
        XCTAssertThrowsError(try reopened.salvarAjuste(saved, sessionID: id, dono: "a", catalog: f.array("catalog")))
        let fresh = saved.changing(["binding": .object(try WorkoutAnalysis.binding(reopened.ler("a"), sessionID: id).fields)])
        try reopened.salvarAjuste(fresh, sessionID: id, dono: "a", catalog: f.array("catalog"))
        let item = try XCTUnwrap(reopened.ler("a").items("routine").first)
        try reopened.gravar([PushChange("routine_items", item.changing(["sets": .number(5)]))], dono: "a")
        XCTAssertThrowsError(try reopened.desfazerAjuste(sessionID: id, dono: "a"))
        XCTAssertEqual(try reopened.ler("a").items("routine").first?.number("sets"), 5)
        try reopened.apagar()
        XCTAssertTrue(try reopened.metadados("a").isEmpty)
    }
    @MainActor func testNumericPlanAndPendingAnalysisPersistAtomicallyWithWorkout() async throws {
        let cache = try CacheLeitura(inMemory: true)
        let row = ReadRow(fields: ["id": .string("set"), "kind": .string("work"), "load_kg": .number(20), "reps": .number(8), "completed_at": .null, "deleted": .bool(false)])
        let pending = ReadRow(fields: ["status": .string("pending")])
        try cache.gravar([PushChange("sets", row)], dono: "a", metadata: ["analysis:session": pending])
        try cache.gravar([PushChange("sets", row.changing(["load_kg": .number(25), "completed_at": .number(1000)]))], dono: "a")
        XCTAssertEqual(try cache.metadados("a")["analysis-plan:set"]?.number("load_kg"), 20)
        XCTAssertEqual(try cache.metadados("a")["analysis:session"], pending)
        XCTAssertThrowsError(try cache.gravar([PushChange("sets", row.changing(["id": .string("rollback")])), PushChange("profiles", row)], dono: "a", metadata: ["analysis:rollback": pending]))
        XCTAssertNil(try cache.metadados("a")["analysis-plan:rollback"])
        XCTAssertNil(try cache.metadados("a")["analysis:rollback"])
    }
}
