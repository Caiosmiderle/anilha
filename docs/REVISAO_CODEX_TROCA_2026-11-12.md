# Troca com o CRUNNING: implementação e parecer do Codex

Autor: Codex, 12/11/2026. Branch `codex/troca-crunning`, origem `03dc305` (`Contrato da troca entre Anilha e CRUNNING (v1)`). Checkout inicialmente limpo na entrega original; continuação sobre o diff existente, preservado. Contrato relido com os esclarecimentos do Claude, sem edição pelo Codex. Segundo retorno do Caio, Claude aprovou segurança, RLS, grants, token e limite da entrega inicial e apontou o P1 abaixo. Revisão destas correções pelo Claude: **PENDENTE**.

Tudo ficou na árvore de trabalho deste checkout, sem escrever em `.git`, commit, push, merge, migração remota ou publicação de função/site. Nenhum arquivo dos outros dois apps foi acessado ou alterado. Dados de teste fictícios.

## Correção após revisão do Claude, 12/11/2026

| Prioridade | Arquivo e reprodução | Evidência | Correção |
| --- | --- | --- | --- |
| P1 | `supabase/functions/troca-crunning/core.ts` e migração `20261112000021_troca_crunning.sql`: enviar uma corrida e depois somente UUID, timestamp mais novo e `apagado: true` | Bug reproduzido antes da correção: a lápide retornou `rejeitados: [{motivo: 'campos', ...}]`, sem apagar. A leitura do SQL também confirma que o INSERT exigia colunas NOT NULL antes de resolver o conflito | Validação exclusiva dos três campos da lápide; todos os demais são descartados. Na mesma RPC, UPDATE por conta e id, condicionado ao timestamp de origem estritamente mais novo, sem inserir linha incompleta |
| P2 | `core.ts`: enviar 4,999 m, mais de 300.000 m ou mais de 172.800 s | Novo teste falhou antes da correção: o item abaixo de 5 m chegou ao banco e foi contado em ignorados por conflito com uma versão existente | Distância inclusiva de 5 a 300.000 m e duração inteira positiva até 172.800 s verificadas antes da RPC; rejeição individual como `campos` |

A lápide aceita modifica apenas `deleted`, `updated_at` em milissegundos e `crunning_updated_at`, além do `server_seq` atualizado pelo trigger existente. Preserva todos os demais dados da corrida. Linha ausente, versão antiga e versão igual contam em `ignorados`. O reenvio completo mais novo restaura `deleted = false`. A migração 21 foi editada diretamente, conforme pedido, sem criar migração adicional.

Em `tests/db/crunning.test.ts`, seis novos cenários cobrem lápide mínima existente, inexistente, antiga/igual, reativação com descarte de campos inválidos da lápide, limites e GET. Conferem também preservação da linha, avanço do cursor, idempotência, borda de 5 m persistida como `0.01` km e máximo de distância/duração. Um spy da chamada à RPC comprova que os itens fora dos limites não chegam ao banco. GET sem `versao` ou com `versao=1` retorna 200 e versão 1; `versao=2` retorna 400 com `{erro: 'versao'}`.

Contrato relido: lápide mínima e limites agora explícitos; GET e erros já correspondem ao comportamento implementado. A janela tem 14 datas no fuso do aparelho, de hoje até hoje + 13; o validador existente aceita até 14 datas e tolera o dia adjacente ao UTC. Retratos continuam serializados pela chegada, com responsabilidade do CRUNNING de não reenviar retrato antigo. Não houve mudança da janela ou da ordenação nesta correção.

Validações desta continuação:

| Comando | Resultado real |
| --- | --- |
| `npx vitest run tests/db/crunning.test.ts --maxWorkers=1 --no-file-parallelism` antes da correção | 5 falhas e 9 aprovados, reproduzindo lápides rejeitadas e ausência de validação prévia dos limites |
| Mesmo comando após correção | 14 testes aprovados |
| `npm run lint` | Passou |
| `npm run typecheck` | Passou após corrigir a tipagem de quatro acessos aos resultados das consultas nos testes novos |
| `npm run build` | Passou, incluindo PWA |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | 787 testes em 63 arquivos aprovados, saída 0 |
| `npx playwright test -c playwright.node.config.ts tests/e2e/crunning.spec.ts` | Um cenário móvel aprovado, saída 0, `1 passed (1.9m)`; execução do cenário em 6,8 s |

