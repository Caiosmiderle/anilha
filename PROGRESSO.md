# Progresso da missão: terminar o Anilha

Mantido pelo Claude, atualizado a cada item. Última atualização: 12/11/2026, noite.

## Feito

- **E1 (logs):** a leitura de força (`GET /forca` da função `troca-crunning`) já foi chamada em produção pelo CRUNNING do Caio em 12/11 às 18:34 e 21:04 UTC, as duas com status 200. Nenhum erro registrado.
- **E2:** o limite de "perna pesada" está numa constante só, `ConflitoForca.seriesPesada = 6` (`crunning-app/CrunningCore/Sources/CrunningCore/Plano/ConflitoForca.swift`). Para calibrar, é só mudar esse número.
- **E3:** CRUNNING 0.21.0 (commit `53e0ca3`, build 57). O chat do coach, a revisão semanal, a revisão do plano novo e a criação do plano recebem a força do Anilha (14 dias para trás e para frente, só agregados), com a regra de perna pesada por até 48 h (Doma e colegas, 2017 e 2019).
- **C12 (dossiê):** `docs/DOSSIE_LGPD_ADVOGADO.md`, com o mapa de dados por funcionalidade, o que vai para a Anthropic, as sugestões de base legal justificadas e as perguntas para o advogado. No app, tudo continua "a definir".

## Em andamento

- **A1:** build 0.10.0 (revisão da ficha pelo Sonnet e corridas nos contextos) no CI, publicada pelo nome `codex/ios-revisao-ficha` (o CI só dispara em `codex/ios-*`). Ao passar: publicar `analise-treino` ampliada e depois `revisao-ficha`.
- **A2:** o Codex está fazendo a memória das análises e a dica do Waltér na tela de foco (0.11.0), na branch `codex/memoria-analise`.

## Decisões tomadas

- **Pasta separada para o Claude:** `../anilha-claude` (git worktree, branch `claude/missao`), para não mexer nos arquivos que o Codex está editando em `anilha-publico`.
- **CI:** o workflow só dispara em `claude/ios-*` e `codex/ios-*`. Branches com outro nome são publicadas também com um nome nesse padrão. Na integração, o padrão passa a aceitar `claude/**` e `codex/**`.
- **Rollback da função de troca (C10):** a versão publicada hoje (v1) é o conteúdo do commit `e81ef2a`, só compactado na hora de publicar. Voltar = republicar `index.ts`, `core.ts` e `engine.generated.ts` daquele commit.
- **Publicação:** sempre o servidor antes dos clientes, com o servidor aceitando o formato antigo e o novo.

## Depende do Caio

- **E4, Apple ID gratuito:** o Anilha e o CRUNNING vencem 7 dias depois de cada instalação. Para renovar: abrir o Sideloadly no PC, ligar o iPhone no cabo, escolher o `.ipa` mais recente de cada app (pasta `C:\Users\caiog\crunning-artifacts\ipa` e `...\anilha-ipa`), entrar com o mesmo Apple ID e instalar por cima. Os dados ficam.
- **C12, advogado:** levar `docs/DOSSIE_LGPD_ADVOGADO.md`. Depois da resposta, o Claude troca "a definir" pelas bases aprovadas e sobe a versão dos termos.
