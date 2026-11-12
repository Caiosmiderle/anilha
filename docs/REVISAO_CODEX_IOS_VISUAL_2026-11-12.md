# Revisão do Codex do visual iOS 0.5.0

## Origem e estado da entrega

- Autor Codex, 12/11/2026. Branch recebida `codex/ios-visual`, base `6491647` (`6491647` contém C.2, `4498035` contém C). Checkout inicialmente limpo. Caio atribuiu ao Claude a revisão e o commit desta árvore local.
- Foram lidos o topo do handoff, o parecer de C/C.2, README, arquitetura, decisões, Harbor UI e Tema.swift. As sete referências solicitadas do CRUNNING foram consultadas em leitura.
- As observações do Claude sobre 208 e 209 constam do pedido do Caio. O handoff recebido ainda marca a revisão de C.2 como pendente. Este parecer registra a revisão do código e da apresentação recebidos. A revisão desta entrega pelo Claude está **PENDENTE**.
- Intenção da entrega é dar acabamento às telas SwiftUI e preparar evidência visual pública, usando dados sintéticos. A versão do projeto Xcode passa a **0.5.0**, com Swift 6 estrito e destino iOS 26.

## Alterações por tela

| Tela | Alteração de apresentação |
| --- | --- |
| Hoje | Cabeçalho grande, selo com a data, disco pastel do grupo da ficha, cartão de destaque com Liquid Glass, ações glass/glassProminent e entrada escalonada. |
| Treino em andamento | Progresso com contagem grande monoespaçada, nome do exercício na próxima série, cabeçalho do exercício com disco pastel, campos numéricos maiores e ações de vidro. |
| Descanso | Painel azul do Anilha, relógio escalável com dígitos monoespaçados, transição numérica e disposição adaptável dos dois controles existentes. |
| Resumo concluído | Selo de conclusão e hierarquia entre o resumo, a Evolução e a Análise. Os cartões seguintes continuam acessíveis por rolagem. |
| Evolução, SwiftUI e PWA | Carga máxima e volume numa linha cada, variação curta com seta e sinal, comparação de séries, selos de recorde junto do nome. Esforço e aquecimento continuam identificados. |
| Análise, SwiftUI e PWA | Conteúdo nativo agrupado numa única linha de lista com espaçamento interno, prévia compacta por exercício, avaliação em selo e rodapé único de modelo, tokens de entrada/saída e custo estimado. |
| Fichas | Cabeçalho grande e discos com a cor do primeiro exercício de cada ficha. A demonstração inclui fichas de peito, costas e pernas. |
| Detalhe da ficha | Nome completo no cabeçalho que permite quebra de linha, discos por exercício, prescrição e carga anterior. |
| Histórico | Cabeçalho com selo, discos por modalidade e linhas com data monoespaçada e agrupamento de leitura. |
| Entrar | Marca e selo, formulário em cartão com cantos maiores, ação principal glassProminent e campos com área mínima de 44 pt. |

## Decisões de design e acessibilidade

O azul, superfícies, raios e espaçamentos vêm do Harbor UI. `Tema.grupo` reproduz `GROUP_PASTEL` de `src/engine/taxonomy.ts` e os tons escuros de `extensions.css`. As setas positivas usam o azul forte do Anilha. Os ícones nativos são equivalentes SF Symbols dos motivos usados pelo PWA, incluindo haltere, calendário, lista, relógio, troféu e cronômetro.

O vidro de destaque fica no cartão principal de Hoje. As listas de dados usam superfícies legíveis e os botões usam os estilos nativos do iOS 26. Os botões das linhas agrupadas têm estilo explícito para receber ações individuais. Reduzir Transparência troca o cartão de destaque pela superfície opaca. Reduzir Movimento elimina o deslocamento e a animação de entrada.

“Na próxima vez” fica na Análise quando existe a prévia numérica salva daquele exercício. Isso mantém juntos os números do motor, o comentário do Waltér e a condição temporal da previsão. `SessionDetail.tsx` lê a análise local para ocultar apenas as sugestões duplicadas dos itens cobertos. Exercícios sem prévia e respostas antigas continuam mostrando a sugestão individual. Esta seleção é de apresentação. As operações de treino, propostas, persistência e sincronização são chamadas pelas mesmas ações existentes.

Os selos de recorde ficam imediatamente junto ao título do exercício e conservam o tipo e o valor. O rodapé mostra `modelo · entrada/saída tokens · est. US$ valor`. O nome acessível expande entrada, saída e custo estimado. Em tamanhos grandes o rodapé pode ocupar mais linhas para conservar o conteúdo.

