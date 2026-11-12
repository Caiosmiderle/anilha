import Foundation
import XCTest
import AnilhaCore
@testable import AnilhaCache

final class BodySyncTests: XCTestCase {
    @MainActor func testBodyQueueReopenEditAckDeleteAndRevocation() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("store")
        defer { try? FileManager.default.removeItem(at: url) }
        var cache: CacheLeitura? = try CacheLeitura(storeURL: url)
        let yes = ReadRow(fields: ["saude": .object(["granted": .bool(true)])])
        let no = ReadRow(fields: ["saude": .object(["granted": .bool(false)])])
        let row = ReadRow(fields: ["id": .string("fiction"), "deleted": .bool(false), "local_date": .string("2026-01-01"), "weight_kg": .number(80), "waist_cm": .null, "note": .null])
        XCTAssertThrowsError(try cache!.gravar([PushChange("body_logs", row)], dono: "a"))
        try cache!.guardarConsentimento(yes, dono: "a")
        try cache!.gravar([PushChange("body_logs", row)], dono: "a", now: 100)
        let sent = try cache!.lote("a")
        XCTAssertEqual(sent.changes.first?.table, "body_logs")
        XCTAssertEqual(sent.changes.first?.row.string("user_id"), "a")
        cache = nil
        cache = try CacheLeitura(storeURL: url)
        XCTAssertTrue(History.healthOn(try cache!.metadados("a")["consent"]))
        XCTAssertFalse(History.healthOn(try cache!.metadados("b")["consent"]))
        XCTAssertEqual(try cache!.ler("a").active("body_logs").first?.number("weight_kg"), 80)
        try cache!.gravar([PushChange("body_logs", row.changing(["weight_kg": .number(81)]))], dono: "a", now: 101)
        try cache!.confirmar(sent, dono: "a", rejeitadas: [])
        XCTAssertEqual(try cache!.pendentes("a"), 1)
        try cache!.gravar([PushChange("body_logs", row.changing(["deleted": .bool(true)]))], dono: "a", now: 102)
        XCTAssertTrue(try cache!.lote("a").changes.first!.row.deleted)
        try cache!.guardarConsentimento(no, dono: "a")
        XCTAssertEqual(try cache!.pendentes("a"), 0)
        XCTAssertTrue(try cache!.ler("a").tables["body_logs", default: []].isEmpty)
        XCTAssertThrowsError(try cache!.gravar([PushChange("body_logs", row)], dono: "a"))
    }
    @MainActor func testBodyPullReplayPreservesPendingTraining() async throws {
        let cache = try CacheLeitura(inMemory: true)
        let payload = #"{"rows":[{"table":"body_logs","row":{"id":"fiction","user_id":"a","deleted":false,"local_date":"2026-01-01","weight_kg":80,"waist_cm":null,"updated_at":1}}],"cursor":100,"more":false}"#
        let page = try JSONDecoder().decode(PullPage.self, from: Data(payload.utf8))
        try cache.aplicar(page, dono: "a", since: 0)
        XCTAssertEqual(try cache.ler("a").active("body_logs").count, 1)
        let training = ReadRow(fields: ["id": .string("offline"), "deleted": .bool(false)])
        try cache.gravar([PushChange("sessions", training)], dono: "a", now: 200)
        try cache.preparar("a")
        XCTAssertEqual(try cache.cursor("a").cursor, 0)
        XCTAssertEqual(try cache.cursorRetencao("a"), 100)
        XCTAssertEqual(try cache.pendentes("a"), 1)
        try cache.guardarConsentimento(ReadRow(fields: ["saude": .object(["granted": .bool(false)])]), dono: "a")
        try cache.aplicar(page, dono: "a", since: 0)
        XCTAssertTrue(try cache.ler("a").active("body_logs").isEmpty)
    }
}
