import Foundation

public enum CardSuit: Int, CaseIterable, Sendable, Codable {
    case hearts, diamonds, clubs, spades
    public var name: String { ["copas", "ouros", "paus", "espadas"][rawValue] }
    public var red: Bool { self == .hearts || self == .diamonds }
}

public struct PlayingCard: Equatable, Hashable, Sendable, Identifiable, Codable {
    public let rank: Int
    public let suit: CardSuit
    public var id: Int { suit.rawValue * 13 + rank - 1 }
    public init(rank: Int, suit: CardSuit) {
        precondition((1...13).contains(rank))
        self.rank = rank
        self.suit = suit
    }
    private enum CodingKeys: String, CodingKey { case rank, suit }
    /// The saved table is local data: a corrupted card fails to load instead of crashing.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let rank = try c.decode(Int.self, forKey: .rank)
        guard (1...13).contains(rank) else {
            throw DecodingError.dataCorruptedError(forKey: .rank, in: c, debugDescription: "rank")
        }
        self.rank = rank
        suit = try c.decode(CardSuit.self, forKey: .suit)
    }
    public var value: String {
        switch rank {
        case 1: "A"
        case 11: "J"
        case 12: "Q"
        case 13: "K"
        default: String(rank)
        }
    }
    public var spoken: String {
        let name = [1: "Ás", 11: "Valete", 12: "Dama", 13: "Rei"][rank] ?? String(rank)
        return "\(name) de \(suit.name)"
    }
}

public struct CardDeck: Sendable, Codable, Equatable {
    public private(set) var cards: [PlayingCard]
    public init<R: RandomNumberGenerator>(using generator: inout R) {
        cards = CardSuit.allCases.flatMap { suit in (1...13).map { PlayingCard(rank: $0, suit: suit) } }
        cards.shuffle(using: &generator)
    }
    // Ordered input also supports deterministic presentation fixtures.
    public init(cards: [PlayingCard]) {
        precondition(Set(cards).count == cards.count)
        self.cards = cards
    }
    public mutating func draw() -> PlayingCard? { cards.isEmpty ? nil : cards.removeFirst() }
}

public struct BlackjackScore: Equatable, Sendable {
    public let total: Int
    public let soft: Bool
    public let natural: Bool
    public init(_ cards: [PlayingCard]) {
        var value = cards.reduce(0) { $0 + min($1.rank, 10) }
        let elevatedAce = cards.contains { $0.rank == 1 } && value + 10 <= 21
        if elevatedAce { value += 10 }
        total = value
        soft = elevatedAce
        natural = cards.count == 2 && value == 21
    }
}

public enum BlackjackResult: String, Sendable, Codable {
    case win = "Você venceu", loss = "A banca venceu", tie = "Empate"
}

public struct BlackjackHand: Sendable, Codable, Equatable {
    public private(set) var player: [PlayingCard] = []
    public private(set) var dealer: [PlayingCard] = []
    public private(set) var result: BlackjackResult?
    private var deck: CardDeck
    public init(deck: CardDeck) {
        precondition(deck.cards.count >= 4)
        self.deck = deck
        for _ in 0..<2 {
            if let card = self.deck.draw() { player.append(card) }
            if let card = self.deck.draw() { dealer.append(card) }
        }
        let playerScore = BlackjackScore(player)
        let dealerScore = BlackjackScore(dealer)
        if playerScore.natural && dealerScore.natural {
            result = .tie
        } else if playerScore.natural {
            result = .win
        } else if dealerScore.natural {
            result = .loss
        }
    }
    /// The dealer stands on every 17, including soft 17 (ace counted as 11).
    public static func dealerShouldHit(_ cards: [PlayingCard]) -> Bool { BlackjackScore(cards).total < 17 }
    public mutating func hit() {
        guard result == nil, let card = deck.draw() else { return }
        player.append(card)
        if BlackjackScore(player).total > 21 { result = .loss }
        else if BlackjackScore(player).total == 21 { stand() }
    }
    /// Double down: exactly one more card on the first two, then the dealer plays (unless bust).
    public mutating func doubleDown() {
        guard result == nil, player.count == 2 else { return }
        hit()
        if result == nil { stand() }
    }
    public mutating func stand() {
        guard result == nil else { return }
        while Self.dealerShouldHit(dealer), let card = deck.draw() { dealer.append(card) }
        let playerTotal = BlackjackScore(player).total
        let dealerTotal = BlackjackScore(dealer).total
        if dealerTotal > 21 || playerTotal > dealerTotal {
            result = .win
        } else if playerTotal == dealerTotal {
            result = .tie
        } else {
            result = .loss
        }
    }
}

