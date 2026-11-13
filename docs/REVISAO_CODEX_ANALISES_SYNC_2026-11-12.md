# Análises por conta no iPhone 0.17.0

Codex, 12/11/2026. Branch recebida limpa `codex/ios-analises-sync`, base `e95b21f7d4ef613f20bcc746b2755a7f181edc9b`. Lidos handoff, parecer da ficha, README, arquitetura e decisões recentes. Auditados o diff do Claude, migração 22, sincronização TS e formatos dos dois clientes. Entrega local, sem escrita em `.git`, commit, push ou produção. Revisão do Claude desta entrega **PENDENTE**.

## Entrega e achados

- `AnalysisSync.swift` porta payload, merge e comparação determinística. Remove `undo` e os equivalentes nativos `undoBefore`/`undoAfter`, inclusive nas decisões. Mantém o desfazer local somente com status igual. O fingerprint usa JSON ordenado local, não depende da ordem de dicionários nem precisa compartilhar bytes com o hash do site.
- `CacheLeitura.swift` guarda cursor e hashes nos metadados por dono, confirma o conteúdo oferecido e aplica cada página com seu cursor atomicamente. Edição em voo diferente do servidor fica pendente. `ContaStore.swift` envia lotes de 50, puxa páginas de 200 após o último `sync_pull`, confere conta/geração antes e depois da rede e fixa o token. Erro deste complemento fica isolado do aviso principal. Saída usa a limpeza existente. Só `analysis:` e `review:` entram.
- **P1, incompatibilidade confirmada por leitura:** revisão nativa usa versão objeto e binding; site exige versão string `[routine, items]` e `exercises`. Uma cópia direta invalidaria cache/decisões. Adaptados os dois sentidos, preservando slots originais. Vetor usa `reviewVersion` real. Execução Swift ainda pendente.
- **P2, falha confirmada por leitura:** `AnalysisCard.tsx` acessava `saved.reply.adjustment` mesmo para `{status:'pending'}` recebido do iOS. Os caches de `requestAnalysis` e `requestReview` também aceitavam tentativa sem resposta. Cartões e caches agora exigem resposta. Testes existentes ampliados com `pending` e `requesting` passaram. Sem reprodução visual em navegador.
- Botão de desfazer da revisão nativa só aparece com snapshot deste aparelho. Nenhuma alteração na migração, RPC, dependências ou motor. Versão em `ios/project.yml`: **0.17.0**.

## Validações reais e limites

- Passaram os **80 testes em 16 arquivos** do passo TS atualizado de `.github/workflows/ios.yml`, com execução serial. Inclui `iosAnalysisSync.test.ts`, os dois testes de sync do Claude e `src/sync/**` nos paths, já existente. Depois de ampliar os estados incompletos, passaram novamente os **18 testes** dos dois arquivos afetados.
- Passaram `node scripts/generate-ios.mjs --check`, `node scripts/build-analysis.mjs --check`, `node scripts/build-review.mjs --check`, `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check`. Lint/typecheck repetidos só após mudanças posteriores.
- Fixture `analysis-sync.json`: quatro payloads, quatro merges, seis ciclos reais de `syncAnalyses`, chaves excluídas e adaptação da revisão. Quatro métodos Swift preparados para paridade, edições em voo, undo, disco, isolamento, limpeza e cursor inválido.
- Falhas intermediárias corrigidas: gerador importava `import.meta.env` sem shim; primeira configuração do shim usava opção inválida do Rolldown. Typecheck precisou da referência Vite no gerador TS. Resta aviso não impeditivo de import dinâmico também estático no bundle de fixtures.
- `swift test --package-path ios/AnilhaCore` não iniciou: Swift ausente neste Windows. **CI Apple, Swift 6 estrito/iOS 26, iPhone e troca real entre clientes PENDENTES**. E2E não executado. Os checks locais não validam produção.

Claude deve revisar e commitar esta árvore, executar o CI Apple e testar conta A/B e saída durante RPC, análise/revisão entre site e iPhone, edição durante envio, reinício e ausência de desfazer no outro aparelho. Continuar da base acima com os arquivos locais; não há hash remoto novo.
