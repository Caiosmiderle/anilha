# Hoje do iPhone, Codex, 13/11/2026

Entrega local na branch recebida `codex/ios-hoje-ajustes`, base limpa `73b044e`, iOS **0.19.0**. Sem escrita em `.git`, commit, push ou produção. Claude revisa e commita. Revisão do Claude desta entrega **PENDENTE**.

## Alterações e revisão

- Itens 7 e 10 da auditoria: ações horizontais no cartão, seletores nativos com prévia, resumo/itens ajustados, desfazer e lista das fichas ativas, com alvos de 44 pt e acessibilidade. Com treino ativo, as entradas ficam ocultas. A lista usa `conta.comecar`; a entrada principal recalcula o ajuste antes de abrir. O toque longo conserva a prévia, agora com os itens do dia.
- `dayAdjustment.ts` contém as quatro funções puras extraídas de `data/today.ts`, que continua exportando e usando as mesmas funções. `ios-today-engine.ts` adapta as linhas ao `recommendDay`, `summarizeSessions`, seleção da ficha e ajuste reais. Reutiliza JavaScriptCore e `plan-engine.js`, offline. Ordena o catálogo como a leitura por chave do IndexedDB, pois empates de substituição/foco dependem disso. Nenhuma regra de escolha portada ou inventada no Swift.
- `Workout.start` recebe os itens opcionais e o resumo, mantendo o caminho original das outras fichas. A ficha original não muda; sessão, itens e séries continuam numa única gravação. `day_overrides` liberada em `CacheLeitura.gravar`, com validação das opções/consentimento e tombstone no desfazer, igual a `setDayOverride`.
- Saúde verificada na UI, no cálculo e na fila, com `History.healthOn`. Conta e data conferidas antes da escrita; troca de conta ou início de sessão fecha a folha. Sem nova tabela, coluna, RPC ou pacote.
- Revisão focada do Hoje recebido e do diff `6325189`: os textos P1 encaminhavam corretamente ao Plano, mas o Hoje ainda usava apenas a projeção, sem aplicar ajuste, e escolhia a primeira ficha de mesmo split. Agora usa a seleção do site, que prefere a ficha do plano. Cenário com ficha pessoal antes da ficha do plano coberto nos vetores TS.
- **P1, privacidade, confirmado por inspeção, runtime Swift pendente:** em `CacheLeitura.aplicar`, revogar saúde limpava o ajuste de articulação, mas um pull posterior podia reinseri-lo. A condição só excluía `body_logs`. Reproduzir no Apple: permitir saúde, gravar `spare_joint`, revogar e puxar a linha remota anterior. A condição agora também exclui esse ajuste; teste Swift preparado. Não alego reprodução no aparelho.
- Demo `hoje-ajuste`: dados fictícios em memória, sem sessão ativa, troca de barra calculada pelo motor e captura adicionada. Matriz principal com 31 telas, 62/124 PNGs previstos, além do passe pequeno de cartas existente. Nenhuma captura executada aqui.

## Validações reais

- Comando `npx vitest run` extraído e executado do passo TS de `.github/workflows/ios.yml`, com `--maxWorkers=1 --no-file-parallelism`: **85 testes, 18 arquivos, aprovados**. Inclui `iosToday.test.ts`, também nos `paths` do workflow.
- `npx vitest run src/engine/__tests__/recommend.test.ts --maxWorkers=1 --no-file-parallelism`: **12 aprovados**. Mesmo comando para `planning.test.ts`: **13 aprovados**.
- `iosToday.test.ts`: **3 aprovados**, repetidos após ampliar a ficha alternativa fictícia. Confere reprodutibilidade, bundle sem APIs externas, ordem invertida do catálogo e demo. Fixture com **43 cenários** do motor/opções e **25 escritas/desfazeres** gerados pelas operações reais do site.
- `node scripts/generate-ios.mjs --check`, `node scripts/build-analysis.mjs --check`, `node scripts/build-review.mjs --check`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` e Bash `-n ios/scripts/capture-screenshots.sh`: aprovados. Aviso existente de import estático/dinâmico de `src/sync/client.ts` na geração, sem falha.
- Falhas intermediárias corrigidas: import inicial do hook React pelo gerador causou erros de JSX no typecheck; faltava `run_type` na ficha sintética do plano; carimbos reais tornavam a fixture não reproduzível. Separação pura, campo e normalização corrigidos; checks posteriores passaram.
- **Quatro métodos Swift novos preparados:** paridade das opções/recomendação/itens; escritas e desfazer; abertura ajustada e outra ficha, preservação e bloqueio com sessão ativa; fila/ACK/rollback/consentimento/revogação/pull e isolamento entre contas.
- `swift test --package-path ios/AnilhaCore` tentado: comando ausente neste Windows. SwiftData, Swift 6 estrito, archive Release/iOS 26, capturas, VoiceOver, fonte grande, aparelho e sync real **PENDENTES**. Nenhum E2E executado nesta intervenção; checks locais não validam produção.

## Continuação pelo Claude

Revisar esta árvore sobre `73b044e`, especialmente ordem do catálogo, JSON/JavaScriptCore, início com itens ajustados, fila e saúde após revogação. Executar testes Swift e archive Release, conferir `hoje-ajuste` e testar ajustar, iniciar, desfazer e escolher outra ficha no iPhone. Os arquivos reservados `ExecucaoTreino.swift`, `TreinoView.swift`, `PerfilTreinoView.swift`, `PlanoNovoView.swift` e `PlanoView.swift` não foram alterados; `../anilha-claude` não foi acessado. Fazer o commit após a revisão, conforme o fluxo solicitado pelo Caio.
