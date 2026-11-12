import AnilhaCore
import AnilhaCache
import Foundation
import XCTest

final class ChatTests: XCTestCase {
    private func fixture() throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "chat", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    private func tables(_ row: ReadRow) -> ReadData {
        ReadData(tables: row.fields.reduce(into: [:]) { result, entry in result[entry.key] = row.array(entry.key) })
    }
    func testToolParityIncludingRisksAndValidation() throws {
        let f = try fixture()
        for v in f.array("tools") {
            XCTAssertEqual(AgentChat.execute(v.string("tool")!, input: v.object("input"), context: v.object("context"), catalog: f.array("catalog")), v.object("expected"), v.string("name") ?? "")
        }
        XCTAssertEqual(f.array("tools").count, 25)
    }
    func testContextParityAndHealthGate() throws {
        let f = try fixture()
        for v in f.array("contexts") {
            let i = v.object("input")
            let context = try AgentChat.context(tables(i.object("tables")), consent: i.object("consent"), today: i.string("today")!)
            XCTAssertEqual(context, v.object("expected"), v.string("name") ?? "")
            let text = AgentChat.contextText(context, catalog: f.array("catalog"))
            XCTAssertEqual(text, v.string("text"), v.string("name") ?? "")
            XCTAssertEqual(text.contains("Articulações a poupar: joelho."), context.bool("health") == true)
            XCTAssertFalse(text.contains("local-note-canary"))
            XCTAssertFalse(text.contains("fiction-chat"))
        }
        let data = tables(f.array("contexts")[1].object("input").object("tables"))
        XCTAssertFalse(try AgentChat.context(data, consent: nil, today: "2026-11-12").bool("health") == true)
    }
    func testApplicationParityPreservesRowsWarmupsAndNotes() throws {
        let f = try fixture()
        for v in f.array("applications") {
            var index = 0
            let binding = ReadRow(fields: ["routine": v.fields["routine"]!, "routineItems": v.fields["old"]!])
            let changes = try AgentChat.changes(v.object("proposal"), binding: binding, catalog: f.array("catalog"), newID: { defer { index += 1 }; return "new-\(index)" })
            XCTAssertEqual(changes.map { ReadRow(fields: ["table": .string($0.table), "row": .object($0.row.fields)]) }, v.array("changes"), v.string("name") ?? "")
        }
    }
    @MainActor func testModelLoopPairsToolResultsWithoutSaving() async throws {
        let f = try fixture(), vector = f.array("tools")[0]
        var calls: [[ReadRow]] = [], stages: [String] = []
        let result = try await AgentChat.run(history: [], ask: "Mais uma série", context: f.object("context"), withContext: true, catalog: f.array("catalog"), stage: { stages.append($0) }, call: { messages in
            calls.append(messages)
            if calls.count == 1 {
                return ReadRow(fields: ["text": .string(""), "stop": .string("tool_use"), "assistant": .array([
                    .object(["type": .string("tool_use"), "id": .string("tool-1"), "name": .string("editar_ficha"), "input": vector.fields["input"]!])])])
            }
            return ReadRow(fields: ["text": .string("Revise e salve."), "stop": .string("end_turn"), "assistant": .array([.object(["type": .string("text"), "text": .string("Revise e salve.")])])])
        })
        XCTAssertEqual(calls.count, 2)
        XCTAssertTrue(calls[0][0].string("content")!.contains("Pedido: Mais uma série"))
        let toolResult = try XCTUnwrap(calls[1].last?.array("content").first)
        XCTAssertEqual(toolResult.string("tool_use_id"), "tool-1")
        XCTAssertEqual(toolResult.string("content"), vector.object("expected").string("result"))
        XCTAssertEqual(result.text, "Revise e salve.")
        XCTAssertEqual(result.proposals, [vector.object("expected").object("proposal")])
        XCTAssertEqual(result.messages.count, 4)
        XCTAssertTrue(stages.contains("Montando proposta"))
    }
    @MainActor func testFourRoundsAndHonestUnsupportedTools() async throws {
        let f = try fixture()
        var count = 0
        let result = try await AgentChat.run(history: [], ask: "Novo plano", context: f.object("context"), withContext: false, catalog: f.array("catalog"), stage: { _ in }, call: { _ in
            count += 1
            return ReadRow(fields: ["stop": .string("tool_use"), "assistant": .array([.object(["type": .string("tool_use"), "id": .string("tool-\(count)"), "name": .string("propor_plano"), "input": .object([:])])])])
        })
        XCTAssertEqual(count, 4)
        XCTAssertEqual(result.proposals.count, 4)
        XCTAssertTrue(result.proposals.allSatisfy { $0.string("kind") == "site" })
        XCTAssertTrue(result.messages.last!.array("content")[0].string("content")!.contains("ainda precisam do site"))
        for tool in ["propor_plano", "nova_ficha", "nao_consigo"] {
            XCTAssertNotEqual(AgentChat.execute(tool, input: ReadRow(fields: [:]), context: f.object("context"), catalog: f.array("catalog")).object("proposal").string("kind"), "ficha")
        }
        for scalar in [0x2013, 0x2014, 0x1f600] { XCTAssertFalse(AgentChat.displayText(String(UnicodeScalar(scalar)!)).contains(String(UnicodeScalar(scalar)!))) }
    }
    @MainActor func testQueueUndoConflictsAccountIsolationAndConsentReset() async throws {
        let f = try fixture(), cache = try CacheLeitura(inMemory: true), today = "2026-11-12", owner = "fiction-chat"
        let remote = f.array("routines").map { PushChange("routines", $0) } + f.array("items").map { PushChange("routine_items", $0) } + [PushChange("plans", f.object("plan"))]
        let page = try ReadRow(fields: ["rows": .array(remote.map { .object(["table": .string($0.table), "row": .object($0.row.fields)]) }), "cursor": .number(1), "more": .bool(false)]).decode(PullPage.self)
        try cache.aplicar(page, dono: owner, since: 0)
        let proposal = f.array("tools")[0].object("expected").object("proposal")
        try cache.guardarPropostaChat(proposal, id: "save", routineID: "a", dono: owner, today: today)
        XCTAssertThrowsError(try cache.decidirChat("save", action: "apply", dono: "other", catalog: f.array("catalog"), today: today))
        try cache.decidirChat("save", action: "apply", dono: owner, catalog: f.array("catalog"), today: today)
        XCTAssertEqual(try cache.ler(owner).items("a")[0].number("sets"), 4)
        XCTAssertTrue(try cache.lote(owner).changes.allSatisfy { $0.table == "routine_items" })
        XCTAssertEqual(try cache.lote(owner).changes.count, 2)
        XCTAssertThrowsError(try cache.decidirChat("save", action: "apply", dono: owner, catalog: f.array("catalog"), today: today))
        try cache.decidirChat("save", action: "undo", dono: owner, catalog: f.array("catalog"), today: today)
        XCTAssertEqual(try cache.ler(owner).items("a")[0].number("sets"), 3)
        XCTAssertEqual(try cache.ler(owner).items("a")[0].number("warmup_sets"), 2)
        XCTAssertEqual(try cache.ler(owner).items("a")[0].string("note"), "local-note-canary")
        let replacement = f.array("tools").first { $0.string("name") == "trocar" }!.object("expected").object("proposal")
        try cache.guardarPropostaChat(replacement, id: "swap", routineID: "a", dono: owner, today: today)
        try cache.decidirChat("swap", action: "apply", dono: owner, catalog: f.array("catalog"), today: today)
        XCTAssertEqual(try cache.ler(owner).items("a")[0].string("exercise_id"), "supino-reto-halteres")
        XCTAssertTrue(try cache.ler(owner).tables["routine_items"]!.first { $0.id == "i1" }!.deleted)
        try cache.decidirChat("swap", action: "undo", dono: owner, catalog: f.array("catalog"), today: today)
        XCTAssertEqual(try cache.ler(owner).items("a")[0].id, "i1")
        XCTAssertEqual(try cache.ler(owner).items("a")[0].string("note"), "local-note-canary")
        try cache.guardarPropostaChat(proposal, id: "stale", routineID: "a", dono: owner, today: today)
        let current = try cache.ler(owner).items("a")[0]
        try cache.gravar([PushChange("routine_items", current.changing(["sets": .number(6)]))], dono: owner)
        XCTAssertThrowsError(try cache.decidirChat("stale", action: "apply", dono: owner, catalog: f.array("catalog"), today: today))
        XCTAssertThrowsError(try cache.guardarPropostaChat(proposal, id: "wrong-before", routineID: "a", dono: owner, today: today))
        let freshContext = try AgentChat.context(cache.ler(owner), consent: nil, today: today)
        let fresh = AgentChat.execute("editar_ficha", input: f.array("tools")[0].object("input"), context: freshContext, catalog: f.array("catalog")).object("proposal")
        try cache.guardarPropostaChat(fresh, id: "new", routineID: "a", dono: owner, today: today)
        try cache.decidirChat("new", action: "apply", dono: owner, catalog: f.array("catalog"), today: today)
        let saved = try cache.ler(owner).items("a")[0]
        try cache.gravar([PushChange("routine_items", saved.changing(["rest_sec": .number(100)]))], dono: owner)
        XCTAssertThrowsError(try cache.decidirChat("new", action: "undo", dono: owner, catalog: f.array("catalog"), today: today))
        try cache.guardarConsentimento(ReadRow(fields: ["saude": .object(["granted": .bool(false)])]), dono: owner)
        XCTAssertFalse(try cache.metadados(owner).keys.contains { $0.hasPrefix("chat:") })
        XCTAssertEqual(try cache.ler(owner).items("a")[0].number("rest_sec"), 100)
    }
}
