import AnilhaCore
import SwiftUI

/// Mesa de cartas do descanso: blackjack ou poker de uma troca, com fichas fictícias. A mesa
/// fica salva no aparelho a cada jogada; quando o descanso acaba ela só fecha, e o próximo
/// descanso reabre a mesma mão. Registrar a série nunca depende do jogo.
struct BaralhoDescanso: View {
    @Binding var jogos: RestGameState
    @Binding var preferido: String
    @State private var loja = MesaDescansoStore.shared
    /// Cartas já na mesa quando ela abriu: essas aparecem sem animação de distribuir.
    @State private var jaNaMesa: Set<String> = []
    @State private var historicoAberto = false

    private var mesa: MesaDescanso { loja.mesa }
    private var jogo: RestCardGame { jogos.game ?? RestCardGame(rawValue: preferido) ?? .blackjack }
    private var agora: Double { Date.now.timeIntervalSince1970 * 1000 }

    var body: some View {
        GeometryReader { geo in
            let largura = geo.size.width
            VStack(spacing: 0) {
                cabecalho
                ScrollView {
                    VStack(spacing: 18) {
                        seletor
                        if jogo == .blackjack { blackjack(largura: largura) } else { poker(largura: largura) }
                        historicoCurto
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
            }
        }
        .background { FeltroMesa().ignoresSafeArea() }
        .foregroundStyle(FeltroMesa.texto)
        .onAppear { jaNaMesa = Set(cartasNaMesa) }
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.6), trigger: cartasNaMesa.count)
        .sensoryFeedback(trigger: saldoAtual) { _, novo in
            guard let novo else { return nil }
            return novo > 0 ? .success : novo < 0 ? .error : .impact(weight: .light)
        }
        .sheet(isPresented: $historicoAberto) { HistoricoMesa(historico: mesa.historico) }
    }

    // MARK: Topo

