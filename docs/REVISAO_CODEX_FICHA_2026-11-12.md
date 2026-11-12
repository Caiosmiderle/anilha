# Fichas e Ignorar no iPhone 0.16.0

Codex, 12/11/2026. Branch `codex/ios-ficha`, recebida limpa em `e39602b`, com chat `4dfa9f2`. Lidos o topo do handoff, parecer do chat, README, arquitetura e decisões. Revisados o catálogo do Claude em `42b9298`, sua gravação de exercícios próprios e os caminhos de ficha, fila e execução contra o PWA. Entrega no checkout local. Claude deve revisar e commitar. Revisão mútua desta entrega **PENDENTE**.

## Alterações

- `FichasView.swift` abre Nova ficha e Editar. `EditarFichaView.swift` mantém rascunho até Salvar, confirma descarte e exclusão, edita nome/divisão, séries, aquecimento, faixa, descanso e nota. Catálogo nativo compartilhado para adicionar, com busca, filtros e criação de exercícios próprios. Lista permite mover e remover. Remover ou separar parceiros desfaz o bi-set.
- `RoutineEditing.swift` reutiliza `WorkoutAnalysis.fichaChanges`. A função compartilhada agora aceita nota, aquecimento e bi-set explícitos. Campos ausentes conservam o comportamento do chat. Padrões de adição portados de `targetFor`/`restFor`, limites de `ItemSheet` e normalização da faixa invertida.
- `CacheLeitura.swift` permite `routines`, grava ficha, itens e fila na mesma transação e compara o snapshot de abertura para detectar edição concorrente. Snapshot fica em `@State` para resistir à reconstrução da view. Exclusão grava lápides da ficha e dos itens, conforme `Trainings.tsx`. Extraídas somente a ficha vazia e a construção dessas lápides para `src/data/routineEditing.ts`, também chamado pelo PWA e pelos vetores.
- `ExecucaoTreino.swift` mostra Ignorar em foco e lista, com alvo mínimo de 44 pt e acessibilidade pedida. `dismissed:<sessão>` fica nos metadados locais por conta. `increase`/`decrease` com histórico restauram somente séries de trabalho pendentes. Séries restauradas, invalidação dos rascunhos, fila e estado ignorado são atômicos. Outros tipos salvam só o metadado. A view relê o rascunho após a operação, preservando ajustes que continuam válidos.
- Avisos existentes de `WorkoutAnalysis.risks` usam as frequências do plano e os itens em edição. O parâmetro opcional `afterRoutine` considera também mudança de divisão. Aviso específico de frequência sem porta identificada continua **PENDENTE**. Ficha pessoal nova tem frequência zero pela regra existente.
- Demo Debug `ficha-nova` e `ficha-editar` e sugestão visível na execução. Script conserva as telas anteriores e acrescenta as duas novas. Versão em `project.yml` passa a **0.16.0**. `nova_ficha` do chat conserva o encaminhamento ao site.

## Achados e evidência

- **P2, divergência estática confirmada**, `Progression.swift`, `LoadSuggestion.last`. Com `values=[12,10,8]` e `loads=[20]`, o código anterior repetia 20 nas últimas posições. `lastTimeFill` do TS devolve carga nula, pois o índice é limitado por `values`. Corrigido o acesso compartilhado, com vetores para cargas curtas e valores vazios. TS executado, reprodução em runtime Swift pendente.
- **P2, lacuna funcional confirmada por leitura**, `CacheLeitura.swift`. `routines` estava fora da lista gravável e `gravar([])` descartava metadados. Isso impedia ficha manual e Ignorar sem restauração. Corrigidos os dois caminhos. Testes Swift preparados para fila, rollback, persistência em disco e isolamento. Execução Apple pendente.
- Nenhum outro bug anterior do Claude confirmado no escopo revisto. Compilação e comportamento visual nativos continuam sem evidência neste Windows.

## Validações reais

- Passaram os **71 testes TS em 13 arquivos** do passo vitest de `.github/workflows/ios.yml`, incluindo `iosRoutines.test.ts`. Após ampliar bordas de histórico e os vetores da fila, os dois testes novos passaram novamente.
- `routines.json` vem do TS real, com **36 padrões de adição, 7 criações/edições, 1 exclusão, 14 restaurações e 4 cenários de fila**. Inclui próprio, reordenação, remoção parcial/total, nota, aquecimento, bi-set, faixa invertida, tempo, carga nula, histórico ausente e série já feita.
- Passaram `npm run lint`, `npm run typecheck`, `npm run build`, `node scripts/generate-ios.mjs --check`, `node scripts/build-analysis.mjs --check`, `node scripts/build-review.mjs --check`, Bash `-n` da captura e `git diff --check`. Os checks finais após a ampliação dos vetores estão registrados no handoff.
- Falhas intermediárias corrigidas no gerador novo, import inicial `suggest` inexistente e inferência de `split_key` como string. Gerador e typecheck passaram após correção.
- `swift test --package-path ios/AnilhaCore` foi tentado e não iniciou, pois `swift` está ausente. **Quatro métodos Swift novos preparados e sem execução**. Sem Xcode, simulador, prints nativos, iPhone, VoiceOver, Dynamic Type ou sync remoto nesta intervenção. E2E não executado. Checks locais não comprovam produção.

## Continuação pelo Claude

Revisar o diff e executar CI Apple com Swift 6 estrito/iOS 26. Conferir os quatro métodos novos, a proteção de snapshot e os chamadores existentes de `fichaChanges`/`last`. Conferir prints de ficha nova/editada e execução, claro/escuro e fonte grande. No aparelho, criar com exercício próprio, editar e mover/remover um parceiro, salvar offline, reabrir e sincronizar com o PWA. Conferir exclusão com histórico preservado e conflito após edição no PWA. Em execução, ajustar uma série, ignorar uma progressão, fechar/reabrir e verificar valores, rascunhos, série feita e isolamento de outra sessão/conta.
