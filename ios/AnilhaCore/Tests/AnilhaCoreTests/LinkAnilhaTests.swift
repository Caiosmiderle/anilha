import XCTest
@testable import AnilhaCore

final class LinkAnilhaTests: XCTestCase {
    private func ler(_ s: String) -> LinkAnilha { LinkAnilha.ler(URL(string: s)!) }

    func testTreinoEFicha() {
        XCTAssertEqual(ler("anilha://treino/1e78266c-cd5c-41c4-8b7b-8d745c76a24c"), .treino("1e78266c-cd5c-41c4-8b7b-8d745c76a24c"))
        XCTAssertEqual(ler("anilha://ficha/ficha_ficticia-1"), .ficha("ficha_ficticia-1"))
    }

    func testRecusaOResto() {
        for s in ["anilha://teste", "anilha://treino", "anilha://treino/", "anilha://treino/a/b",
                  "anilha://outra/abc", "https://treino/abc", "anilha://treino/abc?x=1",
                  "anilha://treino/abc#y", "anilha://ficha/a%20b", "anilha://ficha/\(String(repeating: "a", count: 81))"] {
            XCTAssertEqual(ler(s), .outro, s)
        }
    }
}
