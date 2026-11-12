import AnilhaCore
import SwiftUI

struct HistoryEntry: Identifiable {
    let id: String
    let date: String
    let order: Double
    let title: String
    let detail: String
    let corrida: Bool
    let concluido: Bool
    static func entries(_ data: ReadData) -> [HistoryEntry] {
        let sessions = data.active("sessions").map { row in
            HistoryEntry(id: "session:\(row.id)", date: row.string("local_date") ?? "",
                order: row.number("started_at") ?? 0,
                title: row.string("title") ?? nomeSplit(row.string("split_key")),
                detail: row.string("status") == "done" ? "Treino concluído" : "Treino em andamento",
                corrida: false, concluido: row.string("status") == "done")
        }
        let runs = data.active("runs").map { row in
            let activity = row.string("activity") ?? "corrida"
            let title = activity == "corrida" ? "Corrida \(nomeCorrida(row.string("run_type")))" : activity.capitalized
            let source = row.string("source") == "crunning" ? " · do CRUNNING" : ""
            return HistoryEntry(id: "run:\(row.id)", date: row.string("local_date") ?? "",
                order: row.number("started_at") ?? 0, title: title,
                detail: detalheCorrida(row) + source, corrida: true, concluido: true)
        }
        return (sessions + runs).sorted {
            if $0.date != $1.date { return $0.date > $1.date }
            return $0.order == $1.order ? $0.id > $1.id : $0.order > $1.order
        }
    }
}

struct HistoricoView: View {
    let conta: ContaStore
    private var entries: [HistoryEntry] { Array(HistoryEntry.entries(conta.dados).prefix(20)) }
    var body: some View {
        List {
            CabecalhoAnilha(titulo: "Histórico", selo: "Seus registros", icone: "clock")
                .listRowBackground(Color.clear).listRowSeparator(.hidden).entradaAnilha(0)
            StatusSyncView(conta: conta).listRowBackground(Tema.fundo)
            if entries.isEmpty { Text("Nenhum treino baixado ainda.").foregroundStyle(Tema.tintaSuave) }
            ForEach(entries) { entry in
                if entry.corrida { HistoricoLinha(entry: entry).listRowBackground(Tema.superficie) }
                else {
                    Button { conta.sessaoAberta = String(entry.id.dropFirst("session:".count)) } label: { HistoricoLinha(entry: entry) }
                        .buttonStyle(.plain).listRowBackground(Tema.superficie)
                }
            }
        }
        .scrollContentBackground(.hidden).background { FundoAnilha() }
        .navigationTitle("Histórico").navigationBarTitleDisplayMode(.inline).refreshable { await conta.atualizar() }
    }
}

struct HistoricoLinha: View {
    let entry: HistoryEntry
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            DiscoExercicio(icone: entry.corrida ? "figure.run" : "dumbbell")
            VStack(alignment: .leading, spacing: 5) {
                Text(entry.title).font(.headline)
                Text(entry.date).font(.subheadline).monospacedDigit().foregroundStyle(Tema.tintaSuave)
                Text(entry.detail).font(.subheadline).foregroundStyle(Tema.tintaSuave)
            }
        }
        .padding(.vertical, 10).frame(minHeight: 44).accessibilityElement(children: .combine)
    }
}
