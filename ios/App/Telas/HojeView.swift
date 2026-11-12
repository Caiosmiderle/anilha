import SwiftUI

/// Exercício de uma ficha de exemplo (dados fictícios, só para a prova de visual).
struct ExercicioExemplo: Identifiable {
    let id: String
    let nome: String
    let series: Int
    let repeticoes: String
    let carga: String
}

/// "Hoje" de exemplo: a ficha do dia no visual do Anilha.
struct HojeView: View {
    @Binding var linkAberto: URL?

    static let ficha: [ExercicioExemplo] = [
        ExercicioExemplo(id: "supino-reto", nome: "Supino reto", series: 3, repeticoes: "8–10", carga: "40 kg"),
        ExercicioExemplo(id: "remada-baixa", nome: "Remada baixa", series: 3, repeticoes: "10–12", carga: "45 kg"),
        ExercicioExemplo(id: "desenvolvimento", nome: "Desenvolvimento com halteres", series: 3, repeticoes: "8–10", carga: "14 kg"),
        ExercicioExemplo(id: "puxada-frontal", nome: "Puxada frontal", series: 3, repeticoes: "10–12", carga: "50 kg"),
        ExercicioExemplo(id: "triceps-corda", nome: "Tríceps na corda", series: 2, repeticoes: "12–15", carga: "20 kg"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                cabecalho
                if let linkAberto { avisoLink(linkAberto) }
                cartaoFicha
                Text("Prova de instalação: ficha de exemplo, sem conta nem sincronização. As próximas etapas trazem a conta, as fichas reais e o treino.")
                    .font(.footnote)
                    .foregroundStyle(Tema.tintaSuave)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, Tema.Espaco.e5)
            .padding(.bottom, Tema.Espaco.e8)
        }
        .background(Tema.fundo.ignoresSafeArea())
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    SobreView()
                } label: {
                    Image(systemName: "info.circle")
                }
                .accessibilityLabel("Sobre o app")
            }
        }
    }

    private var cabecalho: some View {
        VStack(alignment: .leading, spacing: Tema.Espaco.e1) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).capitalizedPrimeiraLetra)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Tema.tintaSuave)
            Text("Hoje")
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(Tema.tintaForte)
        }
        .padding(.top, Tema.Espaco.e2)
    }

    private func avisoLink(_ url: URL) -> some View {
        Label("Aberto pelo link \(url.absoluteString)", systemImage: "link")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(Tema.marcaForte)
            .padding(Tema.Espaco.e3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tema.marcaFundo, in: RoundedRectangle(cornerRadius: Tema.Raio.lg, style: .continuous))
    }

    private var cartaoFicha: some View {
        VStack(alignment: .leading, spacing: Tema.Espaco.e3) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Treino de hoje")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Tema.tintaSuave)
                    Text("Ficha A · Superior")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Tema.tintaForte)
                }
                Spacer()
                Text("≈ 45 min")
                    .font(.footnote.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Tema.tintaSuave)
            }
            VStack(spacing: 0) {
                ForEach(Self.ficha) { e in
                    linha(e)
                    if e.id != Self.ficha.last?.id {
                        Divider().overlay(Tema.linha)
                    }
                }
            }
            Button {
            } label: {
                Text("Começar treino")
                    .font(.headline)
                    .foregroundStyle(Tema.sobreMarca)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Tema.marca, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(true)
            .opacity(0.5)
            .accessibilityHint("Disponível nas próximas etapas")
        }
        .padding(Tema.Espaco.e5)
        .cartao()
    }

    private func linha(_ e: ExercicioExemplo) -> some View {
        HStack(spacing: Tema.Espaco.e3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(e.nome)
                    .font(.body.weight(.medium))
                    .foregroundStyle(Tema.tinta)
                Text("\(e.series) × \(e.repeticoes)")
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(Tema.tintaSuave)
            }
            Spacer()
            Text(e.carga)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Tema.tintaForte)
        }
        .padding(.vertical, Tema.Espaco.e3)
        .accessibilityElement(children: .combine)
    }
}

extension String {
    var capitalizedPrimeiraLetra: String { prefix(1).uppercased() + dropFirst() }
}