Foram usados estilos de fonte do sistema, `ScaledMetric`, textos com altura flexível, `ViewThatFits`, controles grandes e áreas de entrada de pelo menos 44 pt. O relógio aceita redução proporcional para manter o número inteiro na largura disponível. As métricas têm rótulos acessíveis com unidades por extenso. A operação real do VoiceOver e a geometria do SwiftUI aguardam o runtime Apple.

Checagem aritmética local WCAG dos pares opacos do Tema, com sRGB linearizado, resultou em 5,59 para branco sobre a ação, 5,54 para texto secundário no fundo sutil claro, 4,90 para azul no fundo azul claro, 6,85 para texto secundário na superfície escura e 8,88 para azul no fundo azul escuro. A composição real dos materiais precisa da inspeção dos PNGs do simulador.

## Demonstração isolada

- `ios/App/Demo/ModoDemo.swift` e a fábrica em `ContaStore.swift` ficam em `#if DEBUG`. A entrada é exclusivamente o argumento `-demo` seguido da tela. A ausência de valor ou uma tela inválida termina a demonstração com falha visível ao processo de captura.
- `AnilhaApp` seleciona a raiz antes de construir a raiz que abre a conta. A demonstração instancia `ReadData` em memória, usa o catálogo empacotado e calcula Evolução, contexto, prévia e validação do ajuste pelas funções puras existentes.
- O dono, cache e cliente permanecem ausentes na instância demonstrativa. A raiz de demonstração não instala os disparos de abrir conta, primeiro plano e URL da raiz normal. As interações ficam bloqueadas. A leitura de rascunho de uma série retorna pelo guard de ausência de dono/cache.
- O chaveiro e o serviço de avisos usam armazenamento `lazy` com `@ObservationIgnored`. O construtor normal inicializa ambos imediatamente. Um construtor privado Debug recebe apenas o `ReadData` demonstrativo e permite à fábrica evitar o acesso aos dois serviços.
- A fixture contém identificadores `demo-*`, nomes do catálogo, datas fixas e valores sintéticos. A resposta, modelo, tokens e custo exibidos são demonstrativos. A demonstração opera sem login, rede, Keychain, armazenamento da conta ou fila de envio.
- `-demo-size accessibility3` escolhe o tamanho de acessibilidade somente nessa raiz. O padrão é `.large`. O treino e o descanso usam âncoras de rolagem para enquadrar o estado solicitado.

## Geração e download dos prints nativos

O passo novo do workflow fica depois de `swift test`, dos E2E locais e da geração do projeto, antes do archive. `ios/scripts/capture-screenshots.sh` seleciona o runtime iOS disponível mais recente a partir de 26 e o iPhone de geração mais recente, preferindo Pro Max. O job usa o runner efêmero do GitHub.

O script compila Debug para o simulador, instala o app, alterna claro/escuro, relança cada tela e captura PNG. São **40 capturas previstas**, dez telas por dois temas por dois tamanhos. As telas são `entrar`, `hoje`, `fichas`, `ficha`, `treino`, `descanso`, `resumo`, `evolucao`, `analise` e `historico`. Evolução e Análise também são enquadradas separadamente com os mesmos componentes do resumo, para mostrar o conteúdo abaixo da primeira dobra.

Exemplo dos comandos usados pelo script, com variáveis preenchidas pelo runner.

```bash
xcrun simctl help
xcrun simctl help launch
xcrun simctl help ui
xcrun simctl list devices available --json
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcodebuild build -project Anilha.xcodeproj -scheme Anilha -configuration Debug \
  -destination "platform=iOS Simulator,id=$device" \
  -derivedDataPath "$RUNNER_TEMP/anilha-simulator" CODE_SIGNING_ALLOWED=NO
xcrun simctl install "$device" "$RUNNER_TEMP/anilha-simulator/Build/Products/Debug-iphonesimulator/Anilha.app"
xcrun simctl ui "$device" appearance dark
xcrun simctl launch "$device" io.github.caiosmiderle.anilha -demo hoje -demo-size large
xcrun simctl io booted screenshot hoje-dark-large.png
xcrun simctl terminate "$device" io.github.caiosmiderle.anilha
```

