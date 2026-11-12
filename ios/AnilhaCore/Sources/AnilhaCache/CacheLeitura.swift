import AnilhaCore
import Foundation
import SwiftData

/// Sync envelopes and local-only metadata. No CloudKit or automatic saves.
@Model
final class LinhaSync {
    @Attribute(.unique) var chave: String
    var dono: String
    var tabela: String
    var dados: Data
    init(dono: String, tabela: String, row: ReadRow) throws {
        self.chave = "\(dono):\(tabela):\(row.id)"
        self.dono = dono; self.tabela = tabela
        self.dados = try JSONEncoder().encode(row)
    }
}

@Model
final class CursorSync {
    @Attribute(.unique) var dono: String
    var cursor: Int64
    var atualizadoEm: Date?
    var horizonte: Int64 = 0
    var ultimoCarimbo: Double = 0
    var versaoTabelas: Int = 0
    var cursorAntesReplay: Int64 = 0
    init(dono: String) { self.dono = dono; self.cursor = 0 }
}

@Model
final class SaidaSync {
    @Attribute(.unique) var chave: String
    var dono: String
    var tabela: String
    var id: String
    var carimbo: Double
    var rejeitada: Bool = false
    init(dono: String, tabela: String, id: String, carimbo: Double) {
        self.chave = "\(dono):\(tabela):\(id)"; self.dono = dono
        self.tabela = tabela; self.id = id; self.carimbo = carimbo
    }
}

@Model
final class RascunhoSerie {
    @Attribute(.unique) var chave: String
    var dono: String
    var dados: Data
    init(dono: String, row: ReadRow) throws {
        self.chave = "\(dono):\(row.id)"; self.dono = dono
        self.dados = try JSONEncoder().encode(row)
    }
}

@Model
final class AnaliseLocal {
    @Attribute(.unique) var chave: String
    var dono: String
    var nome: String
    var dados: Data
    init(dono: String, nome: String, row: ReadRow) throws {
        self.chave = "\(dono):\(nome)"; self.dono = dono; self.nome = nome
        self.dados = try JSONEncoder().encode(row)
    }
}