O E2E voltou a aguardar os servidores ao encerrar, depois de aprovar o cenário. Conferidos `netstat -ano` e `Get-Process`: somente a API local desta execução na porta 54329 e o preview desta execução na porta 4173 foram encerrados com `Stop-Process`; depois disso o runner terminou com saída 0. `Get-NetTCPConnection` não retornou os listeners neste ambiente, por isso foi usada a conferência por `netstat`, incluindo IPv6 para a porta 4173. Lint repetido após a atualização documental, aprovado. `git diff --check` sem erros. Nenhum servidor alheio foi encerrado.

Limitações: API e banco locais com migrações reais em PGlite. Sem execução de produção, Deno, Supabase hospedado, iPhone ou CRUNNING real. A consulta documental de [funções do banco](https://supabase.com/docs/guides/database/functions) e do [changelog](https://supabase.com/changelog) não identificou mudança relevante para este UPDATE na RPC; nenhuma CLI ou recurso remoto do projeto foi usado. Permanecem as pendências de UI de duplicatas e revisão jurídica já registradas. Claude deve revisar a separação das lápides, os contadores e os testes novos antes de fazer commit.

## Entrega

- Migração `20261112000021_troca_crunning.sql`, seguinte à 20: `runs.source` aceita `crunning`; novos campos anuláveis guardam início, identificação Strava, tipo original, esteira, vínculo ao plano e relógio original da corrida. A coluna adicional `crunning_updated_at` conserva a precisão do timestamp de origem; `updated_at` continua em milissegundos para o sync.
- `crunning_tokens`: somente SHA-256, datas de criação/uso/revogação e janela móvel das chamadas. Um índice parcial garante um ativo por conta. Gerar revoga o anterior. O token tem 32 bytes aleatórios codificados em base64url com `anl_`. Usa os quatro primeiros bytes de oito UUIDs criptográficos do Postgres, excluindo os bits fixos; dispensa extensão nova no PGlite.
- RPCs do titular: `crunning_generate_token`, `crunning_revoke_token`, `crunning_token_state`. A tabela inteira está inacessível a `anon` e `authenticated`. Estado e exportação não retornam hash nem token antigo.
- `external_plan_items`: RLS de leitura só do dono, sem permissão de escrita do cliente. Tem `touch_server_seq`, índice de pull, lápides e exclusão por cascata. Entra em `synced_tables()`, `SYNCED_TABLES`, Dexie 3, `sync_pull`, `sync_ids` e exportação JSON. A atualização Dexie reinicia o cursor e preserva dados antigos. Importar backup não tenta regravar essa tabela somente leitura.
- `crunning_exchange`, executável apenas por `service_role`, identifica a conta pelo hash. Autenticação, revogação, limite móvel de 60/h e escrita ficam na mesma transação. Usa a trava por conta do sync para evitar saltos de cursor. Não aceita conta escolhida pelo cliente. RPC de usuário comum não pode chamá-la.
- Edge Function `troca-crunning`: `POST /corridas`, `PUT /planejados/corrida`, `GET /forca`, CORS e erros do contrato. Token inválido/revogado/ausente tem o mesmo `401`; credencial válida com chamada inválida também consome o limite. Campos desconhecidos são descartados por lista permitida, inclusive dentro de `planejado`. Não há log de requisição, token ou hash. Limite defensivo de corpo de 100 mil caracteres.
- `supabase/config.toml` desliga a verificação de JWT somente para essa função: ela recebe token pessoal, não JWT do Supabase. A chave de serviço existe apenas no ambiente da Edge Function, nunca no frontend ou no CRUNNING.
- `server/local-supabase.ts` executa o mesmo handler e a mesma RPC com papel `service_role` local. Não há simulação separada das regras da troca. Inclui PUT e as três rotas, sem produção.
- Você > Conexões > CRUNNING, com Harbor UI: gerar, copiar, ocultar, consultar datas, trocar e revogar com confirmação. Token só em memória do componente, limpo ao sair/trocar de conta. A tela explica o escopo e que revogar não apaga o recebido. Falha na cópia permite copiar pelo campo.
- Histórico mostra `do CRUNNING`. Editar corrida mantém sua origem e metadados, preservando os comportamentos `manual` e `import`. Importações TCX/GPX novas também conservam `started_at`.
- `recommendDay` recebe planejados externos. Uma corrida importante, ainda planejada para amanhã, alimenta a regra existente `no_legs_before_run` e o alerta `legs_before_run`, sem contar como realizada. Mostra nome/data/origem, diz que é planejada e pede a escolha ao iniciar ou escolher outro treino. Corrida feita continua passando por `run_legs`, com data realizada explícita. Nenhum plano salvo é alterado automaticamente. A extensão está marcada como prática de treinador em `docs/CIENCIA.md`.
- Força: a projeção pura em `src/engine/crunningStrength.ts` reaproveita `projectDays`, `planForDay` e a taxonomia/catálogo do Anilha. Só séries de trabalho concluídas contam, sem aquecimento ou séries apagadas. Itens pulados/não feitos/pendentes em sessão encerrada indicam parcial. Esforço desconhecido é `null`. O cursor considera edições de séries, itens e taxonomia, além da sessão; mudanças em filhos reemitem a sessão. Planejados são um retrato completo de 14 dias a cada GET.
- `engine.generated.ts` é o bundle implantável da projeção, gerado por `node scripts/build-crunning-engine.mjs` com o Rolldown já instalado. Evita imports fora da pasta implantada e uma segunda implementação das regras no Deno. Há teste comparando a saída do bundle com a fonte. Regenerar quando mudar as dependências do motor usadas pela projeção.
- Duplicatas: `src/engine/runDuplicates.ts` detecta `crunning` x `import` pelo mesmo Strava ou por até 5 minutos e 5% da distância canônica. Reconhece o horário no `external_id` das importações TCX/GPX antigas. Não inventa hora para CSV, nem altera/apaga linhas. **A tela para juntar com confirmação ficou pendente**, conforme a alternativa autorizada no pedido. Até essa tela existir, duas fontes podem contar duas vezes nas regras.
- LGPD e política pública ganharam "Conexão com o CRUNNING", com base legal **a definir**, exportação, apagamento e efeito da revogação. Versão dos termos e versão de aceite não mudaram.

## Revisão do contrato e decisões que o Claude deve conferir

Registro histórico da leitura inicial, antes dos esclarecimentos do Claude. Os quatro primeiros pontos foram esclarecidos no contrato v1 pelo Claude; não permanecem como pedidos de mudança. A continuação acima registra a correção e o comportamento atual.

| Prioridade | Arquivo e cenário | Evidência e classificação | Decisão atual / proposta |
| --- | --- | --- | --- |
| P1 | `docs/CONTRATO_TROCA_CRUNNING.md`, PUT de planejados: uma fila manda um retrato antigo depois de um novo | A tabela de campos do PUT não tem `atualizado_em`, embora a regra geral o exija. Limitação identificada na leitura, sem execução do CRUNNING real | Retratos são serializados pela ordem de recebimento, com relógio monotônico do servidor. Não é possível saber qual retrato foi criado mais recentemente. Propor timestamp/geração do retrato no contrato futuro e descarte da fila superada pelo CRUNNING |
| P2 | Mesmo documento, GET `/forca` e respostas de erro | A regra geral exige versão em toda requisição/resposta, mas GET não define onde enviá-la e os exemplos de erro não incluem versão. Ambiguidade documental | GET sem parâmetro é v1; aceita `?versao=1`, rejeita outra. Sucessos incluem `versao:1`; erros seguem exatamente o formato dos exemplos. Propor explicitar essas exceções |
| P2 | Mesmo documento, corrida com distância muito pequena, acima de 300 km ou duração acima de 172800 s | O contrato só diz positivo; o esquema existente limita distância/duração, e duas casas de km arredondam menos de 5 m para zero. Limitação de compatibilidade identificada no esquema, não ensaio de atividade real | Mantidos os limites existentes de `runs`, sem relaxar regras por conta própria. Item incompatível é rejeitado como `campos`, sem derrubar os outros. Propor limites explícitos e decisão sobre distância menor que a precisão persistida |
| P2 | Mesmo documento, janela de planejados sem fuso explícito do retrato | `data_local` vem do aparelho, mas `de`/`ate` não carregam fuso. Interpretação documentada | Janela inclusiva com até 14 datas, `de` no dia UTC atual ou adjacente para acomodar o dia do aparelho. Propor definir o fuso da janela e se "até 14 dias" significa 14 datas ou hoje mais 14 |
| P2 | `src/data/ops.ts`, editar corrida externa pelo fluxo existente | Confirmado por inspeção: `saveRun` recalculava origem pelo `external_id`; uma corrida externa viraria `import`. Corrigido e coberto por teste de IndexedDB | Preservar origem/metadados quando a linha já existe. Timestamp original separado evita que a edição local altere a ordem das versões vindas do CRUNNING |

Força tem `nome` de treino, como o contrato permite; não inclui nome de pessoa, e-mail, nota, dor ou contexto de saúde. "Texto livre" foi interpretado como notas/observações, preservando somente o nome curto de atividade exigido. Sessões antigas de resumo sem séries retornam zero séries efetivas conhecidas, sem inferir séries executadas pela ficha. O `status` parcial é derivado dos itens porque `sessions.status` só possui `active` e `done`.

## Validações reais

| Comando / verificação | Resultado |
| --- | --- |
| `npm run lint` | Passou, inclusive `scripts/check-text.mjs` |
| `npm run typecheck` | Passou |
| `npm run build` | Passou, incluindo PWA |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | **781 testes em 63 arquivos passaram**, saída 0 na execução final |
| `npx vitest run tests/db/crunning.test.ts --maxWorkers=1 --no-file-parallelism` | Oito cenários passaram; todos usam shim e migrações reais, com papéis `authenticated`, `anon` e `service_role` |
| `npx playwright test tests/e2e/crunning.spec.ts` | Falhou antes dos testes no `tsx`, `uv_os_get_passwd` / `ENOMEM` |
| `npx playwright test -c playwright.node.config.ts tests/e2e/crunning.spec.ts` | **Um cenário móvel ampliado passou**, saída 0, `1 passed (1.0m)` |
| UI local | Captura ativa aberta e conferida em 390 px, sem corte horizontal, usando componentes Harbor. Capturas sem token em `artifacts/screens/crunning-ativo-mobile.png` e `crunning-revogado-mobile.png`, ignoradas pelo Git |

O E2E cobre o caminho pelo menu, geração e cópia real, ocultação e recarga sem recuperar o segredo, data de último uso, substituição e invalidação do anterior, revogação e 401. Envia POST e PUT para a API local, confere rótulo no histórico e planejado no IndexedDB e confirma que o histórico permanece após revogar. Trace e screenshots automáticas ficam desligados nesse arquivo para não registrar a credencial; capturas explícitas só depois de ocultá-la.

Banco/handler cobrem limite e renovação da janela, 401 genérico, lote parcialmente inválido, reenvio idêntico, timestamp mais novo/mais velho, lápide, substituição de planejados, read-only inclusive por `sync_push`, isolamento entre duas contas, força incremental após editar séries, aquecimento excluído, parcial e cascata. Motor cobre planejado x feito, regra desligada, status/data/deleção, limites de duplicata e preservação de dados. IndexedDB cobre migração Dexie, exportação e preservação de origem.

Falhas intermediárias: a primeira construção do bundle usou `build` onde a API local do Rolldown requer `rolldown`; corrigido. Um teste de corrida pesada usava carga abaixo do limiar existente; ajustada a fixture sintética, sem mudar o limiar. Na ampliação do E2E, uma asserção procurava "Corrida do CRUNNING" em vez de "Corrida leve do CRUNNING"; o snapshot mostrou que o dado já tinha chegado. Corrigida a asserção e repetido com sucesso. `rg` e Python não estão no PATH; usadas ferramentas locais alternativas. Não há CLI Supabase nem Deno disponível no PATH.

A alternativa versionada `scripts/local-api-node.mjs` transpila as dependências TypeScript atuais para `.local/node-api-runtime`, ajusta imports relativos e conserva a URL da fonte para carregar as migrações reais. Não usa banco remoto nem resultados guardados de execução anterior. `playwright.node.config.ts` mantém build, endpoints locais, projeto e testes do config normal; só substitui o carregador da API.

Como nas execuções anteriores deste ambiente, o encerramento automático do Playwright ficou aguardando os servidores após o resultado. As portas 54329 e 4173 e horários dos processos desta execução foram conferidos com `netstat` e `Get-Process`; somente os dois servidores desta execução foram encerrados com `Stop-Process`. O runner então terminou com saída 0. Não usar encerramento genérico de todos os processos Node.

## Como o Claude pode testar localmente

1. Continuar neste checkout em `codex/troca-crunning`, base `03dc305`, preservando o diff não commitado. Não usar produção para testes.
2. API temporária sem `tsx`: `node scripts/local-api-node.mjs --port 54321 --seed`. Para persistência, acrescentar `--persist` (usa `.local/pg`). O comando normal continua sendo `npm run dev:api` se o carregador funcionar em outro ambiente.
3. Em outro terminal: `npm run dev:web`. O ambiente de desenvolvimento aponta para 54321. Entrar com conta fictícia e usar Você > Conexões > CRUNNING. Gerar o token, colar no cliente de teste e não salvar em arquivo, histórico de comandos ou log.
4. Base local para o outro app: `http://127.0.0.1:54321/functions/v1/troca-crunning`. Usar `/corridas`, `/planejados/corrida` e `/forca` com Bearer em cabeçalho. Para outro dispositivo na rede é necessário um encaminhamento local apropriado; o servidor permanece ligado apenas em `127.0.0.1`.
5. Reexecutar os comandos da tabela. O E2E sobe banco temporário em 54329 e web em 4173. Não reutiliza dados de produção.
6. Se mudar o motor da projeção de força, executar `node scripts/build-crunning-engine.mjs` e revisar o bundle junto com a fonte antes de entregar.

## Pendências para a revisão mútua

- Revisão inicial de segurança, RLS, grants, token e limite aprovada pelo Claude conforme retorno do Caio. Claude revisar as correções desta continuação, especialmente lápide mínima, timestamps, contadores e limites; revisão desta correção **PENDENTE**. Não substituída por autoavaliação ou subagentes.
- Implementar a sugestão visual e a confirmação para juntar duplicatas no histórico. A detecção não é chamada pela UI nesta entrega, e nada é apagado por ela.
- Esclarecimentos do contrato relidos e registrados acima. Validar a integração com o lado CRUNNING; não há execução cruzada com o app real, Keychain ou iPhone nesta intervenção.
- Revisão jurídica da base legal e eventual versão dos textos pelo Caio. Os termos não foram versionados novamente.
- Wrapper Deno/SDK e autenticação do gateway receberam inspeção estática, com referência à [documentação de autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth). O changelog foi consultado. Não houve execução Deno, CLI/advisors, implantação ou teste de Supabase hospedado. PGlite não comprova o ambiente de produção.
- O contrato de força não pagina; a RPC monta um retrato mínimo da conta e filtra a saída incremental no motor. Medir volume/latência com histórico grande antes de ampliar o uso. Avaliar retomada de cursor depois da retenção de lápides, pois v1 não especifica horizonte de recuperação.
- Claude fazer commit somente depois da revisão, conforme a autorização do Caio. Nenhum hash novo ou conteúdo remoto é alegado nesta entrega.
