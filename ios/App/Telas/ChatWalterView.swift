import AnilhaCore
import SwiftUI

struct ChatWalterView: View {
    let conta: ContaStore
    var demonstracao = false
    @State private var draft = ""
    @FocusState private var escrevendo: Bool
    private var busy: Bool { conta.chatStage != nil }
    private let respostas = ["Quero trocar um exercício", "Diminuir o descanso de uma ficha", "Onde vejo meu progresso?"]

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                    CabecalhoAnilha(titulo: "Waltér", selo: "Seu treino, com você no comando", icone: "bubble.left.and.text.bubble.right")
                    if !demonstracao { VStack(alignment: .leading, spacing: 8) {
                        Text("Converse sobre suas fichas").font(.headline)
                        Text("O Waltér recebe seu perfil de treino, fichas e volume semanal. Articulações a poupar só vão com sua permissão de saúde. As ferramentas rodam neste iPhone e nada muda sem Salvar.")
                        Text("Para gerar plano no iPhone, use Plano > Plano novo. Pedidos de plano pelo chat e criação de ficha ainda precisam do site.").foregroundStyle(Tema.tintaSuave)
                        Text("A conversa fica na memória deste aparelho até você limpar ou fechar o app. Usa o mesmo limite diário do site e das análises.").foregroundStyle(Tema.tintaSuave)
                    }.font(.footnote).padding(Tema.Espaco.e4).cartao() }
                    if conta.chatEntries.isEmpty {
                        ForEach(respostas, id: \.self) { resposta in
                            Button(resposta) { draft = resposta; escrevendo = true }
                                .buttonStyle(.glass).frame(minHeight: 44)
                        }
                    }
                    ForEach(conta.chatEntries) { entry in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(entry.string("role") == "user" ? "Você" : "Waltér")
                                .font(.caption.weight(.semibold)).foregroundStyle(Tema.marcaForte)
                            Text(entry.string("text") ?? "").textSelection(.enabled)
                            ForEach(entry.array("cards")) { card in proposta(card) }
                        }
                        .padding(Tema.Espaco.e4).frame(maxWidth: .infinity, alignment: .leading).cartao()
                    }
                    if let stage = conta.chatStage { HStack { ProgressView(); Text(stage).font(.subheadline) }.accessibilityElement(children: .combine) }
                    if !conta.online { Label("Sem internet. Conecte para enviar. Você pode revisar e salvar propostas já recebidas.", systemImage: "wifi.slash").font(.footnote).foregroundStyle(Tema.tintaSuave) }
                    if let error = conta.chatError { Text(error).font(.subheadline).foregroundStyle(Tema.perigo) }
                    if conta.chatFull { Text("Esta conversa chegou ao limite de tamanho. Limpe para começar outra.").font(.footnote) }
                    Color.clear.frame(height: 1).id("fim-chat")
                }.padding(Tema.Espaco.e5)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: conta.chatEntries.count) { _, _ in scroll.scrollTo("fim-chat", anchor: .bottom) }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    HStack {
                        Button { escrevendo = false; scroll.scrollTo("fim-chat", anchor: .bottom) } label: { Label("Última mensagem", systemImage: "arrow.down") }
                        Spacer()
                        if escrevendo { Button("Fechar teclado") { escrevendo = false } }
                    }.font(.caption).frame(minHeight: 30)
                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Escreva seu pedido", text: $draft, axis: .vertical)
                            .lineLimit(1...5).focused($escrevendo).padding(12)
                            .background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: Tema.Raio.lg))
                            .accessibilityLabel("Pedido para o Waltér")
                            .onChange(of: draft) { _, value in
                                if value.utf16.count > 2000 {
                                    var limited = String(value.prefix(2000))
                                    while limited.utf16.count > 2000 { limited.removeLast() }
                                    draft = limited
                                }
                            }
                        Button { enviar() } label: { Image(systemName: "arrow.up").frame(width: 24, height: 24) }
                            .buttonStyle(.principalAnilha).controlSize(.large).accessibilityLabel("Enviar pedido")
                            .disabled(busy || !conta.online || conta.chatFull || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }.padding(.horizontal, Tema.Espaco.e5).padding(.vertical, 10).background(.regularMaterial)
            }
        }
        .background { FundoAnilha() }
        .navigationTitle("Waltér").navigationBarTitleDisplayMode(.inline).semTituloNaBarra()
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button("Limpar") { conta.limparChat(); draft = "" }.disabled(busy || conta.chatEntries.isEmpty) }
        }
    }
    private func enviar() {
        let ask = draft
        escrevendo = false
        Task {
            let count = conta.chatEntries.count
            await conta.enviarChat(ask)
            if conta.chatEntries.count > count && draft == ask { draft = "" }
        }
    }
    @ViewBuilder private func proposta(_ card: ReadRow) -> some View {
        let saved = conta.analises["chat:\(card.id)"]
        let status = saved?.string("status") ?? "proposed"
        let unavailable = card.bool("unavailable") == true
        VStack(alignment: .leading, spacing: 12) {
            if card.string("kind") == "ficha" {
                Text(card.object("before").string("name") ?? "Proposta de ficha").font(.headline)
                ficha(card.object("before"), titulo: "Antes")
                ficha(card.object("after"), titulo: "Depois")
                ForEach(Array(card.array("volume").enumerated()), id: \.offset) { _, v in
                    Text("\(nomeVolume(v.string("group") ?? "")): \(numero(v.number("before"))) para \(numero(v.number("after"))) séries por semana").font(.footnote)
                }
                ForEach(Array(card.array("risks").enumerated()), id: \.offset) { _, r in
                    Text("\(r.string("text") ?? "") Fonte: \(r.string("source") ?? "")").font(.footnote).foregroundStyle(Tema.tintaSuave)
                }
                if unavailable { Text("Os dados mudaram ou a proposta não pôde ser guardada. Peça uma nova proposta.").font(.footnote) }
                else if status == "proposed" {
                    Button("Aplicar") { conta.decidirChat(card.id, action: "apply") }.buttonStyle(.principalAnilha).disabled(busy)
                    Button("Recusar") { conta.decidirChat(card.id, action: "refuse") }.buttonStyle(.glass).disabled(busy)
                } else if status == "saved" {
                    Text("Salvo neste iPhone").font(.subheadline.weight(.semibold))
                    Button("Desfazer") { conta.decidirChat(card.id, action: "undo") }.buttonStyle(.glass).disabled(busy)
                } else { Text(status == "undone" ? "Alteração desfeita" : "Proposta recusada").font(.footnote) }
            } else {
                Text(AgentChat.displayText(card.string("text") ?? AgentChat.siteNotice)).font(.subheadline)
                Text("As instruções acima se referem ao site. No iPhone, use as abas Hoje, Plano, Histórico e Você.").font(.footnote).foregroundStyle(Tema.tintaSuave)
                Link("Abrir no site", destination: Site.url(caminhoSite(card))).buttonStyle(.glass)
            }
        }.padding(Tema.Espaco.e4).background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: Tema.Raio.lg))
    }
    private func ficha(_ ficha: ReadRow, titulo: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titulo).font(.subheadline.weight(.semibold))
            ForEach(Array(ficha.array("items").enumerated()), id: \.offset) { index, item in
                let name = conta.catalogo.first { $0.id == item.string("exercise_id") }?.string("name") ?? "Exercício personalizado"
                Text("\(index + 1). \(name): \(numero(item.number("sets")))x\(numero(item.number("target_min")))-\(numero(item.number("target_max"))), descanso \(numero(item.number("rest_sec"))) s")
                    .font(.subheadline).fixedSize(horizontal: false, vertical: true)
            }
            if ficha.array("items").isEmpty { Text("Sem exercícios").font(.footnote) }
        }
    }
    private func numero(_ n: Double?) -> String { (n ?? 0).formatted(.number.precision(.fractionLength(0...2))) }
    private func caminhoSite(_ card: ReadRow) -> String {
        if let path = card.string("path") { return path }
        return ["perfil_treino": "/voce/treino", "ajustes": "/ajustes", "exercicio": "/exercicios", "historico": "/historico", "seus_dados": "/voce/dados", "privacidade": "/voce/privacidade", "amigos": "/amigos", "enviar_ficha": "/plano", "fichas_prontas": "/plano/fichas-prontas", "hoje_descanso": "/", "fale_conosco": "/mensagens"][card.string("place") ?? ""] ?? "/plano/pedir"
    }
    private func nomeVolume(_ group: String) -> String {
        ["costas": "Costas", "peito": "Peito", "ombros": "Ombros", "biceps": "Bíceps", "triceps": "Tríceps", "quadriceps": "Quadríceps", "posteriores": "Posteriores", "panturrilha": "Panturrilha", "core": "Abdômen"][group] ?? group
    }
}