public enum PokerRank: Int, CaseIterable, Sendable, Codable {
    case highCard, pair, twoPair, three, straight, flush, fullHouse, four, straightFlush, royalFlush
    public var name: String {
        ["Carta alta", "Par", "Dois pares", "Trinca", "Sequência", "Flush", "Full house", "Quadra", "Straight flush", "Royal flush"][rawValue]
    }
    public static func classify(_ cards: [PlayingCard]) -> PokerRank? {
        guard cards.count == 5, Set(cards).count == 5 else { return nil }
        let ranks = cards.map { $0.rank }.sorted()
        let groups = Dictionary(grouping: ranks, by: { $0 }).values.map(\.count).sorted(by: >)
        let flush = Set(cards.map(\.suit)).count == 1
        let highAce = ranks == [1, 10, 11, 12, 13]
        let straight = Set(ranks).count == 5 && (ranks[4] - ranks[0] == 4 || highAce)
        if flush && highAce { return .royalFlush }
        if flush && straight { return .straightFlush }
        if groups == [4, 1] { return .four }
        if groups == [3, 2] { return .fullHouse }
        if flush { return .flush }
        if straight { return .straight }
        if groups == [3, 1, 1] { return .three }
        if groups == [2, 2, 1] { return .twoPair }
        if groups == [2, 1, 1, 1] { return .pair }
        return .highCard
    }
}

public struct DrawPokerHand: Sendable, Codable, Equatable {
    public private(set) var cards: [PlayingCard] = []
    public private(set) var held: Set<Int> = []
    public private(set) var result: PokerRank?
    private var deck: CardDeck
    public init(deck: CardDeck) {
        precondition(deck.cards.count >= 10)
        self.deck = deck
        for _ in 0..<5 { if let card = self.deck.draw() { cards.append(card) } }
    }
    public mutating func toggle(_ index: Int) {
        guard result == nil, cards.indices.contains(index) else { return }
        if held.contains(index) { held.remove(index) } else { held.insert(index) }
    }
    public mutating func exchange() {
        guard result == nil else { return }
        for index in cards.indices where !held.contains(index) {
            if let card = deck.draw() { cards[index] = card }
        }
        result = PokerRank.classify(cards)
    }
}

public enum RestCardGame: String, CaseIterable, Sendable, Codable {
    case blackjack = "Blackjack", poker = "Poker"
}

/// When the table is visible, tied to the rest deadline. The hands themselves live in
/// `MesaDescanso`, saved on the device: when the rest ends the table only closes, and the next
/// rest resumes exactly where it stopped. No training row or sync metadata is changed.
public struct RestGameState: Sendable {
    public private(set) var deadline: Double?
    public private(set) var startedAt: Double?
    /// The game on screen, or nil when the table is closed.
    public private(set) var game: RestCardGame?
    public private(set) var ready = false
    public init() {}
    public func remaining(now: Double) -> Int { max(0, Int(ceil(((deadline ?? now) - now) / 1000))) }
    /// Returns true once per rest when a previously active deadline expires or is skipped.
    @discardableResult public mutating func update(startedAt: Double?, end: Double?, now: Double) -> Bool {
        let changedRest = self.startedAt != startedAt && startedAt != nil
        let wasResting = deadline != nil && !ready && !changedRest
        if changedRest {
            close()
            ready = false
        }
        self.startedAt = startedAt
        deadline = end
        if end == nil || remaining(now: now) == 0 {
            close()
            if end != nil || wasResting { ready = true }
            if wasResting { return true }
        } else { ready = false }
        return false
    }
    public mutating func open(_ game: RestCardGame, now: Double) {
        guard allow(now) else { return }
        self.game = game
    }
    public mutating func show(_ game: RestCardGame) { if self.game != nil { self.game = game } }
    public mutating func close() { game = nil }
    /// A move counts only while resting: after the deadline the table closes instead.
    public mutating func allow(_ now: Double) -> Bool {
        if remaining(now: now) > 0 { return true }
        _ = update(startedAt: startedAt, end: deadline, now: now)
        return false
    }
}

/// One finished round, for the table history.
public struct RodadaMesa: Codable, Sendable, Equatable {
    public let jogo: RestCardGame
    public let resultado: String
    /// Chips won (positive) or lost (negative) in the round.
    public let saldo: Int
    public let quando: Double
}

/// The rest table: chips, the current bet, one hand of each game and the history. Fictional
/// chips only, never money. Saved on the device after every move.
public struct MesaDescanso: Codable, Sendable, Equatable {
    public static let fichasIniciais = 1000
    public static let valoresFicha = [10, 25, 50, 100]
    public static let historicoMaximo = 30
    /// Return per chip bet (bet included): pair pays back the bet, high card loses it.
    public static let tabelaPoker: [PokerRank: Int] = [
        .highCard: 0, .pair: 1, .twoPair: 2, .three: 3, .straight: 4, .flush: 6,
        .fullHouse: 9, .four: 25, .straightFlush: 50, .royalFlush: 250,
    ]

