import AnilhaCache
import AnilhaCore
import Foundation
import XCTest

final class RoutineEditingTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "routines", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    private func encoded(_ changes: [PushChange]) -> [ReadRow] {
        changes.map { ReadRow(fields: ["table": .string($0.table), "row": .object($0.row.fields)]) }
    }
    func testManualCreationEditReorderRemovalDeletionAndDefaultsParity() throws {
        let f = try fixture()
        XCTAssertEqual(RoutineEditing.blank(id: "new", position: 2), f.array("applications")[0].object("routine"))
        for v in f.array("defaults") {
            XCTAssertEqual(RoutineEditing.added(v.object("exercise"), params: v.object("params")), v.object("expected"))
        }
        for v in f.array("applications") {
            var next = 0
            let changes = try RoutineEditing.changes(routine: v.object("routine"), old: v.array("old"), after: v.array("after"), catalog: f.array("catalog"), newID: { defer { next += 1 }; return "new-\(next)" })
            XCTAssertEqual(encoded(changes), v.array("changes"), v.string("name") ?? "")
        }
        for v in f.array("deletions") {
            XCTAssertEqual(encoded(RoutineEditing.deleteChanges(v.object("routine"), items: v.array("items"))), v.array("changes"))
        }
    }
    func testLastTimeUpdatesParityIncludingCompletedWorkWarmupsTimeAndMissingHistory() throws {
        let f = try fixture()
        for v in f.array("dismissals") {
            let suggestion = try v.object("suggestion").decode(LoadSuggestion.self)
            XCTAssertEqual(Workout.lastTimeUpdates(suggestion, itemSets: v.array("sets"), measure: v.string("measure")!), v.array("expected"))
        }
        XCTAssertEqual(f.array("dismissals").count, 14)
    }
    @MainActor func testAtomicRoutineQueueConflictsDeletionAndRollback() throws {
        let f = try fixture(), cache = try CacheLeitura(inMemory: true), owner = "fiction-routine"
        let v = f.array("applications").first { $0.string("name") == "criar-com-proprio" }!
        try cache.salvarFicha(v.object("routine"), original: nil, oldItems: [], after: v.array("after"), dono: owner, catalog: f.array("catalog"))
        let saved = try cache.ler(owner), original = try XCTUnwrap(saved.routines.first)
        XCTAssertEqual(saved.items(original.id).count, 1)
        XCTAssertEqual(try cache.lote(owner).changes.count, 2)
        XCTAssertTrue(try cache.lote("other").changes.isEmpty)
        XCTAssertThrowsError(try cache.salvarFicha(v.object("routine"), original: nil, oldItems: [], after: [], dono: owner, catalog: f.array("catalog")))
        let items = saved.items(original.id)
        try cache.gravar([PushChange("routine_items", items[0].changing(["note": .string("Mudou em outro editor")]))], dono: owner)
        XCTAssertThrowsError(try cache.apagarFicha(original, oldItems: items, dono: owner))
        let current = try cache.ler(owner)
        try cache.apagarFicha(original, oldItems: current.items(original.id), dono: owner)
        XCTAssertTrue(try cache.ler(owner).routines.isEmpty)
        XCTAssertTrue(try cache.ler(owner).items(original.id).isEmpty)
        XCTAssertTrue(try cache.lote(owner).changes.allSatisfy { $0.row.deleted })
        let before = try cache.lote(owner).changes
        XCTAssertThrowsError(try cache.gravar([PushChange("routines", original), PushChange("invalid", original)], dono: owner))
        XCTAssertEqual(encoded(try cache.lote(owner).changes), encoded(before))
        var invalid = v.array("after")
        invalid[0].fields["sets"] = .number(11)
        XCTAssertThrowsError(try RoutineEditing.changes(routine: v.object("routine"), old: [], after: invalid, catalog: f.array("catalog")))
    }
    @MainActor func testDismissalPersistsLocallyAndInvalidatesOnlyRestoredDrafts() throws {
        let f = try fixture(), owner = "fiction-routine"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        for v in f.array("queueDismissals") {
            let url = directory.appendingPathComponent("\(v.string("kind")!).store")
            var cache: CacheLeitura? = try CacheLeitura(storeURL: url)
            let tables = v.object("tables")
            let remote = tables.fields.keys.sorted().flatMap { table in tables.array(table).map { PushChange(table, $0) } }
            let page = try ReadRow(fields: ["rows": .array(encoded(remote).map { .object($0.fields) }), "cursor": .number(1), "more": .bool(false)]).decode(PullPage.self)
            try cache!.aplicar(page, dono: owner, since: 0)
            let before = try cache!.ler(owner)
            for set in Workout.sets(before, "item") { try cache!.guardarRascunho(set.changing(["reps": .number(99)]), dono: owner) }
            try cache!.ignorarSugestao(sessionID: "session", itemID: "item", dono: owner, catalog: f.array("catalog"))
            let after = try cache!.ler(owner), updates = v.array("updates")
            for set in Workout.sets(before, "item") {
                let restored = updates.first { $0.id == set.id }
                let current = Workout.sets(after, "item").first { $0.id == set.id }!
                XCTAssertEqual(current.fields["load_kg"], restored?.fields["load_kg"] ?? set.fields["load_kg"])
                XCTAssertEqual(current.fields["reps"], restored?.fields["reps"] ?? set.fields["reps"])
                XCTAssertEqual(try cache!.rascunho(owner, set: set.id) == nil, restored != nil)
            }
            XCTAssertEqual(try cache!.lote(owner).changes.count, updates.count)
            XCTAssertTrue(try cache!.lote(owner).changes.allSatisfy { $0.table == "sets" })
            let pending = encoded(try cache!.lote(owner).changes)
            try cache!.ignorarSugestao(sessionID: "session", itemID: "item", dono: owner, catalog: f.array("catalog"))
            XCTAssertEqual(encoded(try cache!.lote(owner).changes), pending)
            cache = nil
            cache = try CacheLeitura(storeURL: url)
            XCTAssertTrue(try cache!.metadados(owner)["dismissed:session"]?.bool("item") == true)
            XCTAssertNil(try cache!.metadados("other")["dismissed:session"])
            XCTAssertNil(try cache!.metadados(owner)["dismissed:another-session"])
            cache = nil
        }
    }
}
