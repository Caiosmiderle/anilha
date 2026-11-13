import AnilhaCore
import SwiftUI

/// Perfil de treino: as respostas que montaram o plano e o modo retorno, que muda na hora sem
/// trocar o plano (igual ao site). Plano novo usa o mesmo gerador TypeScript offline.
struct PerfilTreinoView: View {
    let conta: ContaStore
    let today: String
    @State private var erro: String?

    private var perfil: ReadRow? { conta.dados.active("profiles").first }
    private var respostas: [String: JSONValue] {
        if case .object(let o) = perfil?.fields["onboarding"] { return o }
        return [:]
    }

    private static let objetivos = ["hipertrofia": "Ganhar massa", "emagrecimento": "Emagrecer", "condicionamento": "Condicionamento",
                                    "saude": "Saúde geral", "forca": "Ficar mais forte", "corrida": "Correr provas"]
    private static let niveis = ["iniciante": "Iniciante", "intermediario": "Intermediário", "avancado": "Avançado"]
    private static let divisoes = ["grupos": "Por grupo muscular", "superior_inferior": "Superior e inferior", "corpo_inteiro": "Corpo inteiro"]
    private static let idades = ["18-29": "18 a 29", "30-39": "30 a 39", "40-49": "40 a 49", "50-59": "50 a 59", "60+": "60 ou mais"]
    private static let focos = ["equilibrado": "Corpo todo por igual", "pernas": "Pernas", "costas_ombros": "Costas e ombros",
                                "peito_bracos": "Peito e braços", "abdomen": "Abdômen"]

    var body: some View {
        List {
            CabecalhoAnilha(titulo: "Perfil de treino", selo: "Suas respostas", icone: "figure.strengthtraining.traditional")
                .listRowBackground(Color.clear).listRowSeparator(.hidden)
            if perfil == nil {
                Text("Seu perfil ainda não chegou neste iPhone. Puxe para atualizar.").foregroundStyle(Tema.tintaSuave)
            } else {
                Section("Respostas do plano") {
                    linha("Objetivo", texto("goal", Self.objetivos))
                    linha("Nível", texto("level", Self.niveis))
                    linha("Dias de academia", numero("gym_days").map { "\($0) por semana" })
                    linha("Dias de corrida", numero("run_days").map { "\($0) por semana" })
                    linha("Tempo por treino", numero("minutes").map { "\($0) min" })
                    linha("Divisão", texto("split_style", Self.divisoes))
                    linha("Foco", foco)
                    linha("Faixa de idade", texto("age_range", Self.idades))
                    linha("Horário", texto("time", [:]))
                }
                Section {
                    Picker("Modo retorno", selection: Binding(get: { perfil?.string("return_mode") ?? "auto" }, set: { mudarRetorno($0) })) {
                        Text("Automático").tag("auto")
                        Text("Ligado").tag("on")
                        Text("Desligado").tag("off")
                    }
                    .pickerStyle(.segmented)
                    if let erro { Text(erro).foregroundStyle(Tema.perigo) }
                } header: {
                    Text("Modo retorno")
                } footer: {
                    Text("Depois de mais de 3 semanas sem treino, liga sozinho e dura 4 semanas: até 10 séries por grupo na semana e 2 a 3 repetições na reserva. Muda na hora, sem trocar o plano.")
                }
                Section {
                    NavigationLink { PlanoNovoView(conta: conta, today: today, soRespostas: true) } label: {
                        Label("Editar respostas", systemImage: "pencil")
                    }
                    NavigationLink { PlanoNovoView(conta: conta, today: today) } label: {
                        Label("Plano novo", systemImage: "arrow.triangle.2.circlepath")
                    }
                } footer: {
                    Text("Editar respostas guarda o perfil e mantém o plano. Plano novo mostra a prévia antes de trocar as fichas do plano.")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { FundoAnilha() }
        .navigationTitle("Perfil de treino").navigationBarTitleDisplayMode(.inline).semTituloNaBarra()
        .refreshable { await conta.atualizar() }
    }

    private var foco: String? {
        switch respostas["focus"] {
        case .string(let s): return Self.focos[s] ?? s
        case .array(let a):
            var nomes: [String] = []
            for valor in a { if case .string(let s) = valor { nomes.append(Self.focos[s] ?? s) } }
            return nomes.isEmpty ? nil : nomes.joined(separator: ", ")
        default: return "Corpo todo por igual"
        }
    }

    private func texto(_ chave: String, _ nomes: [String: String]) -> String? {
        if case .string(let s) = respostas[chave] { return nomes[s] ?? s }
        return nil
    }
    private func numero(_ chave: String) -> Int? {
        if case .number(let n) = respostas[chave] { return Int(n) }
        return nil
    }
    private func linha(_ titulo: String, _ valor: String?) -> some View {
        LabeledContent(titulo, value: valor ?? "Não informado")
    }

    /// Mesmo efeito do site: grava o perfil e marca o começo quando liga à mão.
    private func mudarRetorno(_ modo: String) {
        guard let perfil, perfil.string("return_mode") != modo else { return }
        var campos: [String: JSONValue] = ["return_mode": .string(modo)]
        if modo == "on", perfil.string("return_started_on") == nil { campos["return_started_on"] = .string(today) }
        erro = conta.gravar([PushChange("profiles", perfil.changing(campos))]) ? nil : "Não foi possível salvar. Tente de novo."
    }
}
