import Foundation
import XCTest
@testable import AnilhaCore

final class HistoryTests: XCTestCase {
    struct Fixture: Decodable {
        struct Vector: Decodable { let name: String; let tables: [String: [ReadRow]]; let today: String; let unit: String; let expected: ReadRow }
        struct Body: Decodable { let name: String; let logs: [ReadRow]; let goal: String?; let today: String; let expected: ReadRow }
        let cases: [Vector]
        let bodyCases: [Body]
    }
    private func fixture() throws -> Fixture {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "history", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }
    private func catalog() throws -> [ReadRow] {
        // Full generated catalog already shared with the analysis parity tests.
        let url = try XCTUnwrap(Bundle.module.url(forResource: "analysis", withExtension: "json", subdirectory: "Fixtures"))
        let data = try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
        return data.array("catalog")
    }
    private func compare(_ actual: JSONValue, _ expected: JSONValue, _ path: String) {
        switch (actual, expected) {
        case (.number(let a), .number(let b)): XCTAssertEqual(a, b, accuracy: 1e-9, path)
        case (.array(let a), .array(let b)):
            XCTAssertEqual(a.count, b.count, path)
            for (i, pair) in zip(a, b).enumerated() { compare(pair.0, pair.1, "\(path)[\(i)]") }
        case (.object(let a), .object(let b)):
            XCTAssertEqual(Set(a.keys), Set(b.keys), path)
            for key in b.keys { if let v = a[key] { compare(v, b[key]!, "\(path).\(key)") } }
        default: XCTAssertEqual(actual, expected, path)
        }
    }
    func testWeeksProgressAndVolumeFromTypeScript() throws {
        let catalog = try catalog()
        XCTAssertFalse(catalog.isEmpty)
        for v in try fixture().cases {
            let data = ReadData(tables: v.tables)
            compare(.array(History.weeks(data, today: v.today).map { .object($0.fields) }), v.expected.fields["weeks"]!, v.name + ".weeks")
            compare(.array(History.weeklyGroupSets(data, catalog: catalog, today: v.today).map { .object($0.fields) }), v.expected.fields["volume"]!, v.name + ".volume")
            compare(.array(History.exercises(data, catalog: catalog).map { .string($0.id) }), v.expected.fields["options"]!, v.name + ".options")
            for progress in v.expected.array("progress") {
                let ex = try XCTUnwrap(data.exercises(catalog: catalog)[progress.id])
                compare(.object(History.progress(data, exercise: ex, unit: v.unit).fields), .object(progress.object("result").fields), v.name + ".progress")
            }
        }
    }
    func testBodyTrendFromTypeScript() throws {
        for v in try fixture().bodyCases {
            compare(.object(History.bodyTrend(v.logs, goal: v.goal, today: v.today).fields), .object(v.expected.fields), v.name)
        }
    }
    func testConsentAndBodyValidation() throws {
        let yes = ReadRow(fields: ["saude": .object(["granted": .bool(true)])])
        let no = ReadRow(fields: ["saude": .object(["granted": .bool(false)])])
        let row = ReadRow(fields: ["id": .string("fiction"), "local_date": .string("2026-11-12"), "weight_kg": .number(80), "waist_cm": .null, "deleted": .bool(false)])
        XCTAssertFalse(History.healthOn(nil)); XCTAssertFalse(History.healthOn(no)); XCTAssertTrue(History.healthOn(yes))
        XCTAssertThrowsError(try History.bodyChange(row, consent: nil, today: "2026-11-12"))
        XCTAssertThrowsError(try History.bodyChange(row, consent: no, today: "2026-11-12"))
        XCTAssertEqual(try History.bodyChange(row, consent: yes, today: "2026-11-12").table, "body_logs")
        for value in ["", "invalid", "2026-02-30", "2026-11-13"] {
            XCTAssertThrowsError(try History.bodyChange(row.changing(["local_date": .string(value)]), consent: yes, today: "2026-11-12"))
        }
        for kg in [19.9, 400.1] { XCTAssertThrowsError(try History.bodyChange(row.changing(["weight_kg": .number(kg)]), consent: yes, today: "2026-11-12")) }
        for cm in [29.9, 250.1] { XCTAssertThrowsError(try History.bodyChange(row.changing(["waist_cm": .number(cm)]), consent: yes, today: "2026-11-12")) }
        XCTAssertTrue(ReadSync.tables.contains("body_logs"))
    }
}
