import SwiftUI

/// Keep the semantic foreground on filled actions in one shared style.
struct BotaoPrincipalAnilha: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button(role: configuration.role) { configuration.trigger() } label: {
            configuration.label.foregroundStyle(Tema.sobreMarca)
        }.buttonStyle(.glassProminent).tint(Tema.acao)
    }
}

extension PrimitiveButtonStyle where Self == BotaoPrincipalAnilha {
    static var principalAnilha: BotaoPrincipalAnilha { BotaoPrincipalAnilha() }
}

struct FundoAnilha: View {
    var body: some View {
        LinearGradient(colors: [Tema.marcaFundo, Tema.fundo, Tema.fundo],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
            .ignoresSafeArea().accessibilityHidden(true)
    }
}

struct SeloAnilha: View {
    let texto: String
    var icone = "checkmark.circle"
    var body: some View {
        Label(texto, systemImage: icone)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Tema.marcaForte)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: 12))
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct CabecalhoAnilha: View {
    let titulo: String
    let selo: String
    var icone = "dumbbell"
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SeloAnilha(texto: selo, icone: icone)
            Text(titulo).font(.largeTitle.bold()).foregroundStyle(Tema.tintaForte)
                .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct DiscoExercicio: View {
    var grupo: String?
    var icone = "dumbbell"
    var body: some View {
        Image(systemName: icone).font(.title3.weight(.semibold))
            .foregroundStyle(Tema.tinta).frame(width: 48, height: 48)
            .background(Tema.grupo(grupo), in: Circle()).accessibilityHidden(true)
    }
}

private struct DestaqueAnilha: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduzir
    @ViewBuilder
    func body(content: Content) -> some View {
        if reduzir { content.cartao(raio: Tema.Raio.xxl) }
        else {
            content.glassEffect(.regular.tint(Tema.marcaFundo.opacity(0.4)),
                                in: RoundedRectangle(cornerRadius: Tema.Raio.xxl))
        }
    }
}

private struct EntradaAnilha: ViewModifier {
    let ordem: Int
    @Environment(\.accessibilityReduceMotion) private var reduzir
    @State private var visivel = false
    func body(content: Content) -> some View {
        content.opacity(visivel || reduzir ? 1 : 0)
            .offset(y: visivel || reduzir ? 0 : 12)
            .onAppear {
                withAnimation(reduzir ? nil : .easeOut(duration: 0.3).delay(Double(ordem) * 0.06)) {
                    visivel = true
                }
            }
    }
}

extension View {
    func destaqueAnilha() -> some View { modifier(DestaqueAnilha()) }
    func entradaAnilha(_ ordem: Int) -> some View { modifier(EntradaAnilha(ordem: ordem)) }
}
