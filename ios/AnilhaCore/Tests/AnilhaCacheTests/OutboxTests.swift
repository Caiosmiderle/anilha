import AnilhaCache
import AnilhaCore
import Foundation
import XCTest

final class OutboxTests: XCTestCase {
    @MainActor func testReopenDiskKeepsOutboxDraftAndRestDeadline() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("test.store")
        var first: CacheLeitura? = try CacheLeitura(storeURL: url)
        try first?.preparar("a")
        try first?.gravar([PushChange("sessions", row().changing(["rest_started_at": .number(1000), "rest_duration_sec": .number(90)]))], dono: "a", now: 2000)
        try first?.guardarRascunho(row("set").changing(["reps": .number(8)]), dono: "a")
        first = nil
        let reopened = try CacheLeitura(storeURL: url)
        XCTAssertEqual(try reopened.pendentes("a"), 1)
        XCTAssertEqual(Workout.restEnd(try XCTUnwrap(reopened.ler("a").active("sessions").first)), 91000)
        XCTAssertEqual(try reopened.rascunho("a", set: "set")?.number("reps"), 8)
        try reopened.gravar([PushChange("sessions", row())], dono: "a", now: 1000)
        XCTAssertEqual(try reopened.lote("a").changes.first?.row.number("updated_at"), 2001)
        try reopened.apagar()
    }
    private func row(_ id: String = "session") -> ReadRow {
        ReadRow(fields: ["id": .string(id), "deleted": .bool(false), "status": .string("active")])
    }
    @MainActor func testNewTableReplayKeepsRetentionCursorAndPendingRows() async throws {
        let cache = try CacheLeitura(inMemory: true)
        let remote = row("purged").changing(["user_id": .string("a"), "updated_at": .number(1)])
        try cache.aplicar(page(remote, cursor: 100), dono: "a", since: 0)
        try cache.gravar([PushChange("sessions", row("offline"))], dono: "a", now: 200)
        try cache.preparar("a")
        XCTAssertEqual(try cache.cursor("a").cursor, 0)
        XCTAssertEqual(try cache.cursorRetencao("a"), 100)
        try cache.limparPurgadas([:], dono: "a", horizon: 101)
        XCTAssertEqual(try cache.ler("a").active("sessions").map(\.id), ["offline"])
        XCTAssertEqual(try cache.pendentes("a"), 1)
    }
    private func page(_ row: ReadRow, cursor: Int64) throws -> PullPage {
        let data = try JSONEncoder().encode(JSONValue.object(["rows": .array([.object(["table": .string("sessions"), "row": .object(row.fields)])]), "cursor": .number(Double(cursor)), "more": .bool(false)]))
        return try JSONDecoder().decode(PullPage.self, from: data)
    }
    @MainActor func testAtomicQueueMonotonicClockAndAcknowledgmentDuringEdit() async throws {
        let cache = try CacheLeitura(inMemory: true)
        try cache.gravar([PushChange("sessions", row())], dono: "a", now: 100)
        let first = try cache.lote("a")
        XCTAssertEqual(first.changes[0].row.number("updated_at"), 100)
        try cache.gravar([PushChange("sessions", row().changing(["title": .string("new")]))], dono: "a", now: 50)
        try cache.confirmar(first, dono: "a", rejeitadas: [])
        XCTAssertEqual(try cache.pendentes("a"), 1)
        let second = try cache.lote("a")
        XCTAssertEqual(second.changes[0].row.number("updated_at"), 101)
        XCTAssertEqual(second.changes[0].row.string("title"), "new")
        XCTAssertEqual(try cache.pendentes("b"), 0)
        try cache.confirmar(second, dono: "a", rejeitadas: [])
        XCTAssertEqual(try cache.pendentes("a"), 0)
        // Validation failure rolls back both row and queue, including earlier changes in this transaction.
        XCTAssertThrowsError(try cache.gravar([PushChange("sessions", row("rollback")), PushChange("profiles", row("bad"))], dono: "a", now: 102))
        XCTAssertFalse(try cache.ler("a").active("sessions").contains { $0.id == "rollback" })
        XCTAssertEqual(try cache.pendentes("a"), 0)
    }
    @MainActor func testPullConflictTieTombstoneHorizonDraftAndRejection() async throws {
        let cache = try CacheLeitura(inMemory: true)
        try cache.gravar([PushChange("sessions", row())], dono: "a", now: 200)
        let remote = row().changing(["user_id": .string("a"), "updated_at": .number(199), "deleted": .bool(true)])
        try cache.aplicar(page(remote, cursor: 1), dono: "a", since: 0)
        XCTAssertEqual(try cache.pendentes("a"), 1)
        XCTAssertEqual(try cache.ler("a").active("sessions").count, 1)
        try cache.limparPurgadas([:], dono: "a", horizon: 5)
        XCTAssertEqual(try cache.ler("a").active("sessions").count, 1)
        try cache.aplicar(page(remote.changing(["updated_at": .number(200)]), cursor: 2), dono: "a", since: 1)
        XCTAssertEqual(try cache.pendentes("a"), 0)
        XCTAssertTrue(try cache.ler("a").active("sessions").isEmpty)
        try cache.limparPurgadas([:], dono: "a", horizon: 6)
        XCTAssertTrue(try cache.ler("a").tables["sessions"] == nil)
        try cache.guardarRascunho(row("set"), dono: "a")
        try cache.guardarRascunho(row("set").changing(["reps": .number(10)]), dono: "a")
        XCTAssertEqual(try cache.rascunho("a", set: "set")?.number("reps"), 10)
        XCTAssertNil(try cache.rascunho("b", set: "set"))
        try cache.gravar([PushChange("sets", row("set"))], dono: "a", now: 300)
        XCTAssertNil(try cache.rascunho("a", set: "set"))
        let batch = try cache.lote("a")
        try cache.confirmar(batch, dono: "a", rejeitadas: ["sets:set"])
        XCTAssertEqual(try cache.rejeitadas("a"), 1)
        XCTAssertEqual(try cache.pendentes("a"), 0)
        try cache.apagar()
        XCTAssertEqual(try cache.rejeitadas("a"), 0)
        XCTAssertNil(try cache.rascunho("a", set: "set"))
    }
}
