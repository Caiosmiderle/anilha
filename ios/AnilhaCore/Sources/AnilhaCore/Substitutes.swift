import Foundation

/// Substitutos no treino, a mesma regra do `suggestSubstitutes` do site (src/engine/substitute.ts):
/// só o mesmo grupo muscular, o músculo principal primeiro, depois o mesmo movimento, o aparelho
/// que a pessoa tem e a dificuldade dentro do nível. Até 6, cada um com uma linha de motivo.
public enum Substitutes {
    public struct Suggestion: Sendable, Equatable {
        public let exercise: ReadRow
        public let reason: String
    }

    static let volumeGroup: [String: String] = [
        "costas": "costas", "lombar": "costas", "trapezio": "ombros", "peito": "peito",
        "ombro_anterior": "ombros", "ombro_lateral": "ombros", "ombro_posterior": "ombros",
        "biceps": "biceps", "triceps": "triceps", "antebraco": "biceps", "quadriceps": "quadriceps",
        "posterior_coxa": "posteriores", "gluteos": "posteriores", "adutores": "quadriceps",
        "panturrilha": "panturrilha", "abdomen": "core",
    ]
    static let levelRank = ["iniciante": 0, "intermediario": 1, "avancado": 2]
    static let withEquipment = [
        "halteres": "com halteres", "barra": "com barra", "polia": "na polia", "maquina": "na máquina",
        "peso_corporal": "com o peso do corpo", "kettlebell": "com kettlebell", "barra_fixa": "na barra fixa",
    ]
    static let equipmentNoun = [
        "halteres": "halteres", "barra": "barra", "polia": "polia", "maquina": "máquina",
        "peso_corporal": "peso do corpo", "kettlebell": "kettlebell", "barra_fixa": "barra fixa",
    ]
    static let groupPhrase = [
        "costas": "das costas", "peito": "do peito", "ombros": "do ombro", "biceps": "do bíceps",
        "triceps": "do tríceps", "quadriceps": "da coxa", "posteriores": "do posterior",
        "panturrilha": "da panturrilha", "core": "do abdômen",
    ]

    static func group(_ e: ReadRow) -> String {
        AgentChat.strings(e, "muscles").first.flatMap { volumeGroup[$0] } ?? "core"
    }

    /// - Parameters:
    ///   - catalog: o catálogo embutido, na ordem do site (desempate: a variante mais próxima vem antes).
    ///   - library: exercícios disponíveis (catálogo e personalizados), sem arquivados.
    public static func suggest(_ exercise: ReadRow, library: [ReadRow], catalog: [ReadRow],
                               excludeIds: [String] = [], available: [String]? = nil,
                               spareJoints: [String]? = nil, level: String? = nil,
                               limit: Int = 6) -> [Suggestion] {
        let exclude = Set([exercise.id] + excludeIds)
        let order = Dictionary(catalog.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { a, _ in a })
        let levels = Dictionary(catalog.map { ($0.id, $0.string("level")) }, uniquingKeysWith: { a, _ in a })
        let target = group(exercise)
        let user = level.flatMap { levelRank[$0] }
        let mainMuscle = AgentChat.strings(exercise, "muscles").first
        var scored: [(e: ReadRow, key: [Int], index: Int, reason: String)] = []
        for (index, e) in library.enumerated() {
            if exclude.contains(e.id) || group(e) != target { continue }
            if let spare = spareJoints, !Set(spare).isDisjoint(with: AgentChat.strings(e, "joints")) { continue }
            let first = AgentChat.strings(e, "muscles").first
            let sameMuscle = first != nil && first == mainMuscle
            let samePattern = e.fields["pattern"] == exercise.fields["pattern"]
            let equipment = e.string("equipment") ?? ""
            let has = available == nil || equipment == "peso_corporal" || available!.contains(equipment)
            let lvl: String? = e.string("level") ?? (levels[e.id] ?? nil)
            let harder = user != nil && lvl.flatMap { levelRank[$0] }.map { $0 > user! } == true
            let key = [sameMuscle ? 1 : 0, samePattern ? 1 : 0, has ? 1 : 0, harder ? 0 : 1,
                       e.fields["compound"] == exercise.fields["compound"] ? 1 : 0]
            let how = has ? ", \(withEquipment[equipment] ?? equipment)" : ""
            let base = sameMuscle && samePattern ? "Mesmo movimento"
                : sameMuscle ? "Mesmo músculo em outro movimento"
                : "Outra parte \(groupPhrase[target] ?? "")"
            let tail = !has ? ", mas pede \(equipmentNoun[equipment] ?? equipment)" : harder ? ", e pede mais técnica" : ""
            scored.append((e, key, order[e.id] ?? catalog.count + index, "\(base)\(how)\(tail)."))
        }
        scored.sort { a, b in
            for i in a.key.indices where a.key[i] != b.key[i] { return a.key[i] > b.key[i] }
            return a.index < b.index
        }
        return scored.prefix(limit).map { Suggestion(exercise: $0.e, reason: $0.reason) }
    }
}
