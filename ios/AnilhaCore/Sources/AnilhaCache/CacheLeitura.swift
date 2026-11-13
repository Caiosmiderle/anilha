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
    /// Replay newly supported tables (records in v1, body_logs in v2) without dropping local work.
    public func preparar(_ dono: String) throws {
        do {
            let row = try meta(dono)
            if row.versaoTabelas < 2 {
                row.cursorAntesReplay = max(row.cursorAntesReplay, row.cursor)
                row.cursor = 0; row.versaoTabelas = 2; try contexto.save()
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
            let healthDenied = try metadados(dono)["consent"]?.object("saude").bool("granted") == false
            for change in page.rows where ReadSync.tables.contains(change.table) {
                if healthDenied && change.table == "body_logs" { continue }
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
        guard !changes.isEmpty || !metadata.isEmpty else { return }
        do {
            let rows = try contexto.fetch(FetchDescriptor<LinhaSync>(predicate: #Predicate { $0.dono == dono }))
            var index = Dictionary(uniqueKeysWithValues: rows.map { ($0.chave, $0) })
            var outbox = Dictionary(uniqueKeysWithValues: try saidas(dono).map { ($0.chave, $0) })
            let meta = try meta(dono)
            let beforeData = try ler(dono)
            let exercises = beforeData.exercises(catalog: catalog)
            var written: [PushChange] = []
            for change in changes {
                // profiles: modo retorno; exercises: exercício próprio criado no iPhone. Como no site.
                guard ["plans", "sessions", "session_items", "sets", "records", "routines", "routine_items", "body_logs", "profiles", "exercises"].contains(change.table), !change.row.id.isEmpty else { throw ReadSync.Failure.invalidPage }
                if change.table == "body_logs" {
                    _ = try History.bodyChange(change.row, consent: metadados(dono)["consent"], today: LocalDay.today())
                }
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
                if key.hasPrefix("review:"), let index = value.number("reviewWrite") {
                    var decisions = value.array("decisions")
                    let i = Int(index)
                    guard decisions.indices.contains(i), let routineID = value.string("routineID") else { throw WorkoutAnalysis.Failure.conflict }
                    if decisions[i].string("status") == "saved" {
                        decisions[i].fields["undoAfter"] = .array(written.map { .object(["table": .string($0.table), "row": .object($0.row.fields)]) })
                    }
                    value.fields["decisions"] = .array(decisions.map { .object($0.fields) })
                    value.fields["version"] = .object(RoutineReview.version(try ler(dono), routineID: routineID).fields)
                    value.fields.removeValue(forKey: "reviewWrite")
                }
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
    public func adotarPlano(_ generated: ReadRow, params: ReadRow, baseline: ReadRow, today: String, dono: String) throws {
        let data = try ler(dono)
        guard NewPlan.binding(data) == baseline, let profile = data.active("profiles").first(where: { $0.id == dono }) else { throw PlanEngine.Failure.conflict }
        let allowed = History.healthOn(try metadados(dono)["consent"])
        guard allowed || params.fields["spare_joints"] == .array([]) else { throw PlanEngine.Failure.conflict }
        try PlanEngine.validate(params, today: today)
        // Saving must match exactly what was reviewed, including current consent.
        guard try PlanEngine.generate(params) == generated else { throw PlanEngine.Failure.conflict }
        try gravar(NewPlan.changes(generated, params: params, today: today, profile: profile, routines: data.tables["routines"] ?? []), dono: dono)
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
    /// Check the snapshot immediately before the atomic write, including items removed remotely.
    public func salvarFicha(_ routine: ReadRow, original: ReadRow?, oldItems: [ReadRow], after: [ReadRow], dono: String, catalog: [ReadRow]) throws {
        let data = try ler(dono)
        let current = data.tables["routines"]?.first { $0.id == routine.id }
        guard current.map({ stable(.object($0.fields)) }) == original.map({ stable(.object($0.fields)) }),
              stable(.array(data.items(routine.id).map { .object($0.fields) })) == stable(.array(oldItems.map { .object($0.fields) })) else { throw RoutineEditing.Failure.conflict }
        let changes = try RoutineEditing.changes(routine: routine, old: oldItems, after: after, catalog: catalog)
        try gravar(changes, dono: dono, catalog: catalog)
    }
    public func apagarFicha(_ original: ReadRow, oldItems: [ReadRow], dono: String) throws {
        let data = try ler(dono)
        guard let current = data.routines.first(where: { $0.id == original.id }),
              stable(.object(current.fields)) == stable(.object(original.fields)),
              stable(.array(data.items(original.id).map { .object($0.fields) })) == stable(.array(oldItems.map { .object($0.fields) })) else { throw RoutineEditing.Failure.conflict }
        try gravar(RoutineEditing.deleteChanges(current, items: oldItems), dono: dono)
    }
    public func ignorarSugestao(sessionID: String, itemID: String, dono: String, catalog: [ReadRow]) throws {
        let data = try ler(dono)
        guard let session = data.active("sessions").first(where: { $0.id == sessionID && $0.string("status") == "active" }),
              let item = Workout.items(data, sessionID).first(where: { $0.id == itemID }),
              let exercise = data.exercises(catalog: catalog)[item.string("exercise_id") ?? ""] else { throw ReadSync.Failure.invalidPage }
        let key = "dismissed:\(sessionID)"
        let state = try metadados(dono)[key] ?? ReadRow(fields: [:])
        if state.bool(itemID) == true { return }
        let suggestion = Workout.suggestion(data, exercise: exercise, plan: item, today: session.string("local_date") ?? LocalDay.today(), exclude: sessionID)
        let sets = Workout.sets(data, itemID)
        var changes: [PushChange] = []
        if suggestion.based_on != nil && ["increase", "decrease"].contains(suggestion.kind) {
            changes = Workout.lastTimeUpdates(suggestion, itemSets: sets, measure: exercise.string("measure") ?? "weight_reps").compactMap { update in
                sets.first { $0.id == update.id }.map { PushChange("sets", $0.changing(update.fields)) }
            }
        }
        // Metadata, restored sets, outbox and draft invalidation commit together.
        try gravar(changes, dono: dono, catalog: catalog, metadata: [key: state.changing([itemID: .bool(true)])])
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
    public func cursorAnalises(_ dono: String) throws -> Int64 {
        Int64(try metadados(dono)[AnalysisSync.cursorKey]?.number("value") ?? 0)
    }
    /// Snapshot once per run; an edit during a request must remain pending for the next run.
    public func analisesPendentes(_ dono: String, now: Double = Date.now.timeIntervalSince1970 * 1000) throws -> [AnalysisSync.Item] {
        let metadata = try metadados(dono)
        return try metadata.keys.filter(AnalysisSync.syncedKey).sorted().compactMap { key in
            let row = metadata[key]!
            guard try metadata[AnalysisSync.hashKey(key)]?.string("value") != AnalysisSync.fingerprint(row, key: key) else { return nil }
            return AnalysisSync.Item(id: key, payload: try AnalysisSync.wirePayload(row, key: key), updated_at: floor(now))
        }
    }
    public func confirmarAnalises(_ batch: [AnalysisSync.Item], dono: String) throws {
        do {
            for item in batch where AnalysisSync.syncedKey(item.id) {
                try porMeta(ReadRow(fields: ["value": .string(try AnalysisSync.fingerprint(item.payload, key: item.id))]), nome: AnalysisSync.hashKey(item.id), dono: dono)
            }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func aplicarAnalises(_ page: AnalysisSync.Page, dono: String, since: Int64) throws {
        guard page.cursor >= since, !page.more || page.cursor > since else { throw ReadSync.Failure.invalidPage }
        do {
            var metadata = try metadados(dono)
            for item in page.rows where AnalysisSync.syncedKey(item.id) {
                let local = metadata[item.id], hashKey = AnalysisSync.hashKey(item.id)
                let remote = try AnalysisSync.nativePayload(item.payload, key: item.id)
                let remoteHash = try AnalysisSync.fingerprint(remote, key: item.id)
                if let local {
                    let mine = try AnalysisSync.fingerprint(local, key: item.id)
                    if mine != metadata[hashKey]?.string("value") && mine != remoteHash { continue }
                }
                let merged = AnalysisSync.mergePulled(remote, local: local)
                try porMeta(merged, nome: item.id, dono: dono)
                let hash = ReadRow(fields: ["value": .string(remoteHash)])
                try porMeta(hash, nome: hashKey, dono: dono)
                metadata[item.id] = merged; metadata[hashKey] = hash
            }
            try porMeta(ReadRow(fields: ["value": .number(Double(page.cursor))]), nome: AnalysisSync.cursorKey, dono: dono)
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
    public func guardarRevisao(_ row: ReadRow, routineID: String, dono: String) throws {
        do { try porMeta(row, nome: "review:\(routineID)", dono: dono); try contexto.save() }
        catch { contexto.rollback(); throw error }
    }
    public func guardarPropostaChat(_ proposal: ReadRow, id: String, routineID: String, dono: String, today: String) throws {
        let data = try ler(dono)
        let current = try AgentChat.context(data, consent: metadados(dono)["consent"], today: today)
        guard current.array("fichas").first(where: { $0.id == routineID }) == proposal.object("before") else { throw WorkoutAnalysis.Failure.conflict }
        let binding = try AgentChat.binding(data, routineID: routineID, today: today)
        do {
            try porMeta(ReadRow(fields: ["status": .string("proposed"), "proposal": .object(proposal.fields), "binding": .object(binding.fields)]), nome: "chat:\(id)", dono: dono)
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func limparChat(_ dono: String) throws {
        do {
            for entry in try contexto.fetch(FetchDescriptor<AnaliseLocal>(predicate: #Predicate { $0.dono == dono })) where entry.nome.hasPrefix("chat:") { contexto.delete(entry) }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
    }
    public func decidirChat(_ id: String, action: String, dono: String, catalog: [ReadRow], today: String) throws {
        let key = "chat:\(id)", data = try ler(dono)
        guard let saved = try metadados(dono)[key] else { throw WorkoutAnalysis.Failure.conflict }
        if action == "undo" {
            guard saved.string("status") == "saved", case .array(let before) = saved.fields["undoBefore"] else { throw WorkoutAnalysis.Failure.conflict }
            let after = saved.array("undoAfter")
            guard !after.isEmpty, after.count == before.count else { throw WorkoutAnalysis.Failure.conflict }
            var changes: [PushChange] = []
            for (i, entry) in after.enumerated() {
                let row = entry.object("row"), table = entry.string("table") ?? ""
                guard let current = data.tables[table]?.first(where: { $0.id == row.id }), stable(.object(current.fields)) == stable(.object(row.fields)) else { throw WorkoutAnalysis.Failure.conflict }
                let old: ReadRow
                if case .object(let fields) = before[i] { old = ReadRow(fields: fields) } else { old = row.changing(["deleted": .bool(true)]) }
                changes.append(PushChange(table, old))
            }
            try gravar(changes, dono: dono, metadata: [key: saved.changing(["status": .string("undone")])])
            return
        }
        guard saved.string("status") == "proposed" else { throw WorkoutAnalysis.Failure.conflict }
        if action == "refuse" {
            do { try porMeta(saved.changing(["status": .string("refused")]), nome: key, dono: dono); try contexto.save() }
            catch { contexto.rollback(); throw error }
            return
        }
        guard action == "apply" else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        let routineID = saved.object("proposal").object("before").id
        guard stable(.object(try AgentChat.binding(data, routineID: routineID, today: today).fields)) == stable(saved.fields["binding"] ?? .null) else { throw WorkoutAnalysis.Failure.conflict }
        let changes = try AgentChat.changes(saved.object("proposal"), binding: saved.object("binding"), catalog: catalog)
        guard !changes.isEmpty else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        let before = changes.map { c in data.tables[c.table]?.first { $0.id == c.row.id }.map { JSONValue.object($0.fields) } ?? .null }
        try gravar(changes, dono: dono, catalog: catalog, metadata: [key: saved.changing(["status": .string("saved"), "undoBefore": .array(before)])])
    }
    public func decidirRevisao(routineID: String, index: Int, action: String, dono: String, catalog: [ReadRow], today: String) throws {
        let data = try ler(dono), key = "review:\(routineID)"
        func content(_ row: ReadRow) -> JSONValue {
            var row = row; row.fields.removeValue(forKey: "updated_at"); return stable(.object(row.fields))
        }
        guard var saved = try metadados(dono)[key], saved.object("version") == RoutineReview.version(data, routineID: routineID) else { throw WorkoutAnalysis.Failure.conflict }
        var decisions = saved.array("decisions")
        guard decisions.indices.contains(index) else { throw WorkoutAnalysis.Failure.invalidAdjustment }
        var decision = decisions[index]
        var changes: [PushChange] = []
        if action == "undo" {
            guard decision.string("status") == "saved", case .array(let before) = decision.fields["undoBefore"] else { throw WorkoutAnalysis.Failure.conflict }
            let after = decision.array("undoAfter")
            guard !after.isEmpty, after.count == before.count else { throw WorkoutAnalysis.Failure.conflict }
            for (i, entry) in after.enumerated() {
                let row = entry.object("row"), table = entry.string("table") ?? ""
                guard let current = data.tables[table]?.first(where: { $0.id == row.id }), content(current) == content(row) else { throw WorkoutAnalysis.Failure.conflict }
                let old: ReadRow
                if case .object(let f) = before[i] { old = ReadRow(fields: f) } else { old = row.changing(["deleted": .bool(true)]) }
                changes.append(PushChange(table, old))
            }
            decision.fields["status"] = .string("undone")
        } else {
            guard decision.string("status") == "proposed" else { throw WorkoutAnalysis.Failure.conflict }
            if action == "refuse" { decision.fields["status"] = .string("refused") }
            else {
                guard action == "apply" else { throw WorkoutAnalysis.Failure.invalidAdjustment }
                var binding = try RoutineReview.binding(data, routineID: routineID, today: today)
                binding.fields["items"] = saved.object("binding").fields["items"]
                let adjustment = try RoutineReview.adjustment(saved, index: index)
                changes = try WorkoutAnalysis.changes(adjustment, binding: binding, catalog: catalog)
                changes = changes.filter { c in
                    guard let old = data.tables[c.table]?.first(where: { $0.id == c.row.id }) else { return true }
                    return content(old) != content(c.row)
                }
                guard !changes.isEmpty else { throw WorkoutAnalysis.Failure.invalidAdjustment }
                decision.fields["binding"] = .object(binding.fields)
                decision.fields["status"] = .string("saved")
                decision.fields["undoBefore"] = .array(changes.map { c in data.tables[c.table]?.first { $0.id == c.row.id }.map { .object($0.fields) } ?? .null })
            }
        }
        decisions[index] = decision; saved.fields["decisions"] = .array(decisions.map { .object($0.fields) })
        if changes.isEmpty { try guardarRevisao(saved, routineID: routineID, dono: dono) }
        else { saved.fields["reviewWrite"] = .number(Double(index)); try gravar(changes, dono: dono, catalog: catalog, metadata: [key: saved]) }
    }
    /// Same owner-scoped metadata as analyses, with the PWA consent payload unchanged.
    public func guardarConsentimento(_ row: ReadRow, dono: String) throws {
        do {
            try porMeta(row, nome: "consent", dono: dono)
            if row.object("saude").bool("granted") == false {
                for entry in try contexto.fetch(FetchDescriptor<AnaliseLocal>(predicate: #Predicate { $0.dono == dono })) where entry.nome.hasPrefix("chat:") { contexto.delete(entry) }
                var removed: Set<String> = []
                for entry in try contexto.fetch(FetchDescriptor<LinhaSync>(predicate: #Predicate { $0.dono == dono })) {
                    let value = try JSONDecoder().decode(ReadRow.self, from: entry.dados)
                    if entry.tabela == "body_logs" || entry.tabela == "pain_reports" || (entry.tabela == "day_overrides" && value.string("action") == "spare_joint") {
                        removed.insert(entry.chave); contexto.delete(entry)
                    } else if entry.tabela == "session_items" {
                        entry.dados = try JSONEncoder().encode(value.changing(["pain_joint": .null]))
                    } else if entry.tabela == "profiles" {
                        let onboarding = value.object("onboarding").changing(["spare_joints": .array([])])
                        entry.dados = try JSONEncoder().encode(value.changing(["onboarding": .object(onboarding.fields)]))
                    }
                }
                for entry in try saidas(dono) where removed.contains(entry.chave) || entry.tabela == "body_logs" || entry.tabela == "pain_reports" { contexto.delete(entry) }
            }
            try contexto.save()
        } catch { contexto.rollback(); throw error }
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
