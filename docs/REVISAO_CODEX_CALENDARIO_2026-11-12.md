# Calendário, revisão do Codex em 12/11/2026

Branch `codex/ios-calendario`, origem `814ea28`, recebida limpa. Conferidos handoff, parecer da 0.6.0, roadmap, arquitetura, decisões recentes, diff do Claude e caminhos reais de projeção e sync. Entrega local iOS **0.7.0**, com revisão e commit pelo Claude conforme pedido do Caio.

## Implementação e origem dos dados

| Dado | Fonte e tratamento |
| --- | --- |
| Força feita | `sessions`, status `done`, sem lápides. Título e divisão da própria sessão, inclusive ficha arquivada, com link ao detalhe existente. Várias sessões no mesmo dia permanecem visíveis. |
| Força prevista | `projectDays`, de `src/engine/weekView.ts`, já usado por `WeekPlan` no Plano e portado em `Planning.swift`. Usa plano vigente da semana via `planForDay`, rodízio, histórico e `day_overrides`. A ficha vem de `routines`, com preferência pela ficha do plano, incluindo inferência de origem antiga. |
| Corrida feita | `runs`, incluindo CRUNNING, manual e importação. Apenas atividade corrida, com compatibilidade para atividade ausente. Tipo original quando disponível, distância em km e ID real. Abre `RunSheet` existente no PWA e detalhe de leitura nativo. |
| Corrida planejada | `external_plan_items`, origem CRUNNING e tipo corrida. Exibe `planejada` e `perdida`, com nome, tipo, distância e `important`. Metros convertidos em km, zero preservado e desconhecido continua ausente. `feita` usa o registro de `runs` para apresentação. |
| Aviso de véspera | Extraído `legsBeforeRunAlert` de `recommend.ts` e reutilizado na recomendação e nos dias com perna prevista. Mesmos guardas, opt-out, precedência da corrida externa importante e textos. Porta Swift em `AnilhaCore`, coberta pelos vetores. |
| Sync nativo | `ReadSync.tables` já contém `runs` e `external_plan_items`. `ContaStore.pull` usa `sync_pull`, valida o dono, e `CacheLeitura.aplicar` guarda ambas pelo envelope existente. A tela lê esse cache. |

`calendarDays` é pura e está portada como `TrainingCalendar.days`. Quinze vetores saem da execução TS e são verificados pelos testes Swift. Incluem duas modalidades no mesmo dia, múltiplas sessões, lápides, nulos/zero, origem antiga de ficha, trocas, opt-out, aviso local/externo, mudança de plano, mês passado/seguinte e fevereiro bissexto.

PWA em `/historico/calendario`, com entradas em Histórico e Plano, grade mensal, hoje, seleção e pontos independentes. iPhone com aba Calendário, componentes e cores Harbor, VoiceOver, tamanho de texto dinâmico, atualização e detalhes. Sem mudança de esquema ou backend. Decisão híbrida registrada no roadmap.

## Escopo e decisões de apresentação

- A força prevista representa o planejamento de `projectDays`. Esse calendário usa a projeção sem `todayRec`, como o caminho nativo de planejamento. A tela Hoje do PWA continua aplicando sua recomendação completa de fadiga. A legenda avisa que a previsão muda com o histórico e as trocas. Nenhuma conclusão futura é simulada.
- O calendário sinaliza a regra de véspera nas fichas de perna que a projeção mantém. O rodízio já desvia de perna antes de corrida local quando há outra ficha. A chegada de corrida externa importante preserva a projeção existente e acrescenta o aviso para a pessoa decidir.
- `runs` não possui campo de importância. A marca aparece nos itens externos que a informam. A conclusão do planejado depende do status enviado pelo CRUNNING. Itens ainda `planejada` e uma corrida real no mesmo dia aparecem separadamente, pois o contrato não garante associação individual.
- Outros cardios continuam no Histórico existente. Sem plano aplicável não se inventa ficha futura. Chat, edição de ficha, demais etapas híbridas e Ignorar sugestão da 0.6.0 ficam no escopo das respectivas entregas.

## Revisão do trabalho recebido

P2 confirmado na fonte, em `src/engine/__tests__/iosDemo.test.ts`. O commit do Claude `814ea28` mudou a captura para `sizes` configurável, mas o teste ainda exigia o literal `for size in large accessibility3`. Corrigida a expectativa para o contrato atual. O teste também exige as duas novas telas na matriz. Revisão estática do job separado e do caminho de pull concluída. Runtime do simulador permanece pendente.

## Validações reais

| Comando | Resultado local |
| --- | --- |
| `npm run lint` | Passou, incluindo textos. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou. |
| `npx vitest run src/engine/__tests__/calendar.test.ts src/engine/__tests__/recommend.test.ts src/engine/__tests__/weekView.test.ts src/engine/__tests__/iosArtifacts.test.ts src/engine/__tests__/iosDemo.test.ts --maxWorkers=1 --no-file-parallelism` | 34 testes em cinco arquivos passaram. |
| `swift test --package-path ios/AnilhaCore` | Tentado, comando ausente no Windows. Dois métodos novos preparados, com 15 vetores, ainda sem execução. |
| E2E `npx playwright test -c playwright.node.config.ts tests/e2e/calendario-integrado.spec.ts --project=mobile` | Passou na árvore final, após uma execução anterior aprovada com a configuração normal e preload. API e banco locais, build em `.local/e2e-dist`. |
| `node scripts/generate-ios.mjs --check` | Passou. |
| `C:/Program Files/Git/bin/bash.exe -n ios/scripts/capture-screenshots.sh` | Passou. |
| `git diff --check` e `node scripts/check-text.mjs` | Passaram na conferência final. |

Falhas reais. A tipagem rejeitou `source: manual` na fixture de sessão, corrigido para `summary`. A primeira execução E2E tentou esperar o indicador de sync na subpágina CRUNNING, onde ele não aparece. A espera foi movida para Hoje. O teste passou na repetição e novamente após o acabamento visual. As duas primeiras execuções usaram o preload local já documentado no parecer da 0.6.0 para `os.userInfo` no Windows. A final usou `playwright.node.config.ts`, sem preload, com a alternativa de API local versionada. O teardown aguardou processos dos servidores mesmo após terminar o cenário. Conferidos portas e horários, encerrados apenas processos destas execuções. A leitura de processos por CIM foi negada, e a conferência usou `netstat` e `Get-Process`.

## Evidências e pendências

Quatro capturas PWA em `artifacts/screens/210-calendario-dia-{claro,escuro}.png` e `211-calendario-mes-{claro,escuro}.png`, pasta ignorada. Inspecionadas claro/escuro, com as duas modalidades e cores de grupo. Ajustado o espaço do título da lista após a primeira inspeção.

Demo Debug inclui corrida feita e longão planejado fictícios. CI ampliado com `calendario` e `calendario-dia`, em claro/escuro. A matriz atual espera **34 PNGs** com texto normal, ou **68** ao pedir também `accessibility3`. Quatro PNGs normais são novos. O CI continua podendo publicar o IPA apesar de falha na captura, portanto conferir manifesto e imagens.

Claude deve revisar o diff e os 15 vetores, executar Swift 6 estrito/iOS 26, conferir quatro capturas novas e fonte grande, testar VoiceOver, seleção de dias, detalhes, migração e pull no aparelho, e registrar a revisão mútua. Compilação Apple, prints nativos, IPA e aceite em iPhone desta árvore estão pendentes. Tudo permanece no checkout para a passagem ao Claude.
