# Histórico iOS 0.8.0, Codex, 12/11/2026

Branch `codex/ios-historico`, origem `116ddd4`, recebida limpa. Entrega somente neste checkout. Claude revisa e commita, conforme instrução do Caio sobre `.git`. Não houve acesso a produção, alteração de backend, dependência nova ou modificação dos repositórios vizinhos.

## Por parte e fonte dos números

| Parte | Entrega e origem |
| --- | --- |
| Treinos | `HistoricoView`, seletor no topo, subtítulo e vazio do PWA, calendário de realizados com seleção, contagem de dias, meses anteriores, grupos semanais e estado do plano. Sem limite de 20 entradas. Sessões concluídas, título/divisão da sessão, duração, exercícios feitos, séries concluídas de trabalho, pulados e registro resumido seguem `History.tsx` e seus hooks. Corridas/cardios incluem origem CRUNNING, distância, duração e ritmo da modalidade conforme `cardio.ts`. O toque na força usa o detalhe existente `TreinoView`, com Evolução e Análise; cardio abre consulta. |
| Progresso | Mesma ordem: exercício, séries por grupo nesta semana e até 12 recordes sincronizados. `buildExerciseLogs` já portado como `Workout.logs`; novos `sessionBest` e `estimate1RM` reproduzem `records.ts`. Seleção e gráficos seguem `ExerciseProgress.tsx`, incluindo carga, tempo/repetições, Epley até 12 reps, volume da última e data. Grupos de `weeklyGroupSets`, com taxonomia gerada do TS. Retorno usa `Workout.returning`, já existente, e limite de 10 do PWA. Estados vazios preservados. Swift Charts para linhas, barras e limite tracejado. |
| Semanas | Até 12 semanas, mesmas condições de inclusão, ordem, descanso, academia/cardio, percentual limitado por modalidade e estados. Porta dos campos exibidos de `weekReport`, `adherencePct`, `countedCardio` e `planForDay`. Outro cardio ocupa só vagas restantes de corrida; o plano vale para a semana até domingo, inclusive quando começou no meio dela. Não se portou o texto narrativo de `weekReport`, que esta tela não usa. |
| Corpo | Mesma ordem: registrar, Peso, Cintura e Registros, com paginação de 12. Porta de `bodyTrend`/`weeklyAverages`: médias, janela recente de seis semanas, até quatro médias para ritmo, cintura e textos por objetivo; exclusão de futuro/lápides na tendência. Linha das últimas 12 médias com peso e conversão kg/lb igual ao PWA. Criar, corrigir e apagar reproduzem `BodySheet`/`saveBodyLog`/`deleteBodyLog`, inclusive peso anterior no novo registro, cintura vazia, data e limites. |

`History.swift` contém as funções puras; `scripts/ios-history-source.ts` executa o motor TS real. `history.json` tem **12 cenários de semanas/progresso/volume e 11 de corpo**, incluindo vazios, unidades, planos, excesso, cardio substituto, pendências, nulos, tempo, peso corporal, leve/aquecimento, Epley, datas e textos por objetivo. Cinco métodos Swift preparados: três de paridade/validação e dois de cache/fila. Ainda sem execução Apple.

## Consentimento e sincronização

- Mesma condição de `useHealthOn`: apenas `saude.granted === true`; desconhecido e negado ficam desligados. Não se criou exigência de versão de saúde que o PWA não faz. O modo Debug é fictício e permite saúde só em memória, sem abrir conta ou rede.
- `consent_state` é consultada antes do push, com token e geração da conta fixados. Última resposta fica nos metadados existentes por dono e funciona offline. `record_consent` existente permite ligar saúde pelo mesmo aviso do PWA, com a versão já usada no TS. Nenhuma RPC nova. A revogação continua pelo site, na futura entrada Você > Privacidade que o Claude integrará.
- Revogação recebida limpa corpo e sua fila, além das demais cópias de saúde presentes no cache, conforme `wipeHealthLocal`. Pull não repõe corpo enquanto a negativa persistir. A interface fecha o editor se a permissão cair. O servidor existente também recusa saúde sem consentimento; falha de rede ao consultar a escolha conserva a última resposta, como no PWA.
- Confirmadas `profiles`, `plans`, `sessions`, `session_items`, `sets`, `runs`, `exercises` e `records` no pull/cache existentes. **`body_logs` faltava**, agora incluída no mesmo envelope. Versão de tabelas 2 força uma releitura com cursor anterior de retenção e pendências preservados. Escritas de corpo passam por `ContaStore.gravar`, `CacheLeitura.gravar`, carimbo monotônico, fila/ACK e `sync_push` da parte B. O cache exige consentimento e valida o registro também quando chamado fora da UI. Sem entidade SwiftData nova.