    public private(set) var fichas = MesaDescanso.fichasIniciais
    public private(set) var aposta = 50
    public var jogo: RestCardGame = .blackjack
    public private(set) var blackjack: BlackjackHand?
    public private(set) var apostaBlackjack = 0
    public private(set) var poker: DrawPokerHand?
    public private(set) var apostaPoker = 0
    public private(set) var historico: [RodadaMesa] = []
    /// Chips won or lost in the last settled round of each game, for the result banner.
    public private(set) var saldoBlackjack: Int?
    public private(set) var saldoPoker: Int?

    public init() {}

    public func emAndamento(_ jogo: RestCardGame) -> Bool {
        switch jogo {
        case .blackjack: blackjack != nil && blackjack?.result == nil
        case .poker: poker != nil && poker?.result == nil
        }
    }
    public var podeDistribuir: Bool { fichas >= aposta && aposta > 0 }
    public var precisaRecarregar: Bool {
        fichas < Self.valoresFicha[0] && !emAndamento(.blackjack) && !emAndamento(.poker)
    }
    public var podeDobrar: Bool {
        guard let hand = blackjack, hand.result == nil, hand.player.count == 2 else { return false }
        return fichas >= apostaBlackjack
    }

    public mutating func definirAposta(_ valor: Int) {
        aposta = min(max(valor, Self.valoresFicha[0]), max(Self.valoresFicha[0], fichas))
    }
    public mutating func somarFicha(_ valor: Int) { definirAposta(aposta + valor) }
    public mutating func limparAposta() { aposta = Self.valoresFicha[0] }

    /// Takes the bet and deals a new hand of `jogo`. Refuses while that game has a hand in play.
    @discardableResult
    public mutating func distribuir(_ jogo: RestCardGame, deck: CardDeck, agora: Double) -> Bool {
        guard !emAndamento(jogo), podeDistribuir else { return false }
        self.jogo = jogo
        fichas -= aposta
        switch jogo {
        case .blackjack:
            blackjack = BlackjackHand(deck: deck)
            apostaBlackjack = aposta
            saldoBlackjack = nil
            liquidarBlackjack(agora)
        case .poker:
            poker = DrawPokerHand(deck: deck)
            apostaPoker = aposta
            saldoPoker = nil
        }
        return true
    }
    public mutating func pedir(agora: Double) {
        guard emAndamento(.blackjack) else { return }
        blackjack?.hit()
        liquidarBlackjack(agora)
    }
    public mutating func parar(agora: Double) {
        guard emAndamento(.blackjack) else { return }
        blackjack?.stand()
        liquidarBlackjack(agora)
    }
    public mutating func dobrar(agora: Double) {
        guard podeDobrar else { return }
        fichas -= apostaBlackjack
        apostaBlackjack *= 2
        blackjack?.doubleDown()
        liquidarBlackjack(agora)
    }
    public mutating func segurar(_ indice: Int) {
        guard emAndamento(.poker) else { return }
        poker?.toggle(indice)
    }
    public mutating func trocar(agora: Double) {
        guard emAndamento(.poker) else { return }
        poker?.exchange()
        guard let rank = poker?.result else { return }
        let retorno = apostaPoker * (Self.tabelaPoker[rank] ?? 0)
        fichas += retorno
        saldoPoker = retorno - apostaPoker
        registrar(.poker, rank.name, saldo: retorno - apostaPoker, agora: agora)
    }
    /// Fictional chips: when they run out, the table refills.
    public mutating func recarregar(agora: Double) {
        guard precisaRecarregar else { return }
        let antes = fichas
        fichas = Self.fichasIniciais
        definirAposta(aposta)
        registrar(jogo, "Recarga de fichas", saldo: fichas - antes, agora: agora)
    }

    /// Chips returned for a finished hand, bet included: natural pays 3 to 2, win 1 to 1, tie
    /// returns the bet.
    public static func retornoBlackjack(_ hand: BlackjackHand, aposta: Int) -> Int {
        switch hand.result {
        case .some(.win): BlackjackScore(hand.player).natural ? aposta + aposta * 3 / 2 : aposta * 2
        case .some(.tie): aposta
        default: 0
        }
    }

    private mutating func liquidarBlackjack(_ agora: Double) {
        guard let hand = blackjack, let result = hand.result, saldoBlackjack == nil else { return }
        let retorno = Self.retornoBlackjack(hand, aposta: apostaBlackjack)
        fichas += retorno
        saldoBlackjack = retorno - apostaBlackjack
        let nome = result == .win && BlackjackScore(hand.player).natural ? "Blackjack" : result.rawValue
        registrar(.blackjack, nome, saldo: retorno - apostaBlackjack, agora: agora)
    }
    private mutating func registrar(_ jogo: RestCardGame, _ resultado: String, saldo: Int, agora: Double) {
        historico.insert(RodadaMesa(jogo: jogo, resultado: resultado, saldo: saldo, quando: agora), at: 0)
        if historico.count > Self.historicoMaximo { historico.removeLast(historico.count - Self.historicoMaximo) }
        definirAposta(aposta)
    }
}
