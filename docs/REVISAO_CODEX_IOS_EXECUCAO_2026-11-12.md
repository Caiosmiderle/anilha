# Revisão do Codex da execução iOS 0.6.0

## Origem e estado da entrega

- Autor Codex, 12/11/2026. Checkout recebido em `codex/ios-execucao`, origem `1c96097`, iOS 0.5.0. O estado inicial tinha apenas `ios/AnilhaCore/Sources/AnilhaCore/RestCards.swift` como arquivo não versionado, deixado pela execução interrompida. Esse arquivo foi revisado e aproveitado.
- Foram conferidos branch, status, cinco commits recentes, topo do handoff, parecer do visual, README, arquitetura, decisões recentes, implementação do PWA e capturas locais 05/06. O Caio informou o sucesso do CI da build 6 e dos 40 prints. A inspeção desta intervenção usa a fonte recebida e as imagens locais do PWA.
- A árvore está preparada para revisão e commit pelo Claude, conforme instrução expressa do Caio sobre `.git`. Versão do projeto Xcode **0.6.0**, Swift 6 estrito e destino iOS 26. Revisão desta entrega pelo Claude **PENDENTE**.
- A ação **Ignorar sugestão está PENDENTE** pela restrição expressa de parar ao precisar alterar lógica de treino. A dependência e o ponto de continuação estão abaixo. A implementação dos demais itens e os checks locais estão registrados neste parecer.

## Achados na fonte recebida

| Prioridade e evidência | Arquivo e cenário | Tratamento |
| --- | --- | --- |
| P2, estrutura confirmada na fonte, efeito visual relatado pelo Caio | `AnilhaApp.swift` e `ModoDemo.swift`, abrir uma ação azul preenchida | Ambas as raízes impunham `foregroundStyle(Tema.tinta)`. As raízes agora deixam os controles resolverem o primeiro plano. `BotaoPrincipalAnilha`, em `Design/Componentes.swift`, concentra `Tema.sobreMarca` no rótulo e preserva `glassProminent`. Os botões preenchidos usam esse estilo compartilhado. |
| P2, estrutura confirmada na fonte, layout relatado pelo Caio | `TreinoView.swift`, concluir uma série de trabalho com fonte grande | O fallback de esforço era um `VStack` com quatro ações. Agora o esforço usa quatro chips numa única linha, com largura distribuída e alvos de 44 pt. |
| P2, duplicação confirmada na fonte | `TreinoView.swift`, editar carga ou repetições | O `Stepper` continha o número e havia outro `TextField` logo abaixo. `ControleSerie` reúne diminuir, campo editável e aumentar num único controle. |
| P2, associação confirmada na fonte | `HojeView.swift`, ter treino ativo num dia de descanso planejado | O botão Continuar ficava dentro do cartão do planejamento. O treino ativo agora ganha o cartão principal com título, tempo e Continuar. O planejamento aparece no cartão seguinte. |
| P2, apresentação confirmada na fonte | `HistoricoView.swift`, abrir Hoje ou Histórico com data ISO | `HistoricoLinha` imprimia `entry.date` diretamente. Agora usa `hoje` ou `EEE, dd/MM`, com locale pt-BR. |
| P2, apresentação confirmada na fonte | demonstração de Evolução e rodapé de análise | A navegação demonstrativa repetia Evolução acima da seção. Agora usa Treino concluído. O custo tem locale pt-BR explícito nos dois clientes. O E2E confirma `0,0001750` e `0,0003395`. |
| P2, inspeção do arquivo residual, execução Swift pendente | `RestCards.swift`, primeira atualização já vencida ou abertura de outra mão após o prazo | A primeira atualização vencida só marcava pronto numa atualização posterior. A abertura fora do prazo apenas retornava, podendo conservar a mão anterior até o próximo tick. Agora a atualização reconhece imediatamente o prazo vencido e toda ação de jogo passa pela expiração. Há casos Swift para ambos. |