    private var cabecalho: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let now = context.date.timeIntervalSince1970 * 1000
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Descanso").font(.caption.weight(.semibold)).foregroundStyle(FeltroMesa.textoSuave)
                    Text(relogioTreino(Double(jogos.remaining(now: now))))
                        .font(.title.bold()).monospacedDigit().contentTransition(.numericText())
                        .accessibilityLabel("Descanso, \(jogos.remaining(now: now)) segundos")
                }
                Spacer()
                HStack(spacing: 6) {
                    FichaView(valor: nil, tamanho: 22)
                    Text("\(mesa.fichas)").font(.title3.bold()).monospacedDigit()
                        .contentTransition(.numericText(value: Double(mesa.fichas)))
                        .animation(.snappy, value: mesa.fichas)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(.black.opacity(0.22), in: Capsule())
                .accessibilityElement(children: .ignore).accessibilityLabel("\(mesa.fichas) fichas")
                Button { jogos.close() } label: {
                    Image(systemName: "xmark").font(.headline).frame(width: 44, height: 44)
                }
                .buttonStyle(.glass)
                .accessibilityLabel("Voltar ao treino")
            }
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 8)
            .onChange(of: context.date, initial: true) { _, _ in
                jogos.update(startedAt: jogos.startedAt, end: jogos.deadline, now: now)
            }
        }
    }

    private var seletor: some View {
        Picker("Jogo", selection: Binding(get: { jogo.rawValue }, set: { valor in
            preferido = valor
            if let novo = RestCardGame(rawValue: valor) { jogos.show(novo) }
        })) {
            ForEach(RestCardGame.allCases, id: \.self) { Text($0.rawValue).tag($0.rawValue) }
        }
        .pickerStyle(.segmented)
        .accessibilityHint("Cada jogo guarda a própria mão")
    }

    // MARK: Blackjack

    @ViewBuilder
    private func blackjack(largura: CGFloat) -> some View {
        let carta = min(84, (largura - 32) / 4.4)
        let mao = mesa.blackjack
        VStack(spacing: 14) {
            Text("BLACKJACK PAGA 3 PARA 2 · BANCA PARA EM 17")
                .font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(FeltroMesa.textoSuave)
                .multilineTextAlignment(.center)
            ladoMesa(titulo: "Banca", total: mao.map { totalBanca($0) }, cartas: mao?.dealer ?? [],
                     ocultar: mao?.result == nil ? 1 : nil, largura: carta)
            if let mao, let resultado = mao.result {
                BannerResultado(titulo: tituloResultado(mao, resultado), saldo: mesa.saldoBlackjack ?? 0)
            } else {
                MonteAposta(valor: mao == nil ? mesa.aposta : mesa.apostaBlackjack)
            }
            ladoMesa(titulo: "Você", total: mao.map { "\(BlackjackScore($0.player).total)" }, cartas: mao?.player ?? [],
                     ocultar: nil, largura: carta)
            if mesa.emAndamento(.blackjack) {
                HStack(spacing: 10) {
                    acao("Pedir", "plus") { jogar { loja.mesa.pedir(agora: agora) } }
                    acao("Parar", "hand.raised") { jogar { loja.mesa.parar(agora: agora) } }
                    if mesa.podeDobrar { acao("Dobrar", "multiply") { jogar { loja.mesa.dobrar(agora: agora) } } }
                }
            } else {
                barraAposta(.blackjack)
            }
        }
    }

    private func totalBanca(_ mao: BlackjackHand) -> String {
        mao.result == nil ? "\(BlackjackScore(Array(mao.dealer.prefix(1))).total)+" : "\(BlackjackScore(mao.dealer).total)"
    }

    private func tituloResultado(_ mao: BlackjackHand, _ resultado: BlackjackResult) -> String {
        let voce = BlackjackScore(mao.player), banca = BlackjackScore(mao.dealer)
        switch resultado {
        case .win: return voce.natural ? "Blackjack!" : banca.total > 21 ? "A banca estourou" : "Você ganhou"
        case .loss: return voce.total > 21 ? "Você estourou" : banca.natural ? "Blackjack da banca" : "A banca ganhou"
        case .tie: return "Empate"
        }
    }

    private func ladoMesa(titulo: String, total: String?, cartas: [PlayingCard], ocultar: Int?, largura: CGFloat) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Text(titulo.uppercased()).font(.caption.weight(.bold)).tracking(1)
                if let total {
                    Text(total).font(.caption.weight(.bold)).monospacedDigit()
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(.black.opacity(0.3), in: Capsule())
                }
            }
            .foregroundStyle(FeltroMesa.textoSuave)
            .accessibilityElement(children: .combine)
            ZStack {
                if cartas.isEmpty {
                    RoundedRectangle(cornerRadius: 10).strokeBorder(FeltroMesa.textoSuave.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [5, 5]))
                        .frame(width: largura, height: largura / 0.7)
                        .accessibilityHidden(true)
                }
                HStack(spacing: -largura * 0.42) {
                    ForEach(Array(cartas.enumerated()), id: \.element.id) { indice, carta in
                        CartaView(carta: carta, oculta: ocultar == indice, ordem: indice,
                                  animar: !jaNaMesa.contains(chave(carta)), largura: largura)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: largura / 0.7)
        }
    }

    // MARK: Poker

    @ViewBuilder
    private func poker(largura: CGFloat) -> some View {
        let carta = (largura - 32 - 4 * 6) / 5
        let mao = mesa.poker
        VStack(spacing: 14) {
            TabelaPoker(destaque: mao?.result)
            HStack(spacing: 6) {
                if let mao {
                    ForEach(Array(mao.cards.enumerated()), id: \.element.id) { indice, c in
                        let segura = mao.held.contains(indice)
                        Button { jogar { loja.mesa.segurar(indice) } } label: {
                            VStack(spacing: 6) {
                                Text("SEGURAR").font(.system(size: 9, weight: .heavy)).tracking(0.5)
                                    .padding(.horizontal, 5).padding(.vertical, 3)
                                    .background(FeltroMesa.dourado, in: Capsule())
                                    .foregroundStyle(.black)
                                    .opacity(segura ? 1 : 0)
                                CartaView(carta: c, oculta: false, ordem: indice,
                                          animar: !jaNaMesa.contains(chave(c)), largura: carta)
                                    .offset(y: segura ? -6 : 0)
                                    .animation(.snappy, value: segura)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(mao.result != nil)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(c.spoken)
                        .accessibilityValue(mao.result != nil ? "" : segura ? "Segurada" : "Para trocar")
                        .accessibilityHint(mao.result == nil ? "Toque para segurar ou soltar" : "")
                        .accessibilityAddTraits(segura ? .isSelected : [])
                    }
                } else {
                    ForEach(0..<5, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 8).strokeBorder(FeltroMesa.textoSuave.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [5, 5]))
                            .frame(width: carta, height: carta / 0.7).padding(.top, 21)
                    }
                    .accessibilityHidden(true)
                }
            }
            if let mao, let resultado = mao.result {
                BannerResultado(titulo: resultado.name, saldo: mesa.saldoPoker ?? 0)
                barraAposta(.poker)
            } else if mesa.emAndamento(.poker) {
                Text("Toque nas cartas que quer manter. Uma troca por mão.")
                    .font(.footnote).foregroundStyle(FeltroMesa.textoSuave).multilineTextAlignment(.center)
                MonteAposta(valor: mesa.apostaPoker)
                Button { jogar { loja.mesa.trocar(agora: agora) } } label: {
                    Label("Trocar", systemImage: "arrow.triangle.2.circlepath").frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.principalAnilha).controlSize(.large)
            } else {
                barraAposta(.poker)
            }
        }
    }

    // MARK: Aposta

    private func barraAposta(_ jogo: RestCardGame) -> some View {
        VStack(spacing: 12) {
            if mesa.precisaRecarregar {
                Text("As fichas acabaram. Elas são de mentira: recarregue e siga jogando.")
                    .font(.footnote).multilineTextAlignment(.center).foregroundStyle(FeltroMesa.textoSuave)
                Button { jogar { loja.mesa.recarregar(agora: agora) } } label: {
                    Label("Recarregar \(MesaDescanso.fichasIniciais) fichas", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.principalAnilha).controlSize(.large)
            } else {
                HStack(spacing: 10) {
                    ForEach(MesaDescanso.valoresFicha, id: \.self) { valor in
                        Button { loja.mesa.somarFicha(valor) } label: { FichaView(valor: valor, tamanho: 46) }
                            .buttonStyle(.plain)
                            .disabled(mesa.aposta + valor > mesa.fichas)
                            .opacity(mesa.aposta + valor > mesa.fichas ? 0.4 : 1)
                            .accessibilityLabel("Somar \(valor) à aposta")
                    }
                    Button("Limpar") { loja.mesa.limparAposta() }
                        .font(.footnote.weight(.semibold)).frame(minWidth: 44, minHeight: 44)
                        .foregroundStyle(FeltroMesa.texto)
                }
                Button { distribuir(jogo) } label: {
                    Text("Distribuir · aposta \(mesa.aposta)").frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.principalAnilha).controlSize(.large)
                .disabled(!mesa.podeDistribuir)
            }
        }
    }

    private func acao(_ titulo: String, _ icone: String, _ fazer: @escaping () -> Void) -> some View {
        Button(action: fazer) {
            Label(titulo, systemImage: icone).frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.glass).controlSize(.large).font(.headline)
    }

    // MARK: Histórico

    @ViewBuilder
    private var historicoCurto: some View {
        if !mesa.historico.isEmpty {
            Button { historicoAberto = true } label: {
                HStack(spacing: 8) {
                    Text("Últimas").font(.caption.weight(.semibold)).foregroundStyle(FeltroMesa.textoSuave)
                    ForEach(Array(mesa.historico.prefix(5).enumerated()), id: \.offset) { _, rodada in
                        Text(rodada.saldo > 0 ? "+\(rodada.saldo)" : "\(rodada.saldo)")
                            .font(.caption.weight(.bold)).monospacedDigit()
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background((rodada.saldo > 0 ? FeltroMesa.ganho : rodada.saldo < 0 ? FeltroMesa.perda : Color.white.opacity(0.2)).opacity(0.85), in: Capsule())
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Histórico de rodadas")
        }
    }

    // MARK: Ações

    private var cartasNaMesa: [String] {
        let bj = (mesa.blackjack?.player ?? []) + (mesa.blackjack?.dealer ?? [])
        return bj.map { "b\($0.id)" } + (mesa.poker?.cards ?? []).map { "p\($0.id)" }
    }
    private func chave(_ carta: PlayingCard) -> String { (jogo == .blackjack ? "b" : "p") + "\(carta.id)" }
    private var saldoAtual: Int? { jogo == .blackjack ? mesa.saldoBlackjack : mesa.saldoPoker }

    /// Jogada só conta dentro do descanso; depois do prazo a mesa fecha e a mão fica salva.
    private func jogar(_ fazer: () -> Void) {
        guard jogos.allow(agora) else { return }
        fazer()
    }
    private func distribuir(_ jogo: RestCardGame) {
        jogar {
            var gerador = SystemRandomNumberGenerator()
            loja.mesa.distribuir(jogo, deck: CardDeck(using: &gerador), agora: agora)
        }
    }
}

// MARK: - Peças da mesa

/// Feltro verde com vinheta e trama fina. A mesa é sempre verde, no claro e no escuro.
struct FeltroMesa: View {
    static let texto = Color(red: 0.96, green: 0.95, blue: 0.9)
    static let textoSuave = Color(red: 0.8, green: 0.88, blue: 0.82)
    static let dourado = Color(red: 0.95, green: 0.78, blue: 0.36)
    static let ganho = Color(red: 0.2, green: 0.62, blue: 0.36)
    static let perda = Color(red: 0.72, green: 0.2, blue: 0.2)

    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(red: 0.13, green: 0.45, blue: 0.29), Color(red: 0.05, green: 0.24, blue: 0.15)],
                           center: .center, startRadius: 40, endRadius: 520)
            Canvas { ctx, size in
                // Trama do tecido: pontos regulares, quase invisíveis.
                var y: CGFloat = 0
                while y < size.height {
                    var x: CGFloat = (Int(y / 4) % 2 == 0) ? 0 : 2
                    while x < size.width {
                        ctx.fill(Path(CGRect(x: x, y: y, width: 1, height: 1)), with: .color(.white.opacity(0.035)))
                        x += 4
                    }
                    y += 4
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Ficha de cassino desenhada: borda com listras e o valor no meio. Sem valor, é o ícone de saldo.
struct FichaView: View {
    let valor: Int?
    let tamanho: CGFloat

    private var cor: Color {
        switch valor {
        case 10: Tema.marca
        case 25: Tema.verdeAgua
        case 50: Tema.laranja
        case 100: Tema.violeta
        default: FeltroMesa.dourado
        }
    }
    var body: some View {
        ZStack {
            Circle().fill(cor)
            Circle().strokeBorder(.white.opacity(0.9), style: StrokeStyle(lineWidth: tamanho * 0.12, dash: [tamanho * 0.13, tamanho * 0.13]))
            Circle().fill(cor).padding(tamanho * 0.2)
            Circle().strokeBorder(.white.opacity(0.55), lineWidth: 1).padding(tamanho * 0.2)
            if let valor {
                Text("\(valor)").font(.system(size: tamanho * 0.3, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white).minimumScaleFactor(0.5).lineLimit(1).padding(tamanho * 0.22)
            }
        }
        .frame(width: tamanho, height: tamanho)
        .shadow(color: .black.opacity(0.35), radius: 2, y: 2)
    }
}

/// A aposta em jogo, como uma pilha de fichas no centro da mesa.
private struct MonteAposta: View {
    let valor: Int
    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                ForEach(0..<min(4, max(1, valor / 25)), id: \.self) { i in
                    FichaView(valor: nil, tamanho: 34).offset(y: CGFloat(-i * 4))
                }
            }
            .frame(height: 46)
            VStack(alignment: .leading, spacing: 0) {
                Text("APOSTA").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(FeltroMesa.textoSuave)
                Text("\(valor)").font(.title3.bold()).monospacedDigit()
            }
        }
        .accessibilityElement(children: .ignore).accessibilityLabel("Aposta de \(valor) fichas")
    }
}

/// Resultado da mão com o saldo de fichas, em verde, vermelho ou neutro.
private struct BannerResultado: View {
    let titulo: String
    let saldo: Int
    @Environment(\.accessibilityReduceMotion) private var reduzir
    @State private var visivel = false
    var body: some View {
        VStack(spacing: 4) {
            Text(titulo).font(.title2.bold())
            Text(saldo > 0 ? "+\(saldo) fichas" : saldo < 0 ? "\(saldo) fichas" : "Aposta devolvida")
                .font(.headline).monospacedDigit()
        }
        .padding(.horizontal, 22).padding(.vertical, 12)
        .background((saldo > 0 ? FeltroMesa.ganho : saldo < 0 ? FeltroMesa.perda : Color.black.opacity(0.35)), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(saldo > 0 ? FeltroMesa.dourado : .white.opacity(0.25), lineWidth: saldo > 0 ? 2 : 1))
        .scaleEffect(visivel || reduzir ? 1 : 0.8).opacity(visivel || reduzir ? 1 : 0)
        .onAppear {
            withAnimation(reduzir ? nil : .spring(response: 0.35, dampingFraction: 0.6)) { visivel = true }
            AccessibilityNotification.Announcement("\(titulo). \(saldo) fichas").post()
        }
        .accessibilityElement(children: .combine)
    }
}

/// Tabela de pagamentos do poker; a linha da mão final fica em destaque.
private struct TabelaPoker: View {
    let destaque: PokerRank?
    var body: some View {
        let linhas = PokerRank.allCases.reversed().filter { (MesaDescanso.tabelaPoker[$0] ?? 0) > 0 }
        VStack(spacing: 2) {
            ForEach(linhas, id: \.self) { rank in
                HStack {
                    Text(rank.name)
                    Spacer()
                    Text("\(MesaDescanso.tabelaPoker[rank] ?? 0)x").monospacedDigit()
                }
                .font(.caption.weight(destaque == rank ? .heavy : .medium))
                .padding(.horizontal, 10).padding(.vertical, 2)
                .background(destaque == rank ? FeltroMesa.dourado.opacity(0.9) : .clear, in: RoundedRectangle(cornerRadius: 4))
                .foregroundStyle(destaque == rank ? Color.black : FeltroMesa.textoSuave)
            }
        }
        .padding(8)
        .background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(FeltroMesa.dourado.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tabela de pagamentos")
    }
}

private struct HistoricoMesa: View {
    let historico: [RodadaMesa]
    @Environment(\.dismiss) private var fechar
    var body: some View {
        NavigationStack {
            List(Array(historico.enumerated()), id: \.offset) { _, r in
                HStack {
                    VStack(alignment: .leading) {
                        Text(r.resultado).font(.headline)
                        Text("\(r.jogo.rawValue) · \(Date(timeIntervalSince1970: r.quando / 1000).formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption).foregroundStyle(Tema.tintaSuave)
                    }
                    Spacer()
                    Text(r.saldo > 0 ? "+\(r.saldo)" : "\(r.saldo)").font(.headline).monospacedDigit()
                        .foregroundStyle(r.saldo > 0 ? Tema.marcaForte : r.saldo < 0 ? Tema.perigo : Tema.tintaSuave)
                }
            }
            .navigationTitle("Rodadas").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Fechar") { fechar() } }
        }
    }
}

// MARK: - Carta

/// Carta desenhada no app: índices nos cantos, naipe ou figura no centro e verso com treliça.
/// Chega do monte com um giro e vira para cima; respeita Reduzir Movimento.
struct CartaView: View {
    let carta: PlayingCard
    let oculta: Bool
    let ordem: Int
    let animar: Bool
    let largura: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduzir
    @State private var chegou = false
    @State private var virada = false

    private var cor: Color { carta.suit.red ? Color(red: 0.74, green: 0.11, blue: 0.16) : Color(white: 0.1) }
    private var mostraFrente: Bool { virada && !oculta }

    var body: some View {
        ZStack {
            verso.opacity(mostraFrente ? 0 : 1)
            frente.opacity(mostraFrente ? 1 : 0).rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
        }
        .frame(width: largura, height: largura / 0.7)
        .rotation3DEffect(.degrees(mostraFrente ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
        .shadow(color: .black.opacity(0.4), radius: 4, x: 0, y: 3)
        .offset(x: chegou ? 0 : 180, y: chegou ? 0 : -320)
        .rotationEffect(.degrees(chegou ? 0 : -25))
        .opacity(chegou ? 1 : 0)
        .animation(reduzir ? nil : .easeInOut(duration: 0.3), value: mostraFrente)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(oculta ? "Carta virada para baixo" : carta.spoken)
        .task(id: carta.id) {
            if reduzir || !animar { chegou = true; virada = true; return }
            chegou = false; virada = false
            do { try await Task.sleep(for: .milliseconds(140 * ordem)) } catch { return }
            withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { chegou = true }
            do { try await Task.sleep(for: .milliseconds(260)) } catch { return }
            virada = true
        }
    }

    private var frente: some View {
        let raio = largura * 0.1
        return ZStack {
            RoundedRectangle(cornerRadius: raio).fill(Color(red: 0.99, green: 0.98, blue: 0.95))
            RoundedRectangle(cornerRadius: raio).strokeBorder(.black.opacity(0.12), lineWidth: 1)
            VStack {
                HStack { indice; Spacer() }
                Spacer()
                HStack { Spacer(); indice.rotationEffect(.degrees(180)) }
            }
            .padding(largura * 0.07)
            centro
        }
    }

    private var indice: some View {
        VStack(spacing: 0) {
            Text(carta.value).font(.system(size: largura * 0.2, weight: .bold, design: .rounded))
            NaipeForma(naipe: carta.suit).fill(cor).frame(width: largura * 0.13, height: largura * 0.13)
        }
        .foregroundStyle(cor)
        .fixedSize()
    }

    @ViewBuilder
    private var centro: some View {
        if carta.rank > 10 {
            // Figura original: letra grande num quadro, com o naipe embaixo.
            ZStack {
                RoundedRectangle(cornerRadius: largura * 0.06).strokeBorder(cor.opacity(0.5), lineWidth: 1.5)
                    .padding(.horizontal, largura * 0.2).padding(.vertical, largura * 0.27)
                VStack(spacing: largura * 0.03) {
                    Text(carta.value).font(.system(size: largura * 0.42, weight: .heavy, design: .serif))
                    NaipeForma(naipe: carta.suit).fill(cor).frame(width: largura * 0.2, height: largura * 0.2)
                }
                .foregroundStyle(cor)
            }
        } else {
            NaipeForma(naipe: carta.suit).fill(cor)
                .frame(width: largura * (carta.rank == 1 ? 0.5 : 0.36), height: largura * (carta.rank == 1 ? 0.5 : 0.36))
        }
    }

    private var verso: some View {
        let raio = largura * 0.1
        return ZStack {
            RoundedRectangle(cornerRadius: raio).fill(.white)
            RoundedRectangle(cornerRadius: raio * 0.7).fill(Tema.acao).padding(largura * 0.06)
            Canvas { ctx, size in
                // Treliça diagonal em linhas finas.
                let passo = max(6, size.width / 7)
                var p = Path()
                var x = -size.height
                while x < size.width {
                    p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x + size.height, y: size.height))
                    p.move(to: CGPoint(x: x + size.height, y: 0)); p.addLine(to: CGPoint(x: x, y: size.height))
                    x += passo
                }
                ctx.stroke(p, with: .color(.white.opacity(0.22)), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: raio * 0.7))
            .padding(largura * 0.06)
            RoundedRectangle(cornerRadius: raio * 0.5).strokeBorder(.white.opacity(0.7), lineWidth: 1.5).padding(largura * 0.12)
        }
    }
}

/// Naipes desenhados no app, em coordenadas normalizadas.
struct NaipeForma: Shape {
    let naipe: CardSuit
    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch naipe {
        case .diamonds:
            // addLines começa um traço novo no primeiro ponto: o topo precisa estar na lista.
            path.addLines([CGPoint(x: 0.5, y: 0), CGPoint(x: 0.92, y: 0.5), CGPoint(x: 0.5, y: 1), CGPoint(x: 0.08, y: 0.5)])
            path.closeSubpath()
        case .hearts:
            path.move(to: CGPoint(x: 0.5, y: 0.94))
            path.addCurve(to: CGPoint(x: 0.5, y: 0.2), control1: CGPoint(x: -0.6, y: 0.2), control2: CGPoint(x: 0.25, y: -0.2))
            path.addCurve(to: CGPoint(x: 0.5, y: 0.94), control1: CGPoint(x: 0.75, y: -0.2), control2: CGPoint(x: 1.6, y: 0.2))
            path.closeSubpath()
        case .spades:
            path.move(to: CGPoint(x: 0.5, y: 0))
            path.addCurve(to: CGPoint(x: 0.5, y: 0.75), control1: CGPoint(x: -0.6, y: 0.7), control2: CGPoint(x: 0.22, y: 1))
            path.addCurve(to: CGPoint(x: 0.5, y: 0), control1: CGPoint(x: 0.78, y: 1), control2: CGPoint(x: 1.6, y: 0.7))
            path.closeSubpath()
            path.addRect(CGRect(x: 0.43, y: 0.65, width: 0.14, height: 0.35))
        case .clubs:
            path.addEllipse(in: CGRect(x: 0.26, y: 0, width: 0.48, height: 0.5))
            path.addEllipse(in: CGRect(x: 0, y: 0.32, width: 0.53, height: 0.53))
            path.addEllipse(in: CGRect(x: 0.47, y: 0.32, width: 0.53, height: 0.53))
            path.addRect(CGRect(x: 0.43, y: 0.6, width: 0.14, height: 0.4))
        }
        return path.applying(CGAffineTransform(scaleX: rect.width, y: rect.height))
            .applying(CGAffineTransform(translationX: rect.minX, y: rect.minY))
    }
}
