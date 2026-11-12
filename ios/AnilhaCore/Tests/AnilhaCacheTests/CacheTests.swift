import AnilhaCache
import AnilhaCore
import Foundation
import XCTest

final class CacheTests: XCTestCase {
    private func page(_ json: String) throws -> PullPage {
        try JSONDecoder().decode(PullPage.self, from: Data(json.utf8))
    }
    @MainActor func testPaginationUpsertTombstoneAndCursorInSwiftData() async throws {
        let cache = try CacheLeitura(inMemory: true)
        let first = try page(#"{"rows":[{"table":"runs","row":{"id":"run","user_id":"fiction-a","deleted":false,"distance_km":5}},{"table":"body_logs","row":{"id":"ignored","user_id":"fiction-a","deleted":false}}],"cursor":500,"more":true}"#)
        try cache.aplicar(first, dono: "fiction-a", since: 0)
        XCTAssertEqual(try cache.cursor("fiction-a").cursor, 500)
        XCTAssertNil(try cache.cursor("fiction-a").atualizadoEm)
        XCTAssertEqual(try cache.ler("fiction-a").active("runs").count, 1)
        XCTAssertTrue(try cache.ler("fiction-a").active("body_logs").isEmpty)
        // Replaying the same page is idempotent (no extra row).
        try cache.aplicar(first, dono: "fiction-a", since: 0)
        XCTAssertEqual(try cache.ler("fiction-a").active("runs").count, 1)
        let deleted = try page(#"{"rows":[{"table":"runs","row":{"id":"run","user_id":"fiction-a","deleted":true}}],"cursor":501,"more":false}"#)
        try cache.aplicar(deleted, dono: "fiction-a", since: 500)
        XCTAssertTrue(try cache.ler("fiction-a").active("runs").isEmpty)
        XCTAssertEqual(try cache.ler("fiction-a").tables["runs"]?.count, 1)
        XCTAssertEqual(try cache.cursor("fiction-a").cursor, 501)
        XCTAssertNotNil(try cache.cursor("fiction-a").atualizadoEm)
        let empty = try page(#"{"rows":[],"cursor":502,"more":false}"#)
        try cache.aplicar(empty, dono: "fiction-a", since: 501)
        XCTAssertEqual(try cache.cursor("fiction-a").cursor, 502)
    }
    @MainActor func testAccountIsolationAndInvalidPageDoNotAdvanceCursor() async throws {
        let cache = try CacheLeitura(inMemory: true)
        let valid = try page(#"{"rows":[{"table":"routines","row":{"id":"same-id","user_id":"fiction-a","deleted":false,"name":"A"}}],"cursor":1,"more":false}"#)
        try cache.aplicar(valid, dono: "fiction-a", since: 0)
        XCTAssertTrue(try cache.ler("fiction-b").routines.isEmpty)
        let wrong = try page(#"{"rows":[{"table":"routines","row":{"id":"same-id","user_id":"fiction-b","deleted":false,"name":"B"}}],"cursor":2,"more":false}"#)
        XCTAssertThrowsError(try cache.aplicar(wrong, dono: "fiction-a", since: 1))
        XCTAssertEqual(try cache.cursor("fiction-a").cursor, 1)
        XCTAssertEqual(try cache.ler("fiction-a").routines.first?.string("name"), "A")
        try cache.aplicar(wrong, dono: "fiction-b", since: 0)
        XCTAssertEqual(try cache.ler("fiction-b").routines.first?.string("name"), "B")
        try cache.apagar()
        XCTAssertTrue(try cache.ler("fiction-a").routines.isEmpty)
        XCTAssertTrue(try cache.ler("fiction-b").routines.isEmpty)
        XCTAssertEqual(try cache.cursor("fiction-a").cursor, 0)
    }
}
