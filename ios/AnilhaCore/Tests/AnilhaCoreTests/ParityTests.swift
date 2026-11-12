import Foundation
import XCTest
@testable import AnilhaCore

final class ParityTests: XCTestCase {
    private func fixture<T: Decodable>(_ name: String, _ type: T.Type) throws -> T {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }
    func testPlanSelectionFromTypeScript() throws {
        struct Candidate: Codable { let id: String; let active_from: String; let updated_at: Double }
        struct Vector: Decodable { let day: String; let plans: [Candidate]; let expected: String? }
        for v in try fixture("plans", [Vector].self) {
            let plans = v.plans.map { p in
                Plan(id: p.id, active_from: p.active_from, updated_at: p.updated_at,
                     days: [], rules: PlanRules(no_legs_before_run: false))
            }
            XCTAssertEqual(Planning.planForDay(plans, day: v.day)?.id, v.expected, v.day)
        }
    }
    func testProjectionFromTypeScript() throws {
        struct Vector: Decodable {
            let name: String; let input: ProjectionInput; let from: String; let count: Int; let expected: [DayView]
        }
        let vectors = try fixture("projections", [Vector].self)
        XCTAssertGreaterThan(vectors.count, 35)
        for v in vectors {
            XCTAssertEqual(Planning.projectDays(v.input, from: v.from, count: v.count), v.expected, v.name)
        }
    }
    func testReadProtocolAndPrivacy() throws {
        let data = Data(#"{"rows":[{"table":"runs","row":{"id":"fiction","user_id":"a","deleted":true,"distance_km":null}}],"cursor":501,"more":false,"horizon":100}"#.utf8)
        let page = try JSONDecoder().decode(PullPage.self, from: data)
        try ReadSync.validate(page, since: 500, owner: "a")
        XCTAssertTrue(page.rows[0].row.deleted)
        XCTAssertNil(page.rows[0].row.number("distance_km"))
        XCTAssertThrowsError(try ReadSync.validate(page, since: 500, owner: "b"))
        XCTAssertThrowsError(try ReadSync.validate(page, since: 502, owner: "a"))
        XCTAssertTrue(ReadSync.requiresRebuild(since: 99, horizon: page.horizon))
        XCTAssertFalse(ReadSync.requiresRebuild(since: 0, horizon: page.horizon))
        XCTAssertFalse(ReadSync.requiresRebuild(since: 100, horizon: page.horizon))
    }
}
