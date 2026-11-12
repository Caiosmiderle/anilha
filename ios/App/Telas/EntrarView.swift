import SwiftUI

struct EntrarView: View {
    let conta: ContaStore
    @State private var email = ""
    @State private var codigo = ""
    @State private var codigoEnviado = false
    @State private var reenviarEm: Date = .distantPast
    @FocusState private var focoCodigo: Bool

    private var emailLimpo: String { email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    private var emailValido: Bool {
        emailLimpo.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tema.Espaco.e5) {
                CabecalhoAnilha(titulo: "Anilha", selo: "Seu treino, no seu ritmo", icone: "dumbbell").entradaAnilha(0)
                VStack(alignment: .leading, spacing: Tema.Espaco.e4) {
                    Text(codigoEnviado ? "Confira seu e-mail" : "Entre na sua conta").font(.title.bold())
                    Text(codigoEnviado ? "Digite o código de 6 dígitos enviado para \(emailLimpo)." :
                            "Receba um código por e-mail para consultar seu plano, suas fichas e seu histórico.")
                        .foregroundStyle(Tema.tintaSuave)
                    if codigoEnviado {
                        TextField("Código de 6 dígitos", text: $codigo)
                            .textContentType(.oneTimeCode).keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder).frame(minHeight: 44).focused($focoCodigo)
                            .disabled(conta.ocupado)
                            .onChange(of: codigo) { _, value in
                                codigo = String(value.filter { $0.isASCII && $0.isNumber }.prefix(6))
                            }
                        Button("Entrar") {
                            Task { await conta.verificar(emailLimpo, codigo: codigo); codigo = "" }
                        }
                        .buttonStyle(.glassProminent).tint(Tema.acao).controlSize(.large).frame(minHeight: 44).disabled(codigo.count != 6 || conta.ocupado)
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Button("Enviar outro código") { Task { await enviar() } }
                                .disabled(context.date < reenviarEm || conta.ocupado)
                        }
                        Button("Usar outro e-mail") { codigoEnviado = false; codigo = "" }.disabled(conta.ocupado)
                    } else {
                        TextField("E-mail", text: $email)
                            .textContentType(.emailAddress).keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder).frame(minHeight: 44)
                            .disabled(conta.ocupado)
                        Button("Receber código") { Task { await enviar() } }
                            .buttonStyle(.glassProminent).tint(Tema.acao).controlSize(.large).frame(minHeight: 44).disabled(!emailValido || conta.ocupado)
                    }
                    if conta.ocupado { ProgressView().accessibilityLabel("Aguarde") }
                    if let erro = conta.erro { Text(erro).foregroundStyle(Tema.perigo).accessibilityAddTraits(.updatesFrequently) }
                }.padding(Tema.Espaco.e5).cartao(raio: Tema.Raio.xxl).entradaAnilha(1)
                    .buttonStyle(.glass).controlSize(.large)
                NavigationLink("Sobre o app") { SobreView() }.buttonStyle(.glass).controlSize(.large)
            }
            .padding(Tema.Espaco.e5)
        }
        .background { FundoAnilha() }.navigationTitle("Entrar").navigationBarTitleDisplayMode(.inline)
    }
    private func enviar() async {
        let destino = emailLimpo
        if await conta.enviarCodigo(destino) {
            email = destino
            codigoEnviado = true; codigo = ""; focoCodigo = true
            reenviarEm = .now.addingTimeInterval(60)
        }
    }
}
