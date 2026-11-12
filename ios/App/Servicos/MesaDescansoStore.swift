import AnilhaCore
import Foundation
import Observation

/// A mesa do descanso (fichas, mãos e histórico), salva no aparelho a cada jogada. Funciona
/// sem rede e volta exatamente de onde parou no próximo descanso. Não é dado da conta: não
/// sincroniza e não vai para o servidor.
@MainActor
@Observable
final class MesaDescansoStore {
    static let shared = MesaDescansoStore()

    var mesa: MesaDescanso { didSet { if !emMemoria { salvar() } } }
    /// Modo demonstração: mesa só em memória, nada é gravado.
    @ObservationIgnored private(set) var emMemoria = false

    private static var arquivo: URL {
        URL.applicationSupportDirectory.appending(path: "mesa-descanso.json")
    }

    private init() {
        if let dados = try? Data(contentsOf: Self.arquivo),
           let salva = try? JSONDecoder().decode(MesaDescanso.self, from: dados) {
            mesa = salva
        } else {
            mesa = MesaDescanso()
        }
    }

    #if DEBUG
    /// Prints do CI: troca a mesa por uma fixa, sem gravar.
    func usarDemonstracao(_ demo: MesaDescanso) {
        emMemoria = true
        mesa = demo
    }
    #endif

    private func salvar() {
        let pasta = Self.arquivo.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: pasta, withIntermediateDirectories: true)
        if let dados = try? JSONEncoder().encode(mesa) {
            try? dados.write(to: Self.arquivo, options: [.atomic])
        }
    }
}
