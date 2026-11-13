import Foundation

/// Links `anilha://` que outro app (o CRUNNING) pode abrir: um treino feito ou uma ficha.
/// Qualquer outra coisa vira `.outro`, e o app não repete nada do link na tela.
public enum LinkAnilha: Equatable, Sendable {
    case treino(String)
    case ficha(String)
    case outro

    public static func ler(_ url: URL) -> LinkAnilha {
        guard url.scheme == "anilha", url.query == nil, url.fragment == nil else { return .outro }
        let partes = url.pathComponents.filter { $0 != "/" }
        guard partes.count == 1, let id = partes.first, valido(id) else { return .outro }
        switch url.host {
        case "treino": return .treino(id)
        case "ficha": return .ficha(id)
        default: return .outro
        }
    }

    static func valido(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 80 && id.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "-" || $0 == "_"
        }
    }
}
