import SwiftUI

/// Versão, build e identificador: o que a prova de instalação precisa registrar.
struct SobreView: View {
    private var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }

    var body: some View {
        List {
            Section {
                linha("Versão", info["CFBundleShortVersionString"] as? String ?? "?")
                linha("Build", info["CFBundleVersion"] as? String ?? "?")
                linha("Identificador", Bundle.main.bundleIdentifier ?? "?")
            } footer: {
                Text("Para testar o link, abra anilha://teste no Safari.")
            }
        }
        .navigationTitle("Sobre")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func linha(_ titulo: String, _ valor: String) -> some View {
        HStack {
            Text(titulo)
            Spacer()
            Text(valor)
                .monospacedDigit()
                .foregroundStyle(Tema.tintaSuave)
                .textSelection(.enabled)
        }
    }
}
