import AnilhaCore
import Foundation
import XCTest

final class SubstitutesTests: XCTestCase {
    private func load(_ name: String, _ sub: String?) throws -> [ReadRow] {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: sub))
        return try JSONDecoder().decode([ReadRow].self, from: Data(contentsOf: url))
    }
    /// Mesmos substitutos e motivos que o site mostra, para cada exercício do catálogo.
    func testSwapListMatchesSite() throws {
        let cases = try load("substitutes", "Fixtures")
        let catalog = try catalogFromChat()
        XCTAssertEqual(cases.count, catalog.count * 3)
        for c in cases {
            let exercise = try XCTUnwrap(catalog.first { $0.id == c.string("exercise") })
            let o = c.object("options")
            func list(_ key: String) -> [String]? {
                guard case .array(let a) = o.fields[key] else { return nil }
                return a.compactMap { if case .string(let s) = $0 { return s }; return nil }
            }
            let got = Substitutes.suggest(exercise, library: catalog, catalog: catalog,
                                          excludeIds: list("excludeIds") ?? [], available: list("available"),
                                          spareJoints: list("spareJoints"), level: o.string("level"))
            XCTAssertEqual(got.map(\.exercise.id), c.array("expected").map { $0.string("id")! }, c.string("exercise")!)
            XCTAssertEqual(got.map(\.reason), c.array("expected").map { $0.string("reason")! }, c.string("exercise")!)
        }
    }
    private func catalogFromChat() throws -> [ReadRow] {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "chat", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url)).array("catalog")
    }
}
