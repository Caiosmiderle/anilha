import AnilhaCore
import SwiftUI

struct FichasView: View {
    let conta: ContaStore
    @State private var criando = false
    var body: some View {
        let exercicios = conta.dados.exercises(catalog: conta.catalogo)
        List {
            CabecalhoAnilha(titulo: "Fichas", selo: "Seu treino", icone: "list.bullet.rectangle")
                .listRowBackground(Color.clear).listRowSeparator(.hidden).entradaAnilha(0)
            StatusSyncView(conta: conta).listRowBackground(Color.clear)
            if conta.dados.routines.isEmpty {
                Text("Nenhuma ficha ativa disponível. Toque em Nova ficha para criar seu treino.")
                    .foregroundStyle(Tema.tintaSuave)
            }
            ForEach(conta.dados.routines) { ficha in
                NavigationLink {
                    FichaView(conta: conta, ficha: ficha)
                } label: {
                    HStack(spacing: 12) {
                        DiscoExercicio(grupo: conta.dados.items(ficha.id).first.flatMap { exercicios[$0.string("exercise_id") ?? ""]?.string("primary_group") })
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ficha.string("name") ?? "Ficha").font(.headline)
                            Text("\(conta.dados.items(ficha.id).count) exercícios")
                                .font(.subheadline).foregroundStyle(Tema.tintaSuave)
                        }
                    }
                    .padding(.vertical, 10).frame(minHeight: 44)
                }
                .listRowBackground(Tema.superficie).entradaAnilha(1)
            }
        }
        .scrollContentBackground(.hidden).background { FundoAnilha() }
        .navigationTitle("Fichas").navigationBarTitleDisplayMode(.inline).refreshable { await conta.atualizar() }
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Nova ficha", systemImage: "plus") { criando = true } } }
        .sheet(isPresented: $criando) { NavigationStack { EditarFichaView(conta: conta) } }
    }
}

struct FichaView: View {
    let conta: ContaStore
    let ficha: ReadRow
    @State private var editando = false
    private var atual: ReadRow? { conta.dados.routines.first { $0.id == ficha.id } }
    private var exercicios: [String: ReadRow] { conta.dados.exercises(catalog: conta.catalogo) }

    var body: some View {
        let cargas = conta.dados.lastLoads
        let catalogo = exercicios
        List {
            if atual == nil {
                Text("Esta ficha foi arquivada ou removida.")
            } else {
                CabecalhoAnilha(titulo: atual?.string("name") ?? "Ficha",
                                selo: "\(conta.dados.items(ficha.id).count) exercícios", icone: "dumbbell")
                    .listRowBackground(Color.clear).listRowSeparator(.hidden).entradaAnilha(0)
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
                    .buttonStyle(.principalAnilha).tint(Tema.acao).controlSize(.large).frame(minHeight: 44).listRowBackground(Tema.fundo)
                if conta.admin { CartaoRevisaoFicha(conta: conta, routineID: ficha.id) }
                if let erro = conta.erro { Text(erro).foregroundStyle(.red) }
            }
        }
        .scrollContentBackground(.hidden).background { FundoAnilha() }
        .navigationTitle("Ficha").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Editar") { editando = true }.disabled(atual == nil) } }
        .sheet(isPresented: $editando) { if let atual { NavigationStack { EditarFichaView(conta: conta, ficha: atual) } } }
        .task { await conta.conferirAdmin() }
        .refreshable { await conta.atualizar() }
    }
    private func prescricao(_ item: ReadRow, medida: String?) -> String {
        let sets = Int(item.number("sets") ?? 0)
        let min = Int(item.number("target_min") ?? 0), max = Int(item.number("target_max") ?? 0)
        return "\(sets) séries de \(min) a \(max) \(medida == "time" ? "segundos" : "repetições")"
    }
}
