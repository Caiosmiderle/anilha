import AnilhaCore
import Foundation
import SwiftData

/// Envelopes of the eleven read tables. Payloads keep the exact server column names.
/// No CloudKit, relations, outbox, local domain edits or automatic saves.
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
    init(dono: String) { self.dono = dono; self.cursor = 0 }
}

@MainActor
public final class CacheLeitura {
    private let container: ModelContainer
    private let contexto: ModelContext
    public init(inMemory: Bool = false) throws {
        let schema = Schema([LinhaSync.self, CursorSync.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory, cloudKitDatabase: .none)
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
            for change in page.rows where ReadSync.tables.contains(change.table) {
                let key = "\(dono):\(change.table):\(change.row.id)"
                if let row = index[key] { row.dados = try JSONEncoder().encode(change.row) }
                else {
                    let row = try LinhaSync(dono: dono, tabela: change.table, row: change.row)
                    contexto.insert(row); index[key] = row
                }
            }
            let meta = try meta(dono)
            meta.cursor = page.cursor
            if !page.more { meta.atualizadoEm = .now }
            // Rows (including tombstones) and cursor commit together. Never advance after failed save.
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func apagar() throws {
        do {
            for row in try contexto.fetch(FetchDescriptor<LinhaSync>()) { contexto.delete(row) }
            for row in try contexto.fetch(FetchDescriptor<CursorSync>()) { contexto.delete(row) }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
}
