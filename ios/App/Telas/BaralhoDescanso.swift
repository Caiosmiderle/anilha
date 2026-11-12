import AnilhaCore
import SwiftUI

struct BaralhoDescanso: View {
    @Binding var jogos: RestGameState
    @Binding var preferido: String
    @State private var rodada = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let now = context.date.timeIntervalSince1970 * 1000
                    HStack {
                        Text("Descanso").font(.headline).lineLimit(1).minimumScaleFactor(0.6)
                        Spacer()
                        Text(relogioTreino(Double(jogos.remaining(now: now))))
                            .font(.largeTitle.bold()).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                            .accessibilityLabel("Descanso, \(jogos.remaining(now: now)) segundos")
                    }.padding(16)
                    .onChange(of: context.date, initial: true) { _, _ in
                        jogos.update(startedAt: jogos.startedAt, end: jogos.deadline, now: now)
                    }
                }
                ScrollView {
                    VStack(spacing: 20) {
                        Picker("Jogo", selection: Binding(get: { jogos.game?.rawValue ?? preferido }, set: { value in
                            preferido = value
                            novaMao(RestCardGame(rawValue: value) ?? .blackjack)
                        })) {
                            ForEach(RestCardGame.allCases, id: \.self) { game in Text(game.rawValue).tag(game.rawValue) }
                        }.pickerStyle(.segmented)
                        if let hand = jogos.blackjack { blackjack(hand) }
                        if let hand = jogos.poker { poker(hand) }
                    }.padding(16)
                }
            }
            .background(Tema.fundo)
            .navigationTitle("Uma mão no descanso").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Voltar ao treino") { jogos.close() } }
        }
    }

    private func blackjack(_ hand: BlackjackHand) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Banca\(hand.result != nil ? " · \(BlackjackScore(hand.dealer).total)" : "")").font(.headline)
            cartas(hand.dealer, ocultarBanca: hand.result == nil)
            Text("Você · \(BlackjackScore(hand.player).total)").font(.headline)
            cartas(hand.player)
            if let result = hand.result {
                Text(result.rawValue).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    .onAppear { AccessibilityNotification.Announcement(result.rawValue).post() }
                if BlackjackScore(hand.player).natural { Text("Blackjack natural").font(.subheadline) }
                if BlackjackScore(hand.dealer).natural { Text("Blackjack natural da banca").font(.subheadline) }
                if BlackjackScore(hand.player).total > 21 { Text("Você estourou").font(.subheadline) }
                if BlackjackScore(hand.dealer).total > 21 { Text("A banca estourou").font(.subheadline) }
                Button("Outra mão") { novaMao(.blackjack) }.buttonStyle(.glass).controlSize(.large)
            } else {
                HStack {
                    Button("Pedir") { jogos.hit(now: agora) }
                    Button("Parar") { jogos.stand(now: agora) }
                }.buttonStyle(.glass).controlSize(.large)
            }
            Text("A banca pede até 17 e para em todo 17, inclusive com ás valendo 11.")
                .font(.footnote).foregroundStyle(Tema.tintaSuave)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func poker(_ hand: DrawPokerHand) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(hand.result == nil ? "Toque para segurar. Uma troca por mão." : "Sua mão").font(.subheadline)
            // Five positions fit on a narrow iPhone. Each whole column is a touch target.
            HStack(alignment: .top, spacing: 6) {
                ForEach(Array(hand.cards.enumerated()), id: \.element.id) { index, card in
                    Button { jogos.hold(index, now: agora) } label: {
                        VStack(spacing: 8) {
                            CartaDescanso(carta: card, ordem: index)
                            Image(systemName: hand.held.contains(index) ? "checkmark.circle.fill" : "circle")
                                .frame(minHeight: 44).foregroundStyle(hand.held.contains(index) ? Tema.marcaForte : Tema.tintaSuave)
                        }.frame(maxWidth: .infinity)
                    }.buttonStyle(.plain).disabled(hand.result != nil)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(card.spoken)
                        .accessibilityValue(hand.result != nil ? "" : hand.held.contains(index) ? "Segurada" : "Para trocar")
                        .accessibilityHint(hand.result == nil ? "Toque para mudar se segura esta carta" : "")
                        .accessibilityAddTraits(hand.held.contains(index) ? .isSelected : [])
                }
            }.id(rodada)
            if let result = hand.result {
                Text(result.name).font(.title2.bold())
                    .onAppear { AccessibilityNotification.Announcement(result.name).post() }
                Button("Outra mão") { novaMao(.poker) }.buttonStyle(.glass).controlSize(.large)
            } else {
                Button("Trocar") { jogos.exchange(now: agora) }.buttonStyle(.principalAnilha).tint(Tema.acao).controlSize(.large)
                Text("As cartas marcadas ficam na mão.").font(.footnote).foregroundStyle(Tema.tintaSuave)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cartas(_ cards: [PlayingCard], ocultarBanca: Bool = false) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                    CartaDescanso(carta: card, ordem: index, oculta: ocultarBanca && index == 1).frame(width: 66)
                }
            }.padding(.vertical, 4).id(rodada)
        }
    }
    private var agora: Double { Date.now.timeIntervalSince1970 * 1000 }
    private func novaMao(_ game: RestCardGame) {
        var generator = SystemRandomNumberGenerator()
        jogos.open(game, deck: CardDeck(using: &generator), now: agora)
        rodada += 1
    }
}