As observações de geometria, contraste composto e interação nativa aguardam o runtime Apple. Os checks de fonte identificam as estruturas causadoras, e os testes TS verificam o contrato de captura e o estilo compartilhado.

## Execução e modo foco

`TreinoView` encaminha a sessão ativa para `ExecucaoTreino`. A tela abre em foco a cada apresentação, seguindo a hierarquia de `src/screens/parts/FocusMode.tsx`.

- Cabeçalho fixo com ficha, tempo grande e botão redondo de recolher. O menu reúne trocar, mover, pular, concluir, minimizar e permitir o aviso local.
- Tempo calculado de `sessions.started_at` até o relógio atual. O início vem da sessão persistida. Retomada, bloqueio e encerramento do processo conservam a mesma base temporal.
- Centro com exercício, prescrição grande e posição entre as séries do mesmo tipo. A contagem de séries feitas usa trabalho. Aquecimento, valor ausente, tudo feito e descanso seguem os estados da referência.
- Série feita usa os valores do mesmo editor que aparece ao tocar em Ajustar. Anotar série abre esse editor quando faltam repetições ou segundos. O rascunho usa o armazenamento existente por ID de série.
- A lista fica a um toque, com o exercício atual expandido, disco de grupo, prescrição, sugestão e séries compactas. Os demais cartões podem ser expandidos pelo cabeçalho. Tocar numa série pendente a seleciona no editor. Tocar numa série de trabalho concluída permite rever o esforço. O menu de contexto de cada cartão preserva o acesso às ações dos demais exercícios, inclusive os já feitos.
- O painel da lista mantém o tipo da série, exercício, posição, controles numéricos lado a lado e Concluir série com largura completa. O tipo identifica a série existente.
- Esforço aparece após trabalho, some ao escolher e expira visualmente após dez segundos. O intervalo foi escolhido para atender ao pedido de desaparecer sozinho. A gravação do RIR passa pela operação existente.
- Descanso mostra contagem, controles de 15 segundos, Pular e progresso no painel. As ações usam os campos já existentes da sessão. O fim vem de `Workout.restEnd`. A retomada também verifica o relógio quando a cena volta ao primeiro plano.

As ações da tela chamam `Workout.editorStart`, `editorSave`, `next`, `complete`, `move`, `skip`, `substitute`, `restEnd` e os métodos existentes de `ContaStore`. A mudança em `ContaStore.swift` é a assinatura da fábrica Debug para receber a fixture de prazo vencido. O resumo mantém comparação, análise, faixa planejada e identificação de exercícios trocados.

### Dependência da ação Ignorar

O PWA chama `lastTimeUpdates`, de `src/screens/parts/setValues.ts`, ao recusar um aumento ou redução com histórico. Isso restaura carga e repetições de todas as séries de trabalho pendentes e invalida os rascunhos correspondentes. A parte B nativa oferece `LoadSuggestion.last` para calcular valores, mas carece da operação equivalente de restauração e invalidação.

A implementação dessa ação foi interrompida conforme a regra do pedido. A tela apresenta a sugestão calculada pelo motor. **Ignorar continua como requisito de entrega pendente.** Foi enviada ao Caio a dependência durante o trabalho.

O próximo passo é autorizar e portar essa operação, com vetores contra `lastTimeUpdates`, preservando séries já feitas e exercícios substituídos, protegendo alterações concorrentes e limpando apenas os rascunhos afetados. O código atual de treino e cache deve servir de base para essa continuação.

## Baralho durante o descanso

`RestCards.swift` contém somente tipos de valor e lógica pura. `BaralhoDescanso.swift` desenha cartas, valores e naipes em SwiftUI. Os naipes são geometria `Path` própria. A animação distribui e vira cartas, respeitando Reduzir Movimento. VoiceOver recebe o nome completo das cartas, o estado segurada e anúncios do resultado.