@MainActor
public final class CacheLeitura {
    private let container: ModelContainer
    private let contexto: ModelContext
    public init(inMemory: Bool = false, storeURL: URL? = nil) throws {
        let schema = Schema([LinhaSync.self, CursorSync.self, SaidaSync.self, RascunhoSerie.self, AnaliseLocal.self])
        let config: ModelConfiguration
        if let storeURL { config = ModelConfiguration(schema: schema, url: storeURL, cloudKitDatabase: .none) }
        else { config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory, cloudKitDatabase: .none) }
        container = try ModelContainer(for: schema, configurations: [config])
        contexto = ModelContext(container)
        contexto.autosaveEnabled = false
    }
    public struct Cursor: Sendable {
        public let cursor: Int64
        public let atualizadoEm: Date?
    }
    public func cursor(_ dono: String) throws -> Cursor {
        let row = try meta(dono)
        return Cursor(cursor: row.cursor, atualizadoEm: row.atualizadoEm)
    }
    /// Version A skipped records while advancing its cursor. Replay once without dropping local work.
    public func preparar(_ dono: String) throws {
        do {
            let row = try meta(dono)
            if row.versaoTabelas < 1 {
                row.cursorAntesReplay = row.cursor
                row.cursor = 0; row.versaoTabelas = 1; try contexto.save()
            }
        } catch { contexto.rollback(); throw error }
    }
    public func cursorRetencao(_ dono: String) throws -> Int64 {
        let state = try meta(dono)
        return max(state.cursor, state.cursorAntesReplay)
    }
    private func meta(_ dono: String) throws -> CursorSync {
        let rows = try contexto.fetch(FetchDescriptor<CursorSync>(predicate: #Predicate { $0.dono == dono }))
        if let row = rows.first { return row }
        let row = CursorSync(dono: dono)
        contexto.insert(row)
        return row
    }
    public func ler(_ dono: String) throws -> ReadData {
        let rows = try contexto.fetch(FetchDescriptor<LinhaSync>(predicate: #Predicate { $0.dono == dono }))
        var tables: [String: [ReadRow]] = [:]
        // Key order is deterministic across restarts, including same-day rotation ties.
        for row in rows.sorted(by: { $0.chave < $1.chave }) {
            tables[row.tabela, default: []].append(try JSONDecoder().decode(ReadRow.self, from: row.dados))
        }
        return ReadData(tables: tables)
    }
    public func aplicar(_ page: PullPage, dono: String, since: Int64) throws {
        try ReadSync.validate(page, since: since, owner: dono)
        do {
            let rows = try contexto.fetch(FetchDescriptor<LinhaSync>(predicate: #Predicate { $0.dono == dono }))
            var index = Dictionary(uniqueKeysWithValues: rows.map { ($0.chave, $0) })
            let outbox = try saidas(dono)
            for change in page.rows where ReadSync.tables.contains(change.table) {
                let key = "\(dono):\(change.table):\(change.row.id)"
                if let pending = outbox.first(where: { $0.chave == key && !$0.rejeitada }) {
                    if let local = index[key],
                       (try JSONDecoder().decode(ReadRow.self, from: local.dados).number("updated_at") ?? 0) > (change.row.number("updated_at") ?? 0) { continue }
                    contexto.delete(pending)
                }
                if let row = index[key] { row.dados = try JSONEncoder().encode(change.row) }
                else {
                    let row = try LinhaSync(dono: dono, tabela: change.table, row: change.row)
                    contexto.insert(row); index[key] = row
                }
            }
            let meta = try meta(dono)
            meta.cursor = page.cursor
            meta.cursorAntesReplay = 0
            if !page.more { meta.atualizadoEm = .now }
            // Rows (including tombstones) and cursor commit together. Never advance after failed save.
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    private func saidas(_ dono: String) throws -> [SaidaSync] {
        try contexto.fetch(FetchDescriptor<SaidaSync>(predicate: #Predicate { $0.dono == dono }))
    }
    public struct Envio: Sendable {
        public let changes: [PushChange]
        public let carimbos: [String: Double]
    }
    public func pendentes(_ dono: String) throws -> Int { try saidas(dono).filter { !$0.rejeitada }.count }
    public func rejeitadas(_ dono: String) throws -> Int { try saidas(dono).filter(\.rejeitada).count }
    public func gravar(_ changes: [PushChange], dono: String, now: Double = Date.now.timeIntervalSince1970 * 1000,
                       catalog: [ReadRow] = [], metadata: [String: ReadRow] = [:]) throws {
        guard !changes.isEmpty else { return }
        do {
            let rows = try contexto.fetch(FetchDescriptor<LinhaSync>(predicate: #Predicate { $0.dono == dono }))
            var index = Dictionary(uniqueKeysWithValues: rows.map { ($0.chave, $0) })
            var outbox = Dictionary(uniqueKeysWithValues: try saidas(dono).map { ($0.chave, $0) })
            let meta = try meta(dono)
            let beforeData = try ler(dono)
            let exercises = beforeData.exercises(catalog: catalog)
            var written: [PushChange] = []
            for change in changes {
                guard ["sessions", "session_items", "sets", "records", "routine_items"].contains(change.table), !change.row.id.isEmpty else { throw ReadSync.Failure.invalidPage }
                let ts = max(floor(now), meta.ultimoCarimbo + 1)
                meta.ultimoCarimbo = ts
                var row = change.row.changing(["user_id": .string(dono), "updated_at": .number(ts)])
                row.fields.removeValue(forKey: "server_seq")
                let key = "\(dono):\(change.table):\(row.id)"
                if !row.deleted {
                    if index[key] == nil, change.table == "sets", row.number("completed_at") == nil {
                        try porMeta(WorkoutAnalysis.numericSet(row), nome: "analysis-plan:\(row.id)", dono: dono)
                    }
                    let previousExercise = beforeData.active("session_items").first { $0.id == row.id }?.string("exercise_id")
                    if change.table == "session_items", previousExercise != row.string("exercise_id"), let exercise = exercises[row.string("exercise_id") ?? ""] {
                        let session = changes.first { $0.table == "sessions" && $0.row.id == row.string("session_id") }?.row ?? beforeData.active("sessions").first { $0.id == row.string("session_id") }
                        let suggestion = Workout.suggestion(beforeData, exercise: exercise, plan: row, today: session?.string("local_date") ?? LocalDay.today(), exclude: row.string("session_id"))
                        try porMeta(ReadRow(fields: ["rule": .string(suggestion.kind)]), nome: "analysis-rule:\(row.id)", dono: dono)
                    }
                }
                if let old = index[key] { old.dados = try JSONEncoder().encode(row) }
                else { let entry = try LinhaSync(dono: dono, tabela: change.table, row: row); contexto.insert(entry); index[key] = entry }
                if let old = outbox[key] { old.carimbo = ts; old.rejeitada = false }
                else { let entry = SaidaSync(dono: dono, tabela: change.table, id: row.id, carimbo: ts); contexto.insert(entry); outbox[key] = entry }
                written.append(PushChange(change.table, row))
            }
            for (key, value) in metadata {
                var value = value
                if value.string("status") == "saved", value.fields["undoBefore"] != nil {
                    value.fields["undoAfter"] = .array(written.map { .object(["table": .string($0.table), "row": .object($0.row.fields)]) })
                }
                try porMeta(value, nome: key, dono: dono)
            }
            for draft in try contexto.fetch(FetchDescriptor<RascunhoSerie>(predicate: #Predicate { $0.dono == dono })) {
                let row = try JSONDecoder().decode(ReadRow.self, from: draft.dados)
                if changes.contains(where: { $0.table == "sets" && $0.row.id == row.id }) { contexto.delete(draft) }
            }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func lote(_ dono: String) throws -> Envio {
        let entries = try saidas(dono).filter { !$0.rejeitada }.sorted { $0.carimbo < $1.carimbo }.prefix(200)
        let data = try ler(dono)
        var changes: [PushChange] = [], stamps: [String: Double] = [:]
        for entry in entries {
            guard let row = data.tables[entry.tabela]?.first(where: { $0.id == entry.id }) else { throw ReadSync.Failure.invalidPage }
            changes.append(PushChange(entry.tabela, row)); stamps[entry.chave] = entry.carimbo
        }
        return Envio(changes: changes, carimbos: stamps)
    }
    public func confirmar(_ envio: Envio, dono: String, rejeitadas: Set<String>) throws {
        do {
            for entry in try saidas(dono) where envio.carimbos[entry.chave] == entry.carimbo {
                if rejeitadas.contains("\(entry.tabela):\(entry.id)") { entry.rejeitada = true }
                else { contexto.delete(entry) }
            }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func horizonte(_ dono: String) throws -> Int64 { try meta(dono).horizonte }
    public func limparPurgadas(_ ids: [String: [String]], dono: String, horizon: Int64) throws {
        do {
            let pending = Set(try saidas(dono).filter { !$0.rejeitada }.map(\.chave))
            for entry in try contexto.fetch(FetchDescriptor<LinhaSync>(predicate: #Predicate { $0.dono == dono })) {
                let row = try JSONDecoder().decode(ReadRow.self, from: entry.dados)
                if row.number("updated_at") == 0 || pending.contains(entry.chave) || (ids[entry.tabela] ?? []).contains(row.id) { continue }
                contexto.delete(entry)
            }
            let state = try meta(dono)
            state.horizonte = horizon
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func marcarHorizonte(_ dono: String, horizon: Int64) throws {
        do { let state = try meta(dono); state.horizonte = horizon; try contexto.save() }
        catch { contexto.rollback(); throw error }
    }
    public func rascunho(_ dono: String, set: String) throws -> ReadRow? {
        let key = "\(dono):\(set)"
        let rows = try contexto.fetch(FetchDescriptor<RascunhoSerie>(predicate: #Predicate { $0.chave == key }))
        return try rows.first.map { try JSONDecoder().decode(ReadRow.self, from: $0.dados) }
    }
    public func guardarRascunho(_ row: ReadRow, dono: String) throws {
        do {
            let key = "\(dono):\(row.id)"
            let rows = try contexto.fetch(FetchDescriptor<RascunhoSerie>(predicate: #Predicate { $0.chave == key }))
            if let old = rows.first { old.dados = try JSONEncoder().encode(row) }
            else { contexto.insert(try RascunhoSerie(dono: dono, row: row)) }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    private func porMeta(_ row: ReadRow, nome: String, dono: String) throws {
        let key = "\(dono):\(nome)"
        let entries = try contexto.fetch(FetchDescriptor<AnaliseLocal>(predicate: #Predicate { $0.chave == key }))
        if let entry = entries.first { entry.dados = try JSONEncoder().encode(row) }
        else { contexto.insert(try AnaliseLocal(dono: dono, nome: nome, row: row)) }
    }
    public func metadados(_ dono: String) throws -> [String: ReadRow] {
        let entries = try contexto.fetch(FetchDescriptor<AnaliseLocal>(predicate: #Predicate { $0.dono == dono }))
        return try Dictionary(uniqueKeysWithValues: entries.map { ($0.nome, try JSONDecoder().decode(ReadRow.self, from: $0.dados)) })
    }
    public func guardarAnalise(_ row: ReadRow, sessionID: String, dono: String) throws {
        do { try porMeta(row, nome: "analysis:\(sessionID)", dono: dono); try contexto.save() }
        catch { contexto.rollback(); throw error }
    }
    private func stable(_ value: JSONValue) -> JSONValue {
        switch value {
        case .array(let a): return .array(a.map(stable))
        case .object(let o): return .object(o.filter { $0.key != "server_seq" }.mapValues(stable))
        default: return value
        }
    }
    public func salvarAjuste(_ saved: ReadRow, sessionID: String, dono: String, catalog: [ReadRow]) throws {
        let data = try ler(dono)
        let stored = try metadados(dono)["analysis:\(sessionID)"]
        guard stored?.string("status") == "proposed", saved.string("status") == "proposed",
              stable(.object(try WorkoutAnalysis.binding(data, sessionID: sessionID).fields)) == stable(saved.fields["binding"] ?? .null) else { throw WorkoutAnalysis.Failure.conflict }
        let changes = try WorkoutAnalysis.changes(saved.object("reply").object("adjustment"), binding: saved.object("binding"), catalog: catalog)
        let before = changes.map { change -> JSONValue in
            data.tables[change.table]?.first { $0.id == change.row.id }.map { .object($0.fields) } ?? .null
        }
        let next = saved.changing(["status": .string("saved"), "undoBefore": .array(before)])
        try gravar(changes, dono: dono, catalog: catalog, metadata: ["analysis:\(sessionID)": next])
    }
    public func desfazerAjuste(sessionID: String, dono: String) throws {
        let data = try ler(dono)
        guard let saved = try metadados(dono)["analysis:\(sessionID)"], saved.string("status") == "saved",
              case .array(let before) = saved.fields["undoBefore"] else { throw WorkoutAnalysis.Failure.conflict }
        let after = saved.array("undoAfter")
        guard !after.isEmpty, before.count == after.count else { throw WorkoutAnalysis.Failure.conflict }
        var changes: [PushChange] = []
        for (index, entry) in after.enumerated() {
            let row = entry.object("row"), table = entry.string("table") ?? ""
            guard let current = data.tables[table]?.first(where: { $0.id == row.id }), current.number("updated_at") == row.number("updated_at") else { throw WorkoutAnalysis.Failure.conflict }
            let old: ReadRow
            if case .object(let fields) = before[index] { old = ReadRow(fields: fields) }
            else { old = row.changing(["deleted": .bool(true)]) }
            changes.append(PushChange(table, old))
        }
        try gravar(changes, dono: dono, metadata: ["analysis:\(sessionID)": saved.changing(["status": .string("undone")])])
    }
    public func apagar() throws {
        do {
            for row in try contexto.fetch(FetchDescriptor<LinhaSync>()) { contexto.delete(row) }
            for row in try contexto.fetch(FetchDescriptor<CursorSync>()) { contexto.delete(row) }
            for row in try contexto.fetch(FetchDescriptor<SaidaSync>()) { contexto.delete(row) }
            for row in try contexto.fetch(FetchDescriptor<RascunhoSerie>()) { contexto.delete(row) }
            for row in try contexto.fetch(FetchDescriptor<AnaliseLocal>()) { contexto.delete(row) }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
}
