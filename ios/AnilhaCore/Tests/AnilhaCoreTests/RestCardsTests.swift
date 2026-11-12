import XCTest
@testable import AnilhaCore

final class RestCardsTests: XCTestCase {
    private struct SeededGenerator: RandomNumberGenerator {
        var seed: UInt64
        mutating func next() -> UInt64 {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return seed
        }
    }
    private func cards(_ ranks: [Int], suited: Bool = false) -> [PlayingCard] {
        ranks.enumerated().map { index, rank in
            PlayingCard(rank: rank, suit: suited ? .hearts : CardSuit.allCases[index % 4])
        }
    }
    private func deck() -> CardDeck {
        var rng = SeededGenerator(seed: 123)
        return CardDeck(using: &rng)
    }
    func testDeckHas52UniqueCardsAndInjectedShuffleIsRepeatable() {
        var a = deck()
        let b = deck()
        XCTAssertEqual(a.cards, b.cards)
        XCTAssertEqual(a.cards.count, 52)
        XCTAssertEqual(Set(a.cards).count, 52)
        XCTAssertEqual(Set(a.cards.map(\.id)).count, 52)
        for suit in CardSuit.allCases { XCTAssertEqual(a.cards.filter { $0.suit == suit }.count, 13) }
        let ordered = CardSuit.allCases.flatMap { suit in (1...13).map { PlayingCard(rank: $0, suit: suit) } }
        XCTAssertNotEqual(a.cards, ordered)
        for card in b.cards { XCTAssertEqual(a.draw(), card) }
        XCTAssertNil(a.draw())
    }
    func testAcesSoftHardNaturalAndBust() {
        for (ranks, total, soft, natural) in [
            ([1], 11, true, false), ([1, 1], 12, true, false),
            ([1, 1, 9], 21, true, false), ([1, 1, 9, 10], 21, false, false),
            ([1, 6], 17, true, false), ([1, 6, 10], 17, false, false),
            ([1, 13], 21, true, true), ([13, 12, 2], 22, false, false),
            ([1, 1, 1, 1, 10], 14, false, false), ([], 0, false, false)
        ] {
            let score = BlackjackScore(cards(ranks))
            XCTAssertEqual(score.total, total, "\(ranks)")
            XCTAssertEqual(score.soft, soft, "\(ranks)")
            XCTAssertEqual(score.natural, natural, "\(ranks)")
        }
    }
    func testDealerStandsOnHardAndSoft17() {
        XCTAssertTrue(BlackjackHand.dealerShouldHit(cards([10, 6])))
        XCTAssertTrue(BlackjackHand.dealerShouldHit(cards([1, 5])))
        XCTAssertFalse(BlackjackHand.dealerShouldHit(cards([1, 6])))
        XCTAssertFalse(BlackjackHand.dealerShouldHit(cards([10, 7])))
        var hand = BlackjackHand(deck: CardDeck(cards: cards([10, 1, 7, 6, 5])))
        hand.stand()
        XCTAssertEqual(hand.result, .tie)
        XCTAssertEqual(hand.dealer.count, 2)
    }
    func testNaturalsResolveImmediatelyAndCannotBePlayedAgain() {
        for (ranks, result) in [([1, 9, 13, 8], BlackjackResult.win),
                                ([9, 1, 8, 13], .loss), ([1, 1, 13, 12], .tie)] {
            var hand = BlackjackHand(deck: CardDeck(cards: cards(ranks + [2, 3])))
            XCTAssertEqual(hand.result, result)
            hand.hit()
            hand.stand()
            XCTAssertEqual(hand.player.count, 2)
            XCTAssertEqual(hand.dealer.count, 2)
            XCTAssertEqual(hand.result, result)
        }
    }
    func testPlayerBustDealerBustAndOrdinaryWinLossTie() {
        var bust = BlackjackHand(deck: CardDeck(cards: cards([10, 9, 8, 7, 6])))
        bust.hit()
        XCTAssertEqual(bust.result, .loss)
        XCTAssertEqual(BlackjackScore(bust.player).total, 24)
        for (ranks, result) in [([10, 10, 8, 6, 9], BlackjackResult.win),
                                ([10, 10, 9, 8, 2], .win), ([10, 10, 7, 9, 2], .loss),
                                ([10, 10, 8, 8, 2], .tie)] {
            var hand = BlackjackHand(deck: CardDeck(cards: cards(ranks)))
            hand.stand()
            XCTAssertEqual(hand.result, result, "\(ranks)")
        }
    }
    func testHit21PlaysDealerAndResolves() {
        var hand = BlackjackHand(deck: CardDeck(cards: cards([10, 10, 5, 7, 6])))
        hand.hit()
        XCTAssertEqual(BlackjackScore(hand.player).total, 21)
        XCTAssertEqual(hand.result, .win)
    }
    func testDealerKeepsDrawingAfterSoft16BecomesHard16() {
        var hand = BlackjackHand(deck: CardDeck(cards: cards([9, 1, 10, 5, 13, 2])))
        hand.stand()
        XCTAssertEqual(hand.dealer.count, 4)
        XCTAssertEqual(BlackjackScore(hand.dealer).total, 18)
        XCTAssertFalse(BlackjackScore(hand.dealer).soft)
        XCTAssertEqual(hand.result, .win)
    }
    func testEveryPokerCategoryAndBothAceStraights() {
        let vectors: [([Int], Bool, PokerRank)] = [
            ([2, 5, 7, 9, 13], false, .highCard),
            ([2, 2, 7, 9, 13], false, .pair),
            ([2, 2, 7, 7, 13], false, .twoPair),
            ([2, 2, 2, 9, 13], false, .three),
            ([2, 3, 4, 5, 6], false, .straight),
            ([1, 2, 3, 4, 5], false, .straight),
            ([10, 11, 12, 13, 1], false, .straight),
            ([2, 5, 7, 9, 13], true, .flush),
            ([2, 2, 2, 9, 9], false, .fullHouse),
            ([2, 2, 2, 2, 13], false, .four),
            ([1, 2, 3, 4, 5], true, .straightFlush),
            ([9, 10, 11, 12, 13], true, .straightFlush),
            ([10, 11, 12, 13, 1], true, .royalFlush),
            ([12, 13, 1, 2, 3], false, .highCard),
            ([2, 3, 4, 5, 5], false, .pair)
        ]
        XCTAssertEqual(Set(vectors.map { $0.2 }), Set(PokerRank.allCases))
        for (ranks, suited, result) in vectors {
            let hand = cards(ranks, suited: suited)
            XCTAssertEqual(PokerRank.classify(hand), result, "\(ranks)")
            XCTAssertEqual(PokerRank.classify(Array(hand.reversed())), result)
        }
        XCTAssertNil(PokerRank.classify(cards([1, 2, 3, 4])))
        XCTAssertNil(PokerRank.classify(cards([1, 2, 3, 4, 5, 6])))
        XCTAssertNil(PokerRank.classify(Array(repeating: PlayingCard(rank: 1, suit: .hearts), count: 5)))
    }
    func testDrawHoldsCardsAndAllowsExactlyOneExchange() {
        let input = deck()
        var hand = DrawPokerHand(deck: input)
        hand.toggle(-1)
        hand.toggle(5)
        XCTAssertTrue(hand.held.isEmpty)
        hand.toggle(0)
        hand.toggle(2)
        hand.toggle(3)
        hand.toggle(3)
        hand.exchange()
        XCTAssertEqual(hand.cards[0], input.cards[0])
        XCTAssertEqual(hand.cards[2], input.cards[2])
        XCTAssertEqual(hand.cards[1], input.cards[5])
        XCTAssertEqual(hand.cards[3], input.cards[6])
        XCTAssertEqual(hand.cards[4], input.cards[7])
        XCTAssertEqual(Set(hand.cards).count, 5)
        XCTAssertEqual(hand.result, PokerRank.classify(hand.cards))
        let finished = hand.cards
        hand.toggle(0)
        hand.exchange()
        XCTAssertEqual(hand.cards, finished)
        XCTAssertEqual(hand.held, [0, 2])
    }
    func testDrawKeepingAllOrNone() {
        for holdAll in [true, false] {
            let input = deck()
            var hand = DrawPokerHand(deck: input)
            if holdAll { for index in 0..<5 { hand.toggle(index) } }
            hand.exchange()
            XCTAssertEqual(hand.cards, Array(input.cards[holdAll ? 0..<5 : 5..<10]))
            XCTAssertNotNil(hand.result)
        }
    }
    func testRestDeadlineIsAbsoluteAndEndsGameExactlyOnce() {
        var state = RestGameState()
        XCTAssertFalse(state.update(startedAt: 1000, end: 91000, now: 1000))
        state.open(.blackjack, deck: deck(), now: 2000)
        XCTAssertNotNil(state.blackjack)
        XCTAssertEqual(state.remaining(now: 90001), 1)
        XCTAssertTrue(state.update(startedAt: 1000, end: 91000, now: 91000))
        XCTAssertTrue(state.ready)
        XCTAssertNil(state.game)
        XCTAssertNil(state.blackjack)
        XCTAssertFalse(state.update(startedAt: 1000, end: 91000, now: 99999))
        state.open(.poker, deck: deck(), now: 100000)
        XCTAssertNil(state.game)
    }
    func testSuspensionExpiryDiscardsUnfinishedPokerWithoutResult() {
        var state = RestGameState()
        state.update(startedAt: 1000, end: 91000, now: 2000)
        state.open(.poker, deck: deck(), now: 3000)
        state.hold(1, now: 4000)
        XCTAssertNil(state.poker?.result)
        // A tap after returning from lock must check the wall clock before exchanging.
        state.exchange(now: 120000)
        XCTAssertNil(state.poker)
        XCTAssertNil(state.game)
        XCTAssertTrue(state.ready)
    }
    func testSkipShorteningExtensionAndNextRest() {
        var state = RestGameState()
        state.update(startedAt: 1000, end: 91000, now: 1000)
        state.open(.poker, deck: deck(), now: 2000)
        XCTAssertFalse(state.update(startedAt: 1000, end: 106000, now: 3000))
        XCTAssertNotNil(state.game)
        XCTAssertEqual(state.remaining(now: 3000), 103)
        XCTAssertTrue(state.update(startedAt: 1000, end: 1000, now: 4000))
        XCTAssertNil(state.game)
        XCTAssertFalse(state.update(startedAt: 5000, end: 95000, now: 5000))
        XCTAssertFalse(state.ready)
        state.open(.blackjack, deck: deck(), now: 5000)
        XCTAssertTrue(state.update(startedAt: nil, end: nil, now: 6000))
        XCTAssertTrue(state.ready)
        XCTAssertNil(state.game)
        XCTAssertFalse(state.update(startedAt: nil, end: nil, now: 7000))
    }
    func testReopeningExpiredRestAndReplacingActiveRest() {
        var state = RestGameState()
        XCTAssertFalse(state.update(startedAt: 1000, end: 91000, now: 100000))
        XCTAssertTrue(state.ready)
        state.update(startedAt: 101000, end: 191000, now: 101000)
        state.open(.poker, deck: deck(), now: 102000)
        XCTAssertFalse(state.update(startedAt: 103000, end: 193000, now: 103000))
        XCTAssertNil(state.game)
        XCTAssertFalse(state.ready)
    }
    func testExpiredBlackjackActionsAndManualClose() {
        var state = RestGameState()
        state.update(startedAt: 0, end: 90000, now: 0)
        state.open(.blackjack, deck: deck(), now: 1000)
        state.hit(now: 90000)
        XCTAssertNil(state.blackjack)
        state.stand(now: 91000)
        XCTAssertNil(state.blackjack)
        state.update(startedAt: 100000, end: 190000, now: 100000)
        state.open(.poker, deck: deck(), now: 101000)
        state.open(.blackjack, deck: deck(), now: 190000)
        XCTAssertNil(state.game)
        XCTAssertTrue(state.ready)
        state.update(startedAt: 200000, end: 290000, now: 200000)
        state.open(.poker, deck: deck(), now: 201000)
        state.close()
        XCTAssertNil(state.game)
        XCTAssertFalse(state.ready)
        XCTAssertEqual(state.remaining(now: 201000), 89)
    }
    func testRestStateConsumesExistingWorkoutDeadline() {
        let session = ReadRow(fields: ["status": .string("active"), "rest_started_at": .number(1000), "rest_duration_sec": .number(90)])
        var state = RestGameState()
        state.update(startedAt: session.number("rest_started_at"), end: Workout.restEnd(session), now: 1000)
        state.open(.poker, deck: deck(), now: 2000)
        let skipped = session.changing(["rest_started_at": .null, "rest_duration_sec": .null])
        XCTAssertTrue(state.update(startedAt: skipped.number("rest_started_at"), end: Workout.restEnd(skipped), now: 3000))
        XCTAssertNil(state.game)
        XCTAssertEqual(session.number("rest_duration_sec"), 90)
    }
}