- Jogar uma mão aparece durante o descanso e abre uma folha com o relógio fixo acima da área rolável. Voltar ao treino fecha a mão. O seletor alterna Blackjack e Poker e guarda a preferência no aparelho em `@AppStorage("anilha.jogoDescanso")`.
- Cada mão começa com um baralho novo de 52 cartas, quatro naipes e valores de ás a rei. O embaralhamento recebe um `RandomNumberGenerator` injetável. O aplicativo usa `SystemRandomNumberGenerator`, e os testes usam um gerador determinístico.
- Blackjack distribui alternadamente duas cartas ao jogador e à banca. A segunda carta da banca fica virada até a resolução. Figuras valem dez. Um ás pode valer onze enquanto a soma couber em 21, com os demais valendo um. Naturais são resolvidos na distribuição, incluindo empate entre dois naturais. Pedir até 21 resolve a banca automaticamente. Estouro encerra a mão.
- **A banca pede abaixo de 17 e para em todo 17, inclusive o 17 macio**, com ás valendo onze. A mesma regra aparece na tela. Totais iguais empatam.
- Poker distribui cinco cartas e permite segurar qualquer subconjunto, inclusive nenhuma ou todas. Trocar faz a única troca e classifica a mão. As categorias são carta alta, par, dois pares, trinca, sequência, flush, full house, quadra, straight flush e royal flush. A sequência aceita A-2-3-4-5 e 10-J-Q-K-A. K-A-2-3-4 fica fora das sequências.
- `RestGameState` mantém apenas a mão corrente, o prazo absoluto e o estado pronto em memória. A preferência de modalidade é a configuração local persistida. O jogo é recreativo e local.
- Vencer o prazo, pular o descanso ou substituí-lo fecha a mão. Cada ação verifica o horário antes de jogar. A expiração descarta a mão incompleta, aciona `sensoryFeedback` na transição para pronto e mostra Próxima série. O botão Voltar ao treino permite acessar os controles durante a mão.

## Testes Swift preparados

`RestCardsTests.swift` adiciona **16 métodos**, totalizando **46 métodos** no pacote recebido. Cobrem os seguintes casos.

- Baralho completo, IDs e cartas únicos, quatro naipes, gerador repetível e esgotamento.
- Um ou vários ases, mão macia e dura, natural e estouro.
- Banca em 16, 17 duro, 17 macio, mudança de 16 macio para duro com novas compras, vitória, derrota e empate.
- Naturais simultâneos e ações após resultado, chegada a 21 e resolução automática.
- Todas as categorias do poker, ordem inversa das cartas, ases baixo/alto, falsa sequência circular, entradas inválidas e duplicação.
- Segurar nenhuma, algumas ou todas, uma troca e imutabilidade após resultado.
- Prazo exato, arredondamento do último segundo, retorno após suspensão, ação depois do fim, pular, encurtar, estender, novo descanso, reabrir prazo vencido e fechamento manual.
- Consumo do prazo produzido por `Workout.restEnd` e término ao limpar os campos existentes da sessão.

`swift test --package-path ios/AnilhaCore` foi tentado e falhou antes de iniciar, com comando ausente neste Windows. Esses testes continuam **PREPARADOS E NÃO EXECUTADOS** nesta intervenção. O workflow existente roda o pacote antes do archive. Compilação Swift 6, SwiftUI, notificações e interação Apple dependem do próximo CI e do aparelho.

## Validações locais reais

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Passou, incluindo check-text nos arquivos Swift. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou, build do PWA em `dist`. |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | Passou com **825 testes em 68 arquivos** na repetição final. A primeira execução tinha 823, antes dos dois checks estruturais novos. |
| `npx vitest run src/engine/__tests__/iosDemo.test.ts --maxWorkers=1 --no-file-parallelism` | Passou, cinco checks. Incluem a matriz de captura e a remoção da cor global com o estilo compartilhado. |
| `node scripts/generate-ios.mjs --check` | Passou. |
| `node scripts/build-analysis.mjs --check` | Passou. |
| `C:/Program Files/Git/bin/bash.exe -n ios/scripts/capture-screenshots.sh` | Passou. |
| `git diff --check` | Passou. |
| E2E móveis de `analysis.spec.ts`, `ios-treino.spec.ts`, `screens.spec.ts` e `foco-treino.spec.ts` | **Oito cenários passaram em duas execuções**, ambas encerradas com saída zero após tratar o teardown descrito abaixo. A segunda inclui a expectativa explícita de `0,0003395`. |