## Revisão e limites

Revisão estática do caminho herdado e diff de origem, com o parecer da 0.7.0. P2 confirmado na fonte: `ReadSync.tables` ignorava corpo e `CacheLeitura.gravar` recusava a tabela; cenário: receber ou enfileirar `body_logs`. Corrigidos inclusão, replay e guardas. Sem reprodução Apple ou perda observada no aparelho.

A `TabView` de `AnilhaApp.swift` permanece intacta. Decisão das quatro abas registrada no roadmap. Claude integra Hoje, Plano, Histórico e Você depois. A tela não ganhou repetir/apagar treino ou editar/apagar cardio do PWA: são operações além da lista/detalhe nativos solicitados; ficam explicitamente pendentes de uma entrega dessas ações. Os campos numéricos de Corpo usam teclado decimal nativo em vez dos steppers do PWA. Os mesmos valores, limites e preenchimentos são preservados.

Demo Debug inclui as quatro partes, dados sintéticos e data fixa. Matriz `historico`, `historico-progresso`, `historico-semanas`, `historico-corpo`, claro/escuro. São **40 PNGs** no conjunto completo com tamanho normal, ou **80** com `accessibility3`. Apenas a configuração foi preparada; não foram produzidos prints nativos neste Windows. O CI continua permitindo archive apesar de falha do job de capturas; verificar manifesto e imagens.

## Validações reais locais

| Comando | Resultado |
| --- | --- |
| `node scripts/generate-ios.mjs --check` | Passou. |
| `node scripts/build-analysis.mjs --check` | Passou. |
| `npx vitest run src/engine/__tests__/iosArtifacts.test.ts src/engine/__tests__/iosDemo.test.ts src/engine/__tests__/iosHistory.test.ts src/engine/__tests__/calendar.test.ts src/analysis/__tests__/analysis.test.ts src/analysis/__tests__/evolution.test.ts tests/db/analysis.test.ts --maxWorkers=1 --no-file-parallelism` | **45 testes em sete arquivos passaram**, exatamente o passo TS do workflow atualizado. Inclui teste das quatro partes da demo e números calculados pelo motor. |
| `npm run lint` | Passou, incluindo verificação de textos Swift. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou. Build local do PWA, não valida o app Swift ou produção. |
| `swift test --package-path ios/AnilhaCore` | Tentado, não iniciou: comando Swift ausente neste Windows. |
| `C:/Program Files/Git/bin/bash.exe -n ios/scripts/capture-screenshots.sh` | Passou. |
| `git diff --check` | Passou. |

Limitações: `rg` ausente, usadas buscas PowerShell. E2E não alterados nem executados nesta intervenção; nenhum servidor ou banco de produção foi usado. Os cinco métodos Swift novos, incluindo reabertura da fila, edição durante ACK, apagar, negativa e replay, aguardam CI no Mac. Checks TS passaram antes da última mudança exclusivamente Swift de `LazyVStack` e comentário do replay; não foram repetidos sem necessidade.

Claude deve executar Swift 6/iOS 26 e paridade no Mac; conferir prints, Charts, fonte grande, VoiceOver e teclado; testar criar/corrigir/apagar corpo offline, reabrir, enviar/conferir no PWA e revogar no site com fila pendente. Runtime Apple, aparelho e **revisão mútua do Claude PENDENTES**. Sem commit, push, merge ou publicação pelo Codex.
