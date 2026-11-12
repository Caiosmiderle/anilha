import AnilhaCore
import SwiftUI

struct FichasView: View {
    let conta: ContaStore
    var body: some View {
        List {
            StatusSyncView(conta: conta).listRowBackground(Tema.fundo)
            if conta.dados.routines.isEmpty {
                Text("Nenhuma ficha ativa disponível. Crie suas fichas no PWA e puxe para atualizar.")
                    .foregroundStyle(Tema.tintaSuave)
            }
            ForEach(conta.dados.routines) { ficha in
                NavigationLink {
                    FichaView(conta: conta, ficha: ficha)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ficha.string("name") ?? "Ficha").font(.headline)
                        Text("\(conta.dados.items(ficha.id).count) exercícios")
                            .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                    }
                    .padding(.vertical, 6)
                }
                .listRowBackground(Tema.superficie)
            }
        }
        .scrollContentBackground(.hidden).background(Tema.fundo)
        .navigationTitle("Fichas").refreshable { await conta.atualizar() }
    }
}

struct FichaView: View {
    let conta: ContaStore
    let ficha: ReadRow
    private var atual: ReadRow? { conta.dados.routines.first { $0.id == ficha.id } }
    private var exercicios: [String: ReadRow] { conta.dados.exercises(catalog: conta.catalogo) }

    var body: some View {
        let cargas = conta.dados.lastLoads
        let catalogo = exercicios
        List {
            if atual == nil {
                Text("Esta ficha foi arquivada ou removida.")
            } else {
                Section("Exercícios") {
                    if conta.dados.items(ficha.id).isEmpty { Text("Esta ficha ainda não tem exercícios.") }
                    ForEach(conta.dados.items(ficha.id)) { item in
                        let exerciseID = item.string("exercise_id") ?? ""
                        let exercise = catalogo[exerciseID]
                        VStack(alignment: .leading, spacing: 6) {
                            Text(exercise?.string("name") ?? "Exercício indisponível").font(.headline)
                            Text(prescricao(item, medida: exercise?.string("measure")))
                                .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                            if let last = cargas[exerciseID] {
                                let lb = conta.dados.active("profiles").first?.string("unit") == "lb"
                                let load = lb ? last.kg * 2.20462262185 : last.kg
                                Text("Última carga: \(load.formatted(.number.precision(.fractionLength(0...2)))) \(lb ? "lb" : "kg") em \(last.date)")
                                    .font(.subheadline).monospacedDigit().foregroundStyle(Tema.marcaForte)
                            } else {
                                Text("Sem carga anterior registrada").font(.footnote).foregroundStyle(Tema.tintaSuave)
                            }
                        }
                        .padding(.vertical, 8).accessibilityElement(children: .combine)
                        .listRowBackground(Tema.superficie)
                    }
                }
                Button(conta.ativa == nil ? "Começar treino" : "Continuar treino") { if let atual { conta.comecar(atual) } }
                    .buttonStyle(.borderedProminent).listRowBackground(Tema.fundo)
                if let erro = conta.erro { Text(erro).foregroundStyle(.red) }
            }
        }
        .scrollContentBackground(.hidden).background(Tema.fundo)
        .navigationTitle(atual?.string("name") ?? "Ficha")
        .refreshable { await conta.atualizar() }
    }
    private func prescricao(_ item: ReadRow, medida: String?) -> String {
        let sets = Int(item.number("sets") ?? 0)
        let min = Int(item.number("target_min") ?? 0), max = Int(item.number("target_max") ?? 0)
        return "\(sets) séries de \(min) a \(max) \(medida == "time" ? "segundos" : "repetições")"
    }
}