Os E2E usaram a API e o banco locais, com a build/preview em `.local/e2e-dist`. O bundle `client` contém `http://127.0.0.1:54329`. A build normal terminou antes de iniciar os E2E. A fixture de payload nativo exercitada aqui é a gerada pelo PWA, como no ambiente Windows anterior.

### Falhas e recuperação do ambiente

1. A primeira tentativa de E2E falhou antes dos cenários. `tsx` chama `os.userInfo()` ao definir sua pasta temporária. O Node devolveu `uv_os_get_passwd` com `ENOMEM`. A mesma chamada falhou isoladamente, com aproximadamente 3 GB livres.
2. A recuperação usou um preload temporário em `.local/e2e-os-userinfo.cjs`, herdado apenas pelos processos daquela execução via `NODE_OPTIONS`. Ele captura especificamente a falha `uv_os_get_passwd` e fornece um usuário sintético para a pasta temporária do tsx. O ambiente é limpo ao retornar o comando. A reprodução em Windows pode criar o arquivo ignorado com este conteúdo.

```js
const os = require('node:os');
const original = os.userInfo;
os.userInfo = function (options) {
  try {
    return original(options);
  } catch (error) {
    if (error.info?.syscall !== 'uv_os_get_passwd') throw error;
    return { username: 'anilha-local-e2e', uid: -1, gid: -1, shell: null, homedir: os.tmpdir() };
  }
};
```

O comando efetivamente usado foi o seguinte.

```powershell
$env:NODE_OPTIONS='--require=./.local/e2e-os-userinfo.cjs'
try {
  npx playwright test tests/e2e/analysis.spec.ts tests/e2e/ios-treino.spec.ts tests/e2e/screens.spec.ts tests/e2e/foco-treino.spec.ts --project=mobile
} finally {
  Remove-Item Env:NODE_OPTIONS
}
```

3. Em ambas as execuções aprovadas, o Playwright terminou os oito cenários e ficou aguardando os servidores no Windows. Foram conferidos os listeners e os horários dos processos. Só os servidores locais da execução foram encerrados, permitindo a saída zero do runner. Na primeira, os PIDs eram 3436 e 32204, iniciados às 13h33. Na segunda, 28468 e 30928, iniciados às 13h36.
4. `bash` estava fora do PATH. A checagem passou pelo executável instalado com o Git. `swift` está ausente. Uma tentativa inicial de edição via Python falhou por comando ausente. Uma passagem de texto Unicode por pipe do PowerShell alterou acentos em trechos novos de `TreinoView.swift`. A revisão detectou isso e os textos foram corrigidos por patch UTF-8 antes dos checks finais.

## Capturas e inspeção

O script de captura usa **15 telas x dois temas x dois tamanhos, 60 PNGs esperados**. As quinze telas são `entrar`, `hoje`, `fichas`, `ficha`, `treino`, `treino-lista`, `descanso`, `esforco`, `blackjack`, `poker`, `proxima`, `resumo`, `evolucao`, `analise` e `historico`. Os temas são claro/escuro e os tamanhos `.large`/`.accessibility3`.

| Tela nova ou alterada | Conteúdo a conferir nos PNGs |
| --- | --- |
| `treino` | Foco padrão, nome sintético de ficha, cronômetro, aquecimento e ação circular. |
| `treino-lista` | Cartão atual, sugestão, séries compactas e controles únicos no painel. |
| `descanso` | Contagem em foco, controles de 15 segundos, progresso e Jogar uma mão. |
| `esforco` | Quatro chips numa única linha durante o descanso. |
| `blackjack` | Mão de 16 contra banca com carta virada, relógio e Pedir/Parar. |
| `poker` | Cinco cartas com as posições 0 e 2 seguradas, relógio e Trocar. |
| `proxima` | Prazo da fixture já vencido, resolvido pelo próprio estado do descanso, e Próxima série. |
| `hoje`, `evolucao`, `analise` | Treino ativo destacado, data legível, título de Evolução único e vírgula decimal no custo. |