private struct CartaDescanso: View {
    let carta: PlayingCard
    let ordem: Int
    var oculta = false
    @Environment(\.accessibilityReduceMotion) private var reduzirMovimento
    @State private var distribuida = false
    @State private var virada = false
    private var cor: Color { carta.suit == .hearts || carta.suit == .diamonds ? Color(red: 0.7, green: 0.12, blue: 0.16) : Color(white: 0.12) }
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10).fill(Tema.acao)
            RoundedRectangle(cornerRadius: 6).stroke(Tema.sobreMarca.opacity(0.6), lineWidth: 2).padding(6)
            if !oculta && virada {
                RoundedRectangle(cornerRadius: 10).fill(.white)
                VStack(spacing: 5) {
                    Text(carta.value).font(.title3.bold()).lineLimit(1).minimumScaleFactor(0.6)
                    NaipeCarta(naipe: carta.suit).fill(cor).frame(width: 22, height: 25)
                }.foregroundStyle(cor).padding(6)
            }
        }
        .aspectRatio(0.66, contentMode: .fit)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Tema.linha))
        .rotation3DEffect(.degrees(!oculta && virada ? 0 : 180), axis: (x: 0, y: 1, z: 0))
        .offset(y: distribuida ? 0 : 14).opacity(distribuida ? 1 : 0)
        .animation(reduzirMovimento ? nil : .easeInOut(duration: 0.28), value: virada)
        .animation(reduzirMovimento ? nil : .easeInOut(duration: 0.28), value: oculta)
        .accessibilityElement(children: .ignore).accessibilityLabel(oculta ? "Carta virada" : carta.spoken)
        .task(id: carta.id) {
            if reduzirMovimento { distribuida = true; virada = true; return }
            distribuida = false; virada = false
            do { try await Task.sleep(for: .milliseconds(60 * ordem)) } catch { return }
            withAnimation(.easeOut(duration: 0.22)) { distribuida = true }
            do { try await Task.sleep(for: .milliseconds(180)) } catch { return }
            virada = true
        }
    }
}

/// Original suit geometry drawn in normalized card coordinates.
private struct NaipeCarta: Shape {
    let naipe: CardSuit
    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch naipe {
        case .diamonds:
            path.move(to: CGPoint(x: 0.5, y: 0))
            path.addLines([CGPoint(x: 1, y: 0.5), CGPoint(x: 0.5, y: 1), CGPoint(x: 0, y: 0.5)])
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
