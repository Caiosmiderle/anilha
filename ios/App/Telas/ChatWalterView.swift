import AnilhaCore
import SwiftUI

/// Conversa com o Waltér no formato do site: balões, sugestões que já enviam e
/// propostas para revisar antes de salvar. Abre por cima de qualquer aba.
struct ChatWalterView: View {
    let conta: ContaStore
    var demonstracao = false
    var fechar: (() -> Void)? = nil
    @State private var draft = ""
    @FocusState private var escrevendo: Bool
    private var busy: Bool { conta.chatStage != nil }
    private let respostas = ["Quero trocar um exercício", "Diminuir o descanso de uma ficha", "Onde vejo meu progresso?"]

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                    if conta.chatEntries.isEmpty {
                        Text("Seu parceiro de treino. O que você quer mudar? Revise a proposta antes de salvar.")
                            .font(.body).foregroundStyle(Tema.tinta)
                        if !demonstracao {
                            Text("O Waltér recebe seu perfil de treino, fichas e volume semanal. Articulações a poupar só vão com sua permissão de saúde. Nada muda sem Salvar. Plano novo fica em Plano > Plano novo; criar ficha ainda é pelo site. A conversa fica neste aparelho até você limpar ou fechar o app, com o mesmo limite diário do site.")
                                .font(.footnote).foregroundStyle(Tema.tintaSuave)
                        }
                        if !busy {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(respostas, id: \.self) { resposta in
                                    Button { enviar(resposta) } label: {
                                        Text(resposta).font(.subheadline.weight(.medium)).foregroundStyle(Tema.tinta)
                                            .padding(.horizontal, 14).frame(minHeight: 44)
                                            .background(Tema.superficie, in: Capsule())
                                            .overlay(Capsule().stroke(Tema.linha))
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(!conta.online || conta.chatFull)
                                }
                            }.accessibilityElement(children: .contain).accessibilityLabel("Sugestões de pedido")
                        }
                    } else {
                        HStack {
                            Button("Nova conversa") { conta.limparChat(); draft = "" }.disabled(busy)
                            Text("O que você salvou continua no plano.").foregroundStyle(Tema.tintaSuave)
                        }.font(.footnote)
                    }
                    ForEach(conta.chatEntries) { entry in mensagem(entry) }
                    if let stage = conta.chatStage {
                        HStack(spacing: 8) {
                            Image(systemName: "ellipsis").font(.title3.weight(.bold)).foregroundStyle(Tema.marca)
                                .symbolEffect(.variableColor.iterative, options: .repeating)
                            Text(stage).font(.subheadline).foregroundStyle(Tema.tintaSuave)
                        }
                        .padding(.vertical, 10).padding(.horizontal, 16)
                        .background(Tema.superficie, in: Self.balao(minha: false))
                        .overlay { Self.balao(minha: false).stroke(Tema.linha) }
                        .accessibilityElement(children: .combine)
                    }
                    if !conta.online { Label("Sem internet. Conecte para enviar. Você pode revisar e salvar propostas já recebidas.", systemImage: "wifi.slash").font(.footnote).foregroundStyle(Tema.tintaSuave) }
                    if let error = conta.chatError { Text(error).font(.subheadline).foregroundStyle(Tema.perigo) }
                    if conta.chatFull { Text("Esta conversa chegou ao limite de tamanho. Toque em Nova conversa para começar outra.").font(.footnote) }
                    Color.clear.frame(height: 1).id("fim-chat")
                }.padding(Tema.Espaco.e5)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: conta.chatEntries.count) { _, _ in withAnimation { scroll.scrollTo("fim-chat", anchor: .bottom) } }
            .onChange(of: conta.chatStage) { _, _ in withAnimation { scroll.scrollTo("fim-chat", anchor: .bottom) } }
            .onAppear { scroll.scrollTo("fim-chat", anchor: .bottom) }
            .safeAreaInset(edge: .bottom) {
                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Escreva seu pedido", text: $draft, axis: .vertical)
                        .lineLimit(1...5).focused($escrevendo).padding(.horizontal, 16).padding(.vertical, 12)
                        .background(Tema.superficie, in: RoundedRectangle(cornerRadius: 22))
                        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Tema.linha))
                        .accessibilityLabel("Pedido para o Waltér")
                        .onChange(of: draft) { _, value in
                            if value.utf16.count > 2000 {
                                var limited = String(value.prefix(2000))
                                while limited.utf16.count > 2000 { limited.removeLast() }
                                draft = limited
                            }
                        }
                    Button { enviar() } label: {
                        Image(systemName: "arrow.up").font(.headline).foregroundStyle(Tema.sobreMarca)
                            .frame(width: 44, height: 44).background(Tema.acao, in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel("Enviar pedido")
                    .disabled(podeEnviar == false)
                    .opacity(podeEnviar ? 1 : 0.45)
                }
                .padding(.horizontal, Tema.Espaco.e4).padding(.vertical, 10).background(.regularMaterial)
            }
        }
        .background { FundoAnilha() }
        .navigationTitle("Waltér").navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            if let fechar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { escrevendo = false; fechar() } label: { Image(systemName: "chevron.down") }
                        .accessibilityLabel("Minimizar conversa com Waltér")
                }
            }
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    Text("Waltér").font(.headline)
                    Text("Beta").font(.caption2.weight(.semibold)).foregroundStyle(Tema.violeta)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(Tema.violeta.opacity(0.14), in: Capsule())
                }.accessibilityElement(children: .combine)
            }
        }
    }
    private var podeEnviar: Bool {
        !busy && conta.online && !conta.chatFull && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    static func balao(minha: Bool) -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: minha ? 18 : 4,
                               bottomTrailingRadius: minha ? 4 : 18, topTrailingRadius: 18)
    }
    @ViewBuilder private func mensagem(_ entry: ReadRow) -> some View {
        let minha = entry.string("role") == "user"
        let texto = entry.string("text") ?? ""
        VStack(alignment: minha ? .trailing : .leading, spacing: 8) {
            if !texto.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    if !minha { Text("Waltér").font(.caption.weight(.medium)).foregroundStyle(Tema.tintaSuave) }
                    Text(texto).textSelection(.enabled).foregroundStyle(Tema.tinta)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 12).padding(.horizontal, 16)
                .background(minha ? Tema.marcaFundo : Tema.superficie, in: Self.balao(minha: minha))
                .overlay { if !minha { Self.balao(minha: false).stroke(Tema.linha) } }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(minha ? "Você: \(texto)" : "Waltér: \(texto)")
            }
            ForEach(entry.array("cards")) { card in proposta(card) }
        }
        .frame(maxWidth: .infinity, alignment: minha ? .trailing : .leading)
        .padding(minha ? .leading : .trailing, minha ? 48 : 16)
    }
    private func enviar(_ texto: String? = nil) {
        let ask = texto ?? draft
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