As fixtures usam somente nomes do catálogo e valores sintéticos. O modo Debug preserva a raiz isolada de conta e o bloqueio de interação. Os novos estados de cartas usam um baralho ordenado para apresentação repetível. A captura `treino` começa com dois aquecimentos e zero séries de trabalho feitas.

O ZIP e o manifesto continuam no fluxo de artefato/Release existente. O workflow permite continuar o archive se a captura falhar, então o Claude deve conferir os **60 registros `captured`** e as imagens. A nova matriz aguarda execução do CI desta árvore.

Os E2E atualizaram as capturas locais do PWA, incluindo `05-sessao`, `06-sessao-descanso`, `190-foco-descanso`, `191-foco-serie` e as capturas 208/209 de análise/evolução. Foram vistas as referências 05/06 e a proposta 208 com custo decimal em pt-BR. Os arquivos estão em `artifacts/screens`, pasta ignorada. A inspeção da captura longa 208 conserva o enquadramento de página inteira com a barra fixa do viewport, conforme o teste existente.

## Conferência solicitada ao Claude

1. Revisar o diff e o comportamento desta árvore a partir de `1c96097`, incluindo o arquivo residual aproveitado e os dois checks TS estruturais. Registrar a revisão mútua efetiva.
2. Obter compilação Swift 6 estrita e execução dos 46 métodos no CI. Conferir `BotaoPrincipalAnilha`, bindings do editor, tarefas de rascunho, duas folhas e passagem de sessão ativa para resumo.
3. Obter os 60 PNGs, conferir o manifesto e inspecionar temas e fonte grande. Validar o layout também num iPhone estreito, pois o script atual prefere Pro Max.
4. Validar VoiceOver, entrada com vírgula, Reduzir Movimento, teclado, restauração do rascunho, contagem ao bloquear/encerrar e reabrir, término do jogo em primeiro plano e retorno da tela bloqueada, aviso local e vibração.
5. Validar concluir série, bi-set, esforço, troca após séries feitas, concluir treino e fila/sync no aparelho, usando o fluxo local de aceite da parte B.
6. Resolver a dependência **Ignorar sugestão**, com a autorização e os testes de lógica descritos acima. Esse item mantém a entrega funcional completa pendente.
7. Fazer o commit e seguir o fluxo de envio autorizado pelo Caio a partir deste checkout. A evidência desta intervenção está nos arquivos versionáveis, nos comandos e nos resultados deste parecer.

## APIs Apple conferidas

As assinaturas de `TimelineView`, `onChange` com dois valores, `sensoryFeedback` condicionado, rotação 3D, botão por papel/configuração e anúncio acessível foram consultadas na documentação oficial. As declarações novas usam essas APIs com disponibilidade compatível com o destino do projeto. [TimelineView](https://developer.apple.com/documentation/swiftui/timelineview), [onChange](https://developer.apple.com/documentation/swiftui/view/onchange(of:initial:_:)-4psgg), [feedback condicionado](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(_:trigger:condition:)), [rotation3DEffect](https://developer.apple.com/documentation/swiftui/view/rotation3deffect(_:axis:anchor:anchorz:perspective:)), [PrimitiveButtonStyleConfiguration](https://developer.apple.com/documentation/swiftui/primitivebuttonstyleconfiguration), [Button com papel](https://developer.apple.com/documentation/swiftui/button/init(role:action:label:)), [glassProminent](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glassprominent), [anúncio acessível](https://developer.apple.com/documentation/accessibility/accessibilitynotification/announcement).
