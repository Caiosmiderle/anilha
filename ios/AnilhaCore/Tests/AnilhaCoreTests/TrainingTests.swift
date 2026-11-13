import Foundation
import XCTest
import AnilhaCache
@testable import AnilhaCore

final class TrainingTests: XCTestCase {
    private func fixture(_ name: String) throws -> ReadRow {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ReadRow.self, from: Data(contentsOf: url))
    }
    func testProgressionAndPrefillFromTypeScript() throws {
        for (index, vector) in try fixture("training").array("progression").enumerated() {
            let actual = Progression.suggest(vector.object("input"))
            let expected = try vector.object("expected").decode(LoadSuggestion.self)
            XCTAssertEqual(actual.kind, expected.kind, "vector \(index)")
            XCTAssertEqual(actual.load_kg ?? -1, expected.load_kg ?? -1, accuracy: 1e-8)
            XCTAssertEqual(actual.target_min, expected.target_min)
            XCTAssertEqual(actual.target_max, expected.target_max)
            XCTAssertEqual(actual.confidence, expected.confidence)
            XCTAssertEqual(actual.missing_effort, expected.missing_effort)
            XCTAssertEqual(actual.based_on, expected.based_on)
            for (offset, i) in [0, 1, 3].enumerated() {
                for (row, key) in [(actual.prefill(i), "prefill"), (actual.last(i), "last")] {
                    let expected = vector.array(key)[offset]
                    XCTAssertEqual(row.number("load_kg") ?? -1, expected.number("load_kg") ?? -1, accuracy: 1e-8)
                    XCTAssertEqual(row.number("value"), expected.number("value"))
                }
            }
        }
    }
    func testWarmupReturnAndSupersetFromTypeScript() throws {
        let fixture = try fixture("training")
        for v in fixture.array("warmups") {
            let actual = Progression.warmupLoads(v.number("load"), count: Int(v.number("count") ?? 0), increment: v.number("step") ?? 0, simple: v.bool("simple") == true)
            let encoded = try JSONEncoder().encode(actual)
            let expected = try JSONEncoder().encode(v.fields["expected"] ?? .null)
            XCTAssertEqual(try JSONDecoder().decode(JSONValue.self, from: encoded), try JSONDecoder().decode(JSONValue.self, from: expected))
        }
        for v in fixture.array("returns") {
            let input = v.object("input")
            var data = ReadData(tables: ["profiles": [ReadRow(fields: ["return_mode": input.fields["setting"] ?? .null, "return_started_on": input.fields["manualStartedOn"] ?? .null])]])
            if case .array(let dates) = input.fields["trainingDates"] {
                data.tables["sessions"] = dates.enumerated().map { index, date in ReadRow(fields: ["id": .string("s\(index)"), "status": .string("done"), "local_date": date]) }
            }
            XCTAssertEqual(Workout.returning(data, today: input.string("today") ?? ""), v.bool("expected"))
        }
        for v in fixture.array("supersets") {
            let items = v.array("items").map { $0.changing(["session_id": .string("s"), "rest_sec": .number(90)]) }
            let sets = v.array("sets").map { $0.changing(["session_id": .string("s")]) }
            let data = ReadData(tables: ["sessions": [ReadRow(fields: ["id": .string("s"), "status": .string("active")])], "session_items": items, "sets": sets])
            let next = try XCTUnwrap(Workout.next(items, sets: sets))
            XCTAssertEqual(next.id, v.string("next"))
            let changes = Workout.complete(data, set: next, now: 1000)
            XCTAssertEqual(changes.last?.row.number("rest_started_at") != nil, v.bool("rest"))
            let fractional = Workout.complete(data, set: next, now: 1000.75)
            XCTAssertEqual(fractional.first?.row.number("completed_at"), 1000)
            if v.bool("rest") == true { XCTAssertEqual(fractional.last?.row.number("rest_started_at"), 1000) }
        }
    }
    @MainActor func testRowsMatchSessionActuallyWrittenByPWA() async throws {
        let f = try fixture("session")
        let owner = try XCTUnwrap(f.string("owner")), now = try XCTUnwrap(f.number("now"))
        var data = ReadData(tables: ["profiles": f.object("initial").array("profiles"), "routines": f.object("initial").array("routines"), "routine_items": f.object("initial").array("routine_items")])
        let catalog = f.array("catalog")
        let cache = try CacheLeitura(inMemory: true)
        var sequence = 100
        func newID() -> String { defer { sequence += 1 }; return String(format: "00000000-0000-4000-8000-%012d", sequence) }
        func apply(_ changes: [PushChange]) throws {
            try cache.gravar(changes, dono: owner, now: now)
            for change in changes {
                let row = change.row.changing(["user_id": .string(owner), "updated_at": .number(now)])
                var rows = data.tables[change.table] ?? []
                rows.removeAll { $0.id == row.id }; rows.append(row); data.tables[change.table] = rows
            }
        }
        func rows(_ tables: [String]) -> [PushChange] {
            tables.flatMap { table in (data.tables[table] ?? []).sorted { $0.id < $1.id }.map { PushChange(table, $0) } }
        }
        try apply(Workout.start(data, routine: data.routines[0], catalog: catalog, today: f.string("today") ?? "", now: now, newID: newID))
        let started = rows(["sessions", "session_items", "sets"])
        let expectedStart = ["sessions", "session_items", "sets"].flatMap { table in f.object("start").array(table).sorted { $0.id < $1.id }.map { PushChange(table, $0) } }
        XCTAssertEqual(started, expectedStart)
        XCTAssertTrue(Workout.start(data, routine: data.routines[0], catalog: catalog, today: f.string("today") ?? "", now: now).isEmpty)
        let session = try XCTUnwrap(data.active("sessions").first)
        var edited = data
        edited.tables["sessions"] = [session.changing(["title": .string("Edição remota"), "note": .string("Fictícia")])]
        XCTAssertEqual(Workout.finish(edited, session: session, now: now).last?.row.string("note"), "Fictícia")
        XCTAssertEqual(Workout.finish(data, session: session, now: now + 0.75).last?.row.number("ended_at"), now)
        let items = Workout.items(data, session.id)
        for set in Workout.sets(data, items[0].id) {
            try apply(Workout.complete(data, set: set.changing(["load_kg": .number(set.string("kind") == "warmup" ? 10 : 40), "reps": .number(set.string("kind") == "warmup" ? 6 : 8), "seconds": .null]), now: now))
        }
        try apply(Workout.substitute(data, item: items[1], exercise: try XCTUnwrap(catalog.first { $0.id == "prancha" }), catalog: catalog, today: f.string("today") ?? "", newID: newID))
        let second = try XCTUnwrap(data.active("session_items").first { $0.id == items[1].id })
        try apply(Workout.skip(data, item: second))
        try apply(Workout.finish(data, session: try XCTUnwrap(data.active("sessions").first), now: now))
        try apply(Workout.records(data, session: session.id, catalog: catalog))
        let actual = rows(["sessions", "session_items", "sets", "records"])
        let expected = try f.object("payload").decode(PushPayload.self).changes.sorted { $0.table == $1.table ? $0.row.id < $1.row.id : $0.table < $1.table }
        XCTAssertEqual(actual.sorted { $0.table == $1.table ? $0.row.id < $1.row.id : $0.table < $1.table }, expected)
        let queued = try cache.lote(owner).changes
        let normalized = queued.map { PushChange($0.table, $0.row.changing(["updated_at": .number(now)])) }
        XCTAssertEqual(normalized.sorted { $0.table == $1.table ? $0.row.id < $1.row.id : $0.table < $1.table }, expected)
        // CI exports Swift's own assembly for the local API/browser interoperability test.
        if let output = ProcessInfo.processInfo.environment["ANILHA_NATIVE_PAYLOAD"] {
            let url = URL(fileURLWithPath: output)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(PushPayload(changes: queued)).write(to: url, options: .atomic)
        }
    }
    func testEditorAndWorkoutOrderFromTypeScript() throws {
        let f = try fixture("training")
        for v in f.array("editors") {
            let input = v.object("input"), unit = v.object("input").string("unit") ?? "kg"
            let start = Workout.editorStart(input.object("set"), itemSets: input.array("sets"), exercise: input.object("exercise"), unit: unit)
            XCTAssertEqual(start, v.object("start"))
            let saved = Workout.editorSave(start, exercise: input.object("exercise"), unit: unit)
            XCTAssertEqual(saved, v.object("saved"))
        }
        for v in f.array("moves") {
            let items = v.array("input").map { $0.changing(["session_id": .string("session")]) }
            let sets = items.filter { $0.bool("pending") == true }.map { ReadRow(fields: ["id": .string("set-\($0.id)"), "item_id": .string($0.id), "completed_at": .null]) }
            let data = ReadData(tables: ["session_items": items, "sets": sets])
            let item = try XCTUnwrap(items.first { $0.id == v.string("id") })
            let changes = Workout.move(data, item: item, end: v.bool("end") == true)
            let moved = items.map { row in changes.first { $0.row.id == row.id }?.row ?? row }
            XCTAssertEqual(JSONValue.array(Workout.ordered(moved).map { .string($0.id) }), v.fields["expected"])
        }
        for v in f.array("prescription") {
            let sets = v.number("sets") ?? 0
            let profile = ReadRow(fields: ["return_mode": .string("off"), "onboarding": .object(["level": .string(v.bool("simple") == true ? "iniciante" : "intermediario")]), "deload_week": v.bool("deload") == true ? .string("2026-11-09") : .null])
            let routine = ReadRow(fields: ["id": .string("routine")])
            let plans = ["time", "load"].enumerated().map { index, exercise in ReadRow(fields: ["id": .string(exercise), "routine_id": .string("routine"), "exercise_id": .string(exercise), "position": .number(Double(index)), "sets": .number(sets), "warmup_sets": .number(0)]) }
            let data = ReadData(tables: ["profiles": [profile], "routine_items": plans])
            let catalog = [ReadRow(fields: ["id": .string("time"), "measure": .string("time")]), ReadRow(fields: ["id": .string("load"), "measure": .string("weight_reps")])]
            let actual = Workout.start(data, routine: routine, catalog: catalog, today: "2026-11-12", now: 1000).filter { $0.table == "session_items" }.map(\.row)
            for (a, e) in zip(actual, v.array("expected")) {
                XCTAssertEqual(a.number("planned_sets"), e.number("sets"))
                XCTAssertEqual(a.number("warmup_sets"), e.number("warmup_sets"))
            }
        }
    }
    func testEditFinishedSetUpdatesItemStatusAndRecords() throws {
        let ex = ReadRow(fields: ["id": .string("supino"), "name": .string("Fictício"), "measure": .string("weight_reps")])
        func done(_ id: String, _ session: String, _ kg: Double, _ at: Double) -> ReadRow {
            ReadRow(fields: ["id": .string(id), "session_id": .string(session), "item_id": .string("i-" + session), "exercise_id": .string("supino"),
                             "kind": .string("work"), "load_kg": .number(kg), "reps": .number(8), "completed_at": .number(at), "position": .number(0)])
        }
        var tables: [String: [ReadRow]] = [
            "sessions": [ReadRow(fields: ["id": .string("a"), "status": .string("done"), "local_date": .string("2026-11-01")]),
                         ReadRow(fields: ["id": .string("b"), "status": .string("done"), "local_date": .string("2026-11-08")]),
                         ReadRow(fields: ["id": .string("c"), "status": .string("active"), "local_date": .string("2026-11-13")])],
            "session_items": [ReadRow(fields: ["id": .string("i-a"), "session_id": .string("a"), "status": .string("done")]),
                              ReadRow(fields: ["id": .string("i-b"), "session_id": .string("b"), "status": .string("done")])],
            "sets": [done("sa", "a", 20, 1), done("sb", "b", 25, 2)],
        ]
        let before = ReadData(tables: tables)
        tables["records"] = Workout.records(before, session: "b", catalog: [ex]).map(\.row)
        XCTAssertEqual(tables["records"]?.count, 1)
        let data = ReadData(tables: tables)
        // A typo fixed down to 20 kg: no record left in session b.
        let fixed = Workout.editFinishedSet(data, set: "sb", values: ["load_kg": .number(20)], catalog: [ex])
        XCTAssertEqual(fixed.first { $0.table == "sets" }?.row.number("load_kg"), 20)
        XCTAssertEqual(fixed.filter { $0.table == "records" }.map(\.row.deleted), [true])
        XCTAssertTrue(fixed.filter { $0.table == "session_items" }.isEmpty)
        // Deleting the only set of b: the exercise becomes not done and the record goes.
        let deleted = Workout.editFinishedSet(data, set: "sb", values: nil, catalog: [ex])
        XCTAssertEqual(deleted.first { $0.table == "sets" }?.row.deleted, true)
        XCTAssertEqual(deleted.first { $0.table == "session_items" }?.row.string("status"), "not_done")
        XCTAssertEqual(deleted.filter { $0.table == "records" }.map(\.row.deleted), [true])
        // An unchanged value writes only the set; an active workout is not edited here.
        XCTAssertEqual(Workout.editFinishedSet(data, set: "sb", values: ["load_kg": .number(25)], catalog: [ex]).map(\.table), ["sets"])
        XCTAssertEqual(Workout.editFinishedSet(data, set: "missing", values: [:], catalog: [ex]), [])
    }

    func testDeleteSessionTombstonesRowsAndRecomputesRecords() throws {
        for v in try fixture("training").array("progression") {
            let input = v.object("input"), exercise = input.object("exercise").changing(["id": .string("exercise"), "name": .string("Fictício")])
            let logs = input.array("logs")
            var tables: [String: [ReadRow]] = [:]
            for log in logs {
                let session = log.string("session_id") ?? ""
                tables["sessions", default: []].append(ReadRow(fields: ["id": .string(session), "status": .string("done"), "local_date": log.fields["local_date"] ?? .null]))
                tables["session_items", default: []].append(ReadRow(fields: ["id": .string(session), "session_id": .string(session), "target_min": log.fields["target_min"] ?? .null, "target_max": log.fields["target_max"] ?? .null]))
                for (i, set) in log.array("sets").enumerated() {
                    tables["sets", default: []].append(set.changing(["id": .string("\(session)-\(i)"), "session_id": .string(session), "item_id": .string(session), "exercise_id": .string("exercise"), "position": .number(Double(i)), "completed_at": .number(Double(i + 1))]))
                }
            }
            // The records the history already has, as the site and the iPhone would have saved.
            let before = ReadData(tables: tables)
            // The latest session in history order (the same order records use).
            guard let last = Workout.logs(before, exercise: "exercise").last?.string("session_id") else { continue }
            tables["records"] = before.active("sessions").flatMap { Workout.records(before, session: $0.id, catalog: [exercise]).map(\.row) }
            let data = ReadData(tables: tables)
            let changes = Workout.deleteSession(data, session: last, catalog: [exercise])
            // Every row of the last session becomes a tombstone; nothing else of the workout changes.
            let rows = changes.filter { $0.table != "records" }
            XCTAssertEqual(rows.count, data.active("sets").filter { $0.string("session_id") == last }.count + 2)
            XCTAssertTrue(rows.allSatisfy { $0.row.deleted })
            XCTAssertEqual(Set(rows.filter { $0.table == "sessions" }.map(\.row.id)), [last])
            // Deleting the last session only removes its own records: earlier ones do not depend on it.
            let records = changes.filter { $0.table == "records" }
            let ownRecords = (tables["records"] ?? []).filter { $0.string("session_id") == last }
            XCTAssertEqual(Set(records.map(\.row.id)), Set(ownRecords.map(\.id)))
            XCTAssertTrue(records.allSatisfy { $0.row.deleted })
        }
        XCTAssertEqual(Workout.deleteSession(ReadData(), session: "missing", catalog: []), [])
    }

    func testRecordsFromTypeScriptHistories() throws {
        for v in try fixture("training").array("progression") {
            let input = v.object("input"), exercise = input.object("exercise").changing(["id": .string("exercise"), "name": .string("Fictício")])
            var tables: [String: [ReadRow]] = [:]
            for log in input.array("logs") {
                let session = log.string("session_id") ?? ""
                tables["sessions", default: []].append(ReadRow(fields: ["id": .string(session), "status": .string("done"), "local_date": log.fields["local_date"] ?? .null]))
                tables["session_items", default: []].append(ReadRow(fields: ["id": .string(session), "target_min": log.fields["target_min"] ?? .null, "target_max": log.fields["target_max"] ?? .null]))
                for (i, set) in log.array("sets").enumerated() {
                    tables["sets", default: []].append(set.changing(["id": .string("\(session)-\(i)"), "session_id": .string(session), "item_id": .string(session), "exercise_id": .string("exercise"), "position": .number(Double(i)), "completed_at": .number(Double(i + 1))]))
                }
            }
            let data = ReadData(tables: tables)
            for session in data.active("sessions") {
                let actual = Workout.records(data, session: session.id, catalog: [exercise]).map(\.row)
                let expected = v.array("records").filter { $0.string("session_id") == session.id }
                XCTAssertEqual(actual.count, expected.count)
                for (a, e) in zip(actual, expected) {
                    XCTAssertEqual(a.string("kind"), e.string("kind"))
                    XCTAssertEqual(a.number("value") ?? -1, Progression.round((e.number("value") ?? -1) * 100) / 100, accuracy: 1e-8)
                }
            }
        }
    }
}