A Apple documenta a captura `simctl io booted screenshot` e orienta consultar a ajuda instalada para os subcomandos. O script guarda a ajuda de list, boot, bootstatus, install, launch, terminate, ui e io do Xcode efetivamente escolhido, junto do log de compilação e da lista de dispositivos. Os argumentos depois do bundle ID são argumentos do Anilha. A documentação WWDC mostra esse encaminhamento no lançamento por `simctl`. [Guia do Simulator da Apple](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/InteractingwiththeiOSSimulator/InteractingwiththeiOSSimulator.html), [referência de ferramentas Xcode](https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference), [slides WWDC 2019 sobre Simulator](https://devstreaming-cdn.apple.com/videos/wwdc/2019/418o9bbtoe880sauh/418/418_getting_the_most_out_of_simulator.pdf).

Os estilos `glass`, `glassProminent`, a configuração `Glass.regular.tint`, o modificador `glassEffect` e `ScaledMetric` foram conferidos na documentação Apple, incluindo as versões Markdown fornecidas pelas páginas. [Botões glass](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glass), [botões glassProminent](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glassprominent), [Liquid Glass em views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views), [ScaledMetric](https://developer.apple.com/documentation/swiftui/scaledmetric).

Cada captura registra `captured` ou `failed` em `manifest.csv`. Esse registro comprova captura e permanência do processo até seu encerramento, sujeito à revisão humana da imagem. O script espera três segundos para a apresentação e verifica que consegue terminar o processo após capturar. O ZIP inclui evidência parcial e logs quando há falha. O passo avisa, tem `continue-on-error` e limite de quinze minutos. O upload dos prints também permite continuação. O archive Release vem em seguida.

Após o envio desta branch e a execução do workflow, o arquivo será anexado como **Anilha-SwiftUI.zip** à mesma Release **ios-build-N** do IPA e ao artefato **Anilha-SwiftUI-ios-build-N**, com retenção de trinta dias no run. A opção de publicar Release do workflow mantém sua condição atual. O ZIP ainda depende dessa execução futura. Os destinos de download são a página de Releases e o run correspondente do workflow iOS. [Releases do Anilha](https://github.com/Caiosmiderle/anilha/releases), [workflow iOS](https://github.com/Caiosmiderle/anilha/actions/workflows/ios.yml).

## Achados e evidências

| Prioridade e tipo | Arquivo e cenário | Evidência e tratamento |
| --- | --- | --- |
| P2, apresentação observada na fonte recebida | `src/analysis/EvolutionCard.tsx`, abrir resumo com histórico anterior | A fonte recebida compunha “Carga máxima, kg” com outra frase para o delta e recordes em caixas após todas as métricas. Agora as linhas usam valor/delta e os recordes são selos no cabeçalho. O E2E confirma 25 kg, comparação anterior e ambos os tipos de recorde. |
| P2, duplicação observada na fonte recebida e caminho exercitado | `AnalysisCard.tsx` e `SessionDetail.tsx`, análise moderna salva de exercício concluído | Ambos os componentes recebidos renderizavam a prévia. O E2E ampliado verifica ausência do cartão duplicado quando há prévia e presença dele para resposta antiga. |
| P2, teste reproduzido | `tests/e2e/screens.spec.ts`, executar em novembro com semana sintética de outubro | Falhou esperando “1 série de 10, com 40%”, recebeu “2 séries de 6, com 40% e 80%”. `returnMode.ts` encerra a janela iniciada em 12/10 após quatro semanas. O teste visual passou depois de fixar o relógio em 22/10/2026. |
| P1, isolamento de teste reproduzido durante esta intervenção | `playwright.config.ts`, executar `npm run build` enquanto o E2E usa o preview | Ambos escreviam/serviam `dist`. A build normal substituiu o bundle local durante a repetição conjunta. Quatro cenários tentaram `POST /auth/v1/otp` no host de produção. Os quatro traces registram status `-1` e `net::ERR_NETWORK_ACCESS_DENIED`. O build/preview E2E agora usa exclusivamente `.local/e2e-dist`, também herdado pela configuração Node. |
| Pendência, hipótese a conferir no runtime | SwiftUI, compilação Debug/Release, materiais e Dynamic Type | Este Windows não fornece Swift, Xcode ou Simulator. Os checks estáticos e a validação TS da fixture não demonstram execução do app Apple. |

## Validações reais e limitações

- `npm run lint` passou, incluindo o verificador de textos Swift, Markdown e PWA.
- `npm run typecheck` e `npm run build` passaram. A build é a compilação local do PWA.
- `npm test -- --maxWorkers=1 --no-file-parallelism` passou com **823 testes em 68 arquivos**. Uma execução anterior passou com 820 testes antes da inclusão dos três checks da demonstração.
- Os três checks novos validam referências do catálogo/divisões, ausência de campos pessoais na fixture, carga 25 kg e delta 5, recordes, contexto e prévia, resposta válida e estrutura da entrada Debug. A primeira tentativa falhou por um nível a mais no caminho relativo do arquivo Swift. O caminho foi corrigido e os três passaram.
- `node scripts/generate-ios.mjs --check`, `node scripts/build-analysis.mjs --check`, `bash -n ios/scripts/capture-screenshots.sh` e `git diff --check` passaram.
- Os cinco E2E de `analysis.spec.ts` e `ios-treino.spec.ts` passaram nas execuções locais isoladas. O pacote de duas telas visuais em `screens.spec.ts` passou após a correção da data. Depois do isolamento de saída, as duas repetições conjuntas passaram com **sete cenários móveis**, saída 0. A última repetição inclui o rodapé acessível definitivo e atualiza as capturas.
- `swift test --package-path ios/AnilhaCore` não iniciou porque o comando `swift` está ausente. Compilação Swift 6, factory Debug, archive Release, comandos `simctl`, ZIP e upload Apple/GitHub aguardam o CI da árvore desta entrega.
- As execuções finais dos E2E usaram banco e API locais, contas sintéticas e respostas locais/interceptadas do assistente. Foi conferido no bundle `client` em `.local/e2e-dist` o endereço `127.0.0.1:54329` e a ausência de host Supabase externo. A fixture de payload iOS usada neste Windows é a gerada pelo PWA. A execução Swift e seu payload dependem do CI.
- O teardown do Playwright voltou a aguardar os servidores no Windows após terminar os cenários. Em cada execução foram conferidos os listeners 54329 e 4173 com `netstat` e os horários dos processos, depois encerrados somente os servidores daquela execução. Uma tentativa de inventário por `Get-CimInstance` recebeu acesso negado. A conferência foi concluída com `netstat` e `Get-Process`.

### Incidente de validação e correção

O Codex iniciou a build normal do PWA em paralelo à primeira repetição conjunta dos sete E2E. A configuração recebida usava `dist` tanto para essa build quanto para a build/preview E2E. O overwrite substituiu o bundle local e os quatro últimos cenários falharam no início do login. Os três primeiros cenários tinham passado. Os traces foram abertos em modo de leitura e inspecionados apenas quanto a destino, método, caminho, status e erro de rede.

As tentativas externas foram uma no cenário de evolução, uma no payload iOS, uma na semana de exemplo e uma no onboarding. Todas foram `POST /auth/v1/otp`, status `-1`, erro **`net::ERR_NETWORK_ACCESS_DENIED`**, com e-mails sintéticos dos testes. A rede bloqueou as quatro tentativas. A evidência não contém resposta HTTP nem login externo confirmado. O host, credenciais e corpos dos pedidos foram omitidos deste registro.

`playwright.config.ts` passou a compilar e servir `.local/e2e-dist`. A configuração `playwright.node.config.ts` herda essa saída. A opção `--outDir` do preview foi conferida no `npx vite preview --help` instalado. A execução final é sequencial em relação à build normal. Este incidente explica a execução intermediária de três aprovações e quatro falhas.

## Evidência visual local do PWA

Os PNGs ficam em `artifacts/screens`, pasta ignorada pelo Git. Foram inspecionadas versões claras, escuras e com fonte ampliada dos cartões. As capturas de página inteira incluem a barra fixa e o botão do Waltér na posição do viewport. O teste confirma ausência de rolagem horizontal com fonte a 200% nos cartões alterados.

- `208-analise-walter.png`.
- `208-analise-walter-proposta.png` e `208-analise-walter-proposta-escuro.png`, incluindo avaliação, próxima vez e ajuste proposto.
- `209-evolucao-local.png`, `209-evolucao-local-escuro.png` e `209-evolucao-local-texto-grande.png`.
- A passada `screens.spec.ts` também atualiza os PNGs gerais de Entrar, Hoje, Histórico, ficha, treino, descanso, onboarding e desktop.

## Pendências para o Claude

1. Revisar o diff desta branch e registrar a revisão mútua efetiva, incluindo o parecer anterior C.2.
2. Conferir o isolamento da raiz demonstrativa e os serviços sob demanda, `@ObservationIgnored`, concorrência Swift 6, destino e recurso de catálogo.
3. Conferir a factory pelo compilador Apple e a captura dos 40 PNGs. Inspecionar os conteúdos de `manifest.csv`, `capture.log`, `xcodebuild-simulator.log` e as ajudas `simctl` anexadas.
4. Conferir os prints normais e `.accessibility3`, temas, Reduzir Transparência, Reduzir Movimento e os rótulos no VoiceOver. Os prints de acessibilidade mostram o enquadramento inicial de conteúdo rolável.
5. Validar o uso real no iPhone, incluindo transições, teclado numérico, foco do VoiceOver e toques de pelo menos 44 pt. Os cálculos de contraste de tokens precisam da inspeção do material composto pelo iOS.
6. Fazer o commit local e seguir o fluxo de envio autorizado pelo Caio. O novo ZIP ficará disponível após essa passagem e o CI correspondente.
