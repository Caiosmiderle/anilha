import Foundation
import JavaScriptCore

/// The bundled TypeScript generator runs offline in a fresh, unshared JSContext per call.
public enum PlanEngine {
    public enum Failure: LocalizedError {
        case engine, invalid, conflict
        public var errorDescription: String? {
            switch self {
            case .engine: "Não foi possível gerar o plano neste iPhone. Suas respostas continuam aqui."
            case .invalid: "Confira os dias de treino e a data da prova antes de revisar o plano."
            case .conflict: "O perfil ou as fichas mudaram. Revise o plano novamente antes de salvar."
            }
        }
    }
    static func invoke(_ method: String, params: ReadRow, picked: Bool = false, source: String? = nil) throws -> ReadRow {
        guard let context = JSContext() else { throw Failure.engine }
        let script: String
        if let source { script = source }
        else {
            guard let url = Bundle.module.url(forResource: "plan-engine", withExtension: "js") else { throw Failure.engine }
            guard let bundled = try? String(contentsOf: url, encoding: .utf8) else { throw Failure.engine }
            script = bundled
        }
        context.evaluateScript(script)
        guard context.exception == nil,
              let engine = context.objectForKeyedSubscript("AnilhaPlanEngine"),
              let function = engine.objectForKeyedSubscript(method), !function.isUndefined else { throw Failure.engine }
        let input = String(decoding: try JSONEncoder().encode(params), as: UTF8.self)
        let result = function.call(withArguments: [input, picked])
        guard context.exception == nil, let result, result.isString, let json = result.toString(),
              let row = try? JSONDecoder().decode(ReadRow.self, from: Data(json.utf8)) else { throw Failure.engine }
        return row
    }
    public static func parameters(_ params: ReadRow, picked: Bool, health: Bool) throws -> ReadRow {
        try invoke("parameters", params: params.changing(["spare_joints": health ? params.fields["spare_joints"] ?? .array([]) : .array([])]), picked: picked)
    }
    public static func generate(_ params: ReadRow) throws -> ReadRow {
        let result = try invoke("generate", params: params)
        guard result.number("gym_per_week") != nil, result.number("run_per_week") != nil,
              case .array = result.fields["days"], case .array = result.fields["routines"],
              case .array = result.fields["reasons"], case .object = result.fields["rules"] else { throw Failure.engine }
        return result
    }
    public static func validate(_ params: ReadRow, today: String) throws {
        let gym = params.number("gym_days") ?? -1, run = params.number("run_days") ?? -1
        guard gym >= 0, gym <= 6, run >= 0, run <= 7, gym + run > 0, gym + run <= 7 else { throw Failure.invalid }
        if case .object = params.fields["race"] {
            let date = params.object("race").string("date") ?? ""
            guard !date.isEmpty, date >= today, date <= LocalDay.add(today, 365) else { throw Failure.invalid }
        }
    }
}
