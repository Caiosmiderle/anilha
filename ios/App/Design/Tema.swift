import SwiftUI
import UIKit

/// Tokens do Harbor UI traduzidos para SwiftUI. Claro vem de `design/harbor-ui/tokens.css`;
/// escuro, de `design/harbor-ui/extensions.css` (`[data-theme='dark']`). Mudou lá, muda aqui.
enum Tema {
    // MARK: Cores (claro / escuro)

    static let fundo = cor(0xFAFAFA, 0x0F1012)        // --bg-page
    static let superficie = cor(0xFFFFFF, 0x18191C)   // --bg-surface
    static let sutil = cor(0xF4F4F5, 0x222327)        // --bg-subtle
    static let tinta = cor(0x262626, 0xE6E6E8)        // --ink
    static let tintaForte = cor(0x141413, 0xF7F7F8)   // --ink-strong
    static let tintaSuave = cor(0x757577, 0xA1A1A8)   // --ink-muted
    static let tintaApagada = cor(0xB4B4B6, 0x64656B) // --ink-subtle
    static let linha = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(white: 1, alpha: 0.08) : UIColor(white: 0, alpha: 0.08) }) // --line
    static let marca = cor(0x0099FF, 0x0099FF)        // --brand-500
    static let marcaForte = cor(0x006BB3, 0x8FD0FF)   // --brand-700
    static let marcaFundo = cor(0xE3F2FD, 0x0D2A40)   // --brand-50
    static let sobreMarca = Color.white               // --ink-on-brand
    static let perigo = cor(0xE0322D, 0xFF6B63)       // --danger
    static let violeta = cor(0x8E5CFF, 0x8E5CFF)      // --accent-violet
    static let laranja = cor(0xFA7315, 0xFA7315)      // --accent-orange
    static let verdeAgua = cor(0x0BB7BD, 0x0BB7BD)    // --accent-teal

    // MARK: Espaço e raio (px do CSS = pt aqui)

    enum Espaco {
        static let e1: CGFloat = 4, e2: CGFloat = 8, e3: CGFloat = 12, e4: CGFloat = 16
        static let e5: CGFloat = 20, e6: CGFloat = 24, e8: CGFloat = 32
    }

    enum Raio {
        static let md: CGFloat = 8, lg: CGFloat = 12, xl: CGFloat = 16, xxl: CGFloat = 24, pilula: CGFloat = 99
    }

    private static func cor(_ claro: UInt32, _ escuro: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? uiCor(escuro) : uiCor(claro) })
    }

    private static func uiCor(_ hex: UInt32) -> UIColor {
        UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension View {
    /// Cartão do Harbor UI: superfície, raio 16 e contorno fino (`--shadow-ring`).
    func cartao(raio: CGFloat = Tema.Raio.xl) -> some View {
        background(Tema.superficie, in: RoundedRectangle(cornerRadius: raio, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: raio, style: .continuous).stroke(Tema.linha, lineWidth: 1))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }
}
