import AnilhaCache
import AnilhaCore
import Foundation
import XCTest

final class AnalysisSyncTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "analysis-sync", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    func testPayloadMergeAndReviewTransportParity() throws {
        let f = try fixture()
        for v in f.array("keys") { XCTAssertEqual(AnalysisSync.syncedKey(v.string("key")!), v.bool("expected")) }
        for v in f.array("payloads") {
            let payload = AnalysisSync.syncPayload(v.object("input"))
            XCTAssertEqual(payload, v.object("expected"))
            XCTAssertEqual(try AnalysisSync.wireText(.object(payload.fields)), v.string("stable"))
        }
        for v in f.array("merges") {
            let local = v.fields["local"] == nil ? nil : v.object("local")
            XCTAssertEqual(AnalysisSync.mergePulled(v.object("remote"), local: local), v.object("expected"))
        }
        let native = f.object("nativeReview"), wire = f.object("wireReview"), key = "review:fiction-routine"
        XCTAssertEqual(try AnalysisSync.wirePayload(native, key: key), wire)
        let pulled = try AnalysisSync.nativePayload(wire, key: key)
        XCTAssertEqual(pulled.object("version"), native.object("version"))
        XCTAssertEqual(try AnalysisSync.fingerprint(native, key: key), try AnalysisSync.fingerprint(pulled, key: key))
        var site = wire; site.fields.removeValue(forKey: "binding"); site.fields.removeValue(forKey: "routineID")
        let fromSite = try AnalysisSync.nativePayload(site, key: key)
        XCTAssertEqual(fromSite.string("routineID"), "fiction-routine")
        XCTAssertEqual(fromSite.object("binding").array("items").first?.string("exercise_id"), "supino-reto-barra")
    }
    func testNativeUndoNeverLeavesAndOnlyMatchingStatusKeepsIt() throws {
        let row = ReadRow(fields: ["status": .string("saved"), "undoBefore": .array([.object(["id": .string("fiction")])]), "undoAfter": .array([])])
        let remote = ReadRow(fields: ["status": .string("saved")])
        XCTAssertEqual(AnalysisSync.syncPayload(row), remote)
        XCTAssertEqual(AnalysisSync.mergePulled(remote, local: row), row)
        XCTAssertNil(AnalysisSync.mergePulled(remote.changing(["status": .string("undone")]), local: row).fields["undoBefore"])
        let review = ReadRow(fields: ["decisions": .array([.object(row.fields)])])
        let stripped = AnalysisSync.syncPayload(review)
        XCTAssertNil(stripped.array("decisions")[0].fields["undoBefore"])
        XCTAssertEqual(AnalysisSync.mergePulled(stripped, local: review), review)
        XCTAssertEqual(try AnalysisSync.fingerprint(row, key: "analysis:x"), try AnalysisSync.fingerprint(remote, key: "analysis:x"))
        let a = ReadRow(fields: ["z": .number(3), "a": .object(["b": .number(2), "a": .number(1)])])
        let b = try JSONDecoder().decode(ReadRow.self, from: Data(#"{"a":{"a":1,"b":2},"z":3}"#.utf8))
        XCTAssertEqual(try AnalysisSync.stableText(a), try AnalysisSync.stableText(b))
    }
    @MainActor func testProductionTSRunsIncludingInFlightEditsAndLosingPush() throws {
        let f = try fixture(), cache = try CacheLeitura(inMemory: true), owner = "fiction-a"
        func write(_ entries: [ReadRow]) throws {
            for entry in entries { try cache.gravar([], dono: owner, metadata: [entry.string("key")!: entry.object("value")]) }
        }
        for run in f.array("runs") {
            let name = run.string("name") ?? ""
            try write(run.array("before"))
            let items = try cache.analisesPendentes(owner, now: 1000)
            let pushes = run.array("pushes")
            if pushes.isEmpty { XCTAssertTrue(items.isEmpty, name) }
            else {
                let encoded = try JSONEncoder().encode(items)
                let expected = try JSONEncoder().encode(pushes[0].fields["items"]!)
                XCTAssertEqual(try JSONDecoder().decode([ReadRow].self, from: encoded), try JSONDecoder().decode([ReadRow].self, from: expected), name)
                try write(run.array("duringPush"))
                try cache.confirmarAnalises(items, dono: owner)
            }
            let since = try cache.cursorAnalises(owner)
            if case .array(let cursors) = run.fields["cursors"] { XCTAssertEqual(cursors.first, .number(Double(since)), name) }
            try write(run.array("duringPull"))
            let page = try run.object("page").decode(AnalysisSync.Page.self)
            try cache.aplicarAnalises(page, dono: owner, since: since)
            let metadata = try cache.metadados(owner)
            for entry in run.array("expected") { XCTAssertEqual(metadata[entry.string("key")!], entry.object("value"), name) }
            XCTAssertNil(metadata["chat:remote"])
            XCTAssertEqual(try cache.cursorAnalises(owner), page.cursor)
        }
    }
    @MainActor func testAccountIsolationPersistenceCleanupAndInvalidPageRollback() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("store")
        defer { try? FileManager.default.removeItem(at: url) }
        var cache: CacheLeitura? = try CacheLeitura(storeURL: url)
        let row = ReadRow(fields: ["status": .string("saved"), "reply": .object(["summary": .string("Fictício")])])
        try cache!.guardarAnalise(row, sessionID: "same", dono: "a")
        try cache!.guardarAnalise(row.changing(["status": .string("refused")]), sessionID: "same", dono: "b")
        let batch = try cache!.analisesPendentes("a", now: 10)
        try cache!.confirmarAnalises(batch, dono: "a")
        try cache!.aplicarAnalises(.init(rows: batch, cursor: 20, more: false), dono: "a", since: 0)
        cache = nil; cache = try CacheLeitura(storeURL: url)
        XCTAssertTrue(try cache!.analisesPendentes("a").isEmpty)
        XCTAssertEqual(try cache!.analisesPendentes("b").count, 1)
        XCTAssertEqual(try cache!.cursorAnalises("a"), 20)
        XCTAssertEqual(try cache!.cursorAnalises("b"), 0)
        XCTAssertEqual(try cache!.metadados("b")["analysis:same"]?.string("status"), "refused")
        XCTAssertThrowsError(try cache!.aplicarAnalises(.init(rows: [], cursor: 19, more: false), dono: "a", since: 20))
        XCTAssertEqual(try cache!.cursorAnalises("a"), 20)
        try cache!.apagar()
        XCTAssertTrue(try cache!.metadados("a").isEmpty)
        XCTAssertTrue(try cache!.metadados("b").isEmpty)
    }
}
