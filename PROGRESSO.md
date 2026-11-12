# Progresso da missão: terminar o Anilha

Mantido pelo Claude, atualizado a cada item. Última atualização: 12/11/2026, 19h.

## Feito

- **E1 (logs):** a leitura de força (`GET /forca` da função `troca-crunning`) já foi chamada em produção pelo CRUNNING do Caio em 12/11 às 18:34 e 21:04 UTC, as duas com status 200. Nenhum erro registrado.
- **E2:** o limite de "perna pesada" está numa constante só, `ConflitoForca.seriesPesada = 6` (`crunning-app/CrunningCore/Sources/CrunningCore/Plano/ConflitoForca.swift`). Para calibrar, é só mudar esse número.
- **E3:** CRUNNING 0.21.0 (commit `53e0ca3`, build 57). O chat do coach, a revisão semanal, a revisão do plano novo e a criação do plano recebem a força do Anilha (14 dias para trás e para frente, só agregados), com a regra de perna pesada por até 48 h (Doma e colegas, 2017 e 2019).
- **C10:** `troca-crunning` republicada a partir dos arquivos exatos do repositório (versão 2, `verify_jwt` desligado, como antes). Comparação de caixa-preta antes e depois, idêntica: `OPTIONS /forca` 204; `GET /forca` sem token, com token inválido e com token bem-formado inexistente, 401 `{"erro":"token"}`; `POST /corridas` sem token, 401. A próxima leitura real do CRUNNING aparece nos logs; rollback em "Decisões".
- **C12 (dossiê):** `docs/DOSSIE_LGPD_ADVOGADO.md`, com o mapa de dados por funcionalidade, o que vai para a Anthropic, as sugestões de base legal justificadas e as perguntas para o advogado. No app, tudo continua "a definir".

## Em andamento

- **A1 e A2:** revisão da ficha (0.10.0) e memória das análises com a dica do Waltér (0.11.0) estão juntas na `claude/missao`. Falta o build verde; ao passar, publico `analise-treino` (com memória e corridas) e depois `revisao-ficha`, as duas aceitando cliente antigo e novo.
- **B3:** chat do Waltér nativo feito pelo Codex (`codex/ios-chat`, 4dfa9f2), revisado e juntado na `claude/missao` como 0.15.0. Aguardando build.
- **B4:** o Codex está fazendo criar/editar ficha e o "Ignorar" da sugestão (0.16.0), na branch `codex/ios-ficha`.
- **B5, B6, B7:** plano da semana na aba Plano, perfil de treino na aba Você e catálogo com busca, máquinas, exercício próprio e "como fazer" (0.13.0 e 0.14.0), na `claude/missao`. Aguardando build.
- **B8:** mesa de descanso refeita (feltro, cartas desenhadas, fichas, distribuir e virar, háptico, vitória e derrota), partida salva no aparelho e retomada no próximo descanso, losango de ouros corrigido, halter com contraste no escuro e aquecimento antes do primeiro print. Prints em tela pequena no claro e no escuro entram no mesmo build. O build 16 falhou na compilação (a ficha de cassino tinha o mesmo nome da tela da ficha); corrigido em f756b91.
- **C11:** tela "Corridas repetidas" no site (`/historico/repetidas`): juntar guarda uma foto das duas corridas antes, tem "Desfazer" e "Não é repetida". 4 testes passando. Sobe para o ar no item 9.

## Decisões tomadas

- **Pasta separada para o Claude:** `../anilha-claude` (git worktree, branch `claude/missao`), para não mexer nos arquivos que o Codex está editando em `anilha-publico`.
- **CI:** o workflow só dispara em `claude/ios-*` e `codex/ios-*`. Branches com outro nome são publicadas também com um nome nesse padrão. Na integração, o padrão passa a aceitar `claude/**` e `codex/**`.
- **Rollback da função de troca (C10):** a versão publicada hoje (v1) é o conteúdo do commit `e81ef2a`, só compactado na hora de publicar. Voltar = republicar `index.ts`, `core.ts` e `engine.generated.ts` daquele commit.
- **Versões:** a numeração do iPhone segue a ordem de entrega na branch, não a da lista: o chat (item 3) entrou como 0.15.0 porque semana, perfil e catálogo já tinham usado 0.13.0 e 0.14.0.
- **Juntar duplicados sem apagar:** a corrida que sai vira lápide (`deleted`), a foto das duas fica no aparelho e o "Desfazer" restaura as duas. Nada é apagado de verdade.
- **Publicação:** sempre o servidor antes dos clientes, com o servidor aceitando o formato antigo e o novo.

## Depende do Caio

- **E4, Apple ID gratuito:** o Anilha e o CRUNNING vencem 7 dias depois de cada instalação. Para renovar: abrir o Sideloadly no PC, ligar o iPhone no cabo, escolher o `.ipa` mais recente de cada app (pasta `C:\Users\caiog\crunning-artifacts\ipa` e `...\anilha-ipa`), entrar com o mesmo Apple ID e instalar por cima. Os dados ficam.
- **C12, advogado:** levar `docs/DOSSIE_LGPD_ADVOGADO.md`. Depois da resposta, o Claude troca "a definir" pelas bases aprovadas e sobe a versão dos termos.
