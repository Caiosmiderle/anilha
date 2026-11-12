import SwiftUI

/// Prova de instalação do Anilha nativo: visual do Harbor UI, ficha fictícia e o link
/// `anilha://`. Sem conta, sync nem regras ainda (ver docs/ROADMAP_IOS.md).
@main
struct AnilhaApp: App {
    @State private var linkAberto: URL?

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                HojeView(linkAberto: $linkAberto)
            }
            .tint(Tema.marca)
            .onOpenURL { url in
                guard url.scheme == "anilha" else { return }
                linkAberto = url
            }
        }
    }
}
