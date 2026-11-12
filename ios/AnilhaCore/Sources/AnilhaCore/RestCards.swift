import Foundation

public enum CardSuit: Int, CaseIterable, Sendable {
    case hearts, diamonds, clubs, spades
    public var name: String { ["copas", "ouros", "paus", "espadas"][rawValue] }
}

public struct PlayingCard: Equatable, Hashable, Sendable, Identifiable {
    public let rank: Int
    public let suit: CardSuit
    public var id: Int { suit.rawValue * 13 + rank - 1 }
    public init(rank: Int, suit: CardSuit) {
        precondition((1...13).contains(rank))
        self.rank = rank
        self.suit = suit
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

public struct CardDeck: Sendable {
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

public enum BlackjackResult: String, Sendable {
    case win = "Você venceu", loss = "A banca venceu", tie = "Empate"
}

public struct BlackjackHand: Sendable {
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

public enum PokerRank: Int, CaseIterable, Sendable {
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

public struct DrawPokerHand: Sendable {
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

public enum RestCardGame: String, CaseIterable, Sendable {
    case blackjack = "Blackjack", poker = "Poker"
}

/// Ephemeral presentation state. No training row or synchronization metadata is changed.
public struct RestGameState: Sendable {
    public private(set) var deadline: Double?
    public private(set) var startedAt: Double?
    public private(set) var game: RestCardGame?
    public private(set) var blackjack: BlackjackHand?
    public private(set) var poker: DrawPokerHand?
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
    public mutating func open(_ game: RestCardGame, deck: CardDeck, now: Double) {
        guard allow(now) else { return }
        close()
        self.game = game
        switch game {
        case .blackjack: blackjack = BlackjackHand(deck: deck)
        case .poker: poker = DrawPokerHand(deck: deck)
        }
    }
    public mutating func close() {
        game = nil
        blackjack = nil
        poker = nil
    }
    public mutating func hit(now: Double) {
        guard allow(now) else { return }
        blackjack?.hit()
    }
    public mutating func stand(now: Double) {
        guard allow(now) else { return }
        blackjack?.stand()
    }
    public mutating func hold(_ index: Int, now: Double) {
        guard allow(now) else { return }
        poker?.toggle(index)
    }
    public mutating func exchange(now: Double) {
        guard allow(now) else { return }
        poker?.exchange()
    }
    private mutating func allow(_ now: Double) -> Bool {
        if remaining(now: now) > 0 { return true }
        _ = update(startedAt: startedAt, end: deadline, now: now)
        return false
    }
}
