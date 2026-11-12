import Foundation
import XCTest
@testable import AnilhaCore

final class CalendarTests: XCTestCase {
    func testCalendarFromTypeScript() throws {
        struct Vector: Decodable {
            let name: String
            let input: TrainingCalendarInput
            let expected: [CalendarDay]
        }
        let url = try XCTUnwrap(Bundle.module.url(forResource: "calendar", withExtension: "json", subdirectory: "Fixtures"))
        let vectors = try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
        XCTAssertEqual(vectors.count, 15)
        for vector in vectors {
            XCTAssertEqual(TrainingCalendar.days(vector.input), vector.expected, vector.name)
        }
    }
    func testRunningTablesAndNullableRowsUseExistingPull() throws {
        XCTAssertTrue(ReadSync.tables.contains("runs"))
        XCTAssertTrue(ReadSync.tables.contains("external_plan_items"))
        let json = #"{"rows":[{"table":"external_plan_items","row":{"id":"fiction","user_id":"a","deleted":false,"local_date":null,"distance_m":null,"important":null}},{"table":"runs","row":{"id":"fiction-run","user_id":"a","deleted":true}}],"cursor":2,"more":false}"#
        let page = try JSONDecoder().decode(PullPage.self, from: Data(json.utf8))
        try ReadSync.validate(page, since: 0, owner: "a")
        XCTAssertNil(page.rows[0].row.number("distance_m"))
        XCTAssertTrue(page.rows[1].row.deleted)
        var data = ReadData()
        for change in page.rows { data.tables[change.table, default: []].append(change.row) }
        let days = TrainingCalendar.days(.init(data: data, month: "2026-11", today: "2026-11-12"))
        XCTAssertEqual(days.count, 30)
        XCTAssertTrue(days.allSatisfy { $0.events.isEmpty })
    }
}
