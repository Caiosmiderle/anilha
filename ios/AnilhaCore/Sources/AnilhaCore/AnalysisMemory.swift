import Foundation

/// Pure local projection matching src/analysis/memory.ts. No identifiers leave the device.
public enum AnalysisMemory {
    private static let destinations = ["proposed": "pendente", "saved": "aplicado", "refused": "recusado", "undone": "desfeito"]
    private struct Previous {
        let saved: ReadRow
        let session: ReadRow
        let items: [ReadRow]
        let reply: ReadRow
        let age: Int
    }
    private static func text(_ value: String?) -> Bool {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, value.utf16.count <= 180 else { return false }
        return value.range(of: "[\\x{2013}\\x{2014}\\p{Extended_Pictographic}\\p{Cc}]", options: .regularExpression) == nil
    }
    private static func previous(_ input: ReadRow, catalog: [ReadRow]) -> [Previous] {
        guard let routine = input.string("routineID") else { return [] }
        let date = input.string("date") ?? "", before = input.number("before") ?? 0
        return input.array("analyses").compactMap { saved -> Previous? in
            let binding = saved.object("binding"), session = binding.object("session"), items = binding.array("items")
            guard let reply = WorkoutAnalysis.parseReply(saved.object("reply"), slots: items.count, catalog: catalog),
                  let day = session.string("local_date"), day.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil,
                  session.bool("deleted") != true, session.string("status") == "done", session.string("routine_id") == routine,
                  (session.number("started_at") ?? .infinity) < before, destinations[saved.string("status") ?? ""] != nil else { return nil }
            let age = LocalDay.distance(day, date)
            guard age >= 0, age <= 100000 else { return nil }
            return Previous(saved: saved, session: session, items: items, reply: reply, age: age)
        }.sorted {
            let a = $0.session.number("started_at") ?? 0, b = $1.session.number("started_at") ?? 0
            return a == b ? $0.session.id < $1.session.id : a > b
        }
    }
    private static func slot(_ input: ReadRow, exercise: String?, catalog: [ReadRow]) -> JSONValue {
        guard let exercise, catalog.contains(where: { $0.id == exercise }) else { return .null }
        let matches = input.array("items").enumerated().filter { $0.element.string("exercise_id") == exercise }
        return matches.count == 1 ? .number(Double(matches[0].offset)) : .null
    }
    public static func build(_ input: ReadRow, catalog: [ReadRow]) -> [ReadRow] {
        previous(input, catalog: catalog).prefix(3).map { p in
            func target(_ value: ReadRow) -> JSONValue {
                let index = Int(value.number("slot") ?? -1)
                return slot(input, exercise: p.items.indices.contains(index) ? p.items[index].string("exercise_id") : nil, catalog: catalog)
            }
            let comments = p.reply.array("proximaVez").filter { text($0.string("comentario")) }.map {
                JSONValue.object(["slot": target($0), "comentario": $0.fields["comentario"]!])
            }
            let a = p.reply.object("adjustment")
            let adjustment: JSONValue = a.string("operation").map { operation in
                .object(["slot": target(a), "operation": .string(operation), "status": .string(destinations[p.saved.string("status") ?? ""]!)])
            } ?? .null
            return ReadRow(fields: ["days_ago": .number(Double(p.age)), "avaliacao": p.reply.fields["avaliacao"] ?? .null,
                "items": .array(comments), "adjustment": adjustment])
        }
    }
    public static func hint(_ input: ReadRow, exercise: String, routineItems: [ReadRow], catalog: [ReadRow]) -> String? {
        guard let p = previous(input, catalog: catalog).first, p.age <= 21, slot(input, exercise: exercise, catalog: catalog) != .null else { return nil }
        let old = p.saved.object("binding").array("routineItems").filter { $0.string("exercise_id") == exercise }
        let live = routineItems.filter { !$0.deleted && $0.string("routine_id") == input.string("routineID") && $0.string("exercise_id") == exercise }
        guard old.count == 1, live.count == 1, old[0].id == live[0].id,
              p.items.filter({ $0.string("exercise_id") == exercise }).count == 1,
              let index = p.items.firstIndex(where: { $0.string("exercise_id") == exercise }),
              let comment = p.reply.array("proximaVez").first(where: { $0.number("slot") == Double(index) })?.string("comentario"),
              text(comment), comment.range(of: "\\p{N}", options: .regularExpression) == nil else { return nil }
        return comment
    }
    public static func input(routineID: String?, date: String, before: Double, items: [ReadRow], analyses: [ReadRow]) -> ReadRow {
        ReadRow(fields: ["routineID": routineID.map(JSONValue.string) ?? .null, "date": .string(date), "before": .number(before),
            "items": .array(items.map { .object($0.fields) }), "analyses": .array(analyses.map { .object($0.fields) })])
    }
}
