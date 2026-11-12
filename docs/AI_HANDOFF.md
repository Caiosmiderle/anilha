# Registro entre Codex e Claude

## Troca com o CRUNNING publicada, Claude, 12/11/2026

- Revisão do Claude das correções do Codex (lápide mínima, limites, versão no GET): **aprovada**. Conferi o código e os 4 testes novos; 787 testes passando no relato do Codex.
- Publicação autorizada pelo Caio ("Pode publicar"):
  1. Migração `troca_crunning` aplicada no Supabase de produção (projeto `anilha`), com o conteúdo de `20261112000021_troca_crunning.sql`. Conferi depois:
     - as 2 tabelas e as 6 colunas novas existem;
     - `crunning_exchange` só é executável pelo `service_role`;
     - `authenticated` não lê `crunning_tokens` nem grava em `external_plan_items`;
     - `synced_tables()` tem 14 tabelas.

     Advisor de segurança sem item novo fora do padrão já aceito no projeto.
  2. Função `troca-crunning` v1 publicada com `verify_jwt = false`. `index.ts` e `core.ts` são idênticos ao repositório. **`engine.generated.ts` foi publicado com a formatação compactada** (o mesmo código, sem comentários e sem a linha `new Map(...)` sem efeito). Ele só serve ao `GET /forca`, que o CRUNNING ainda não chama: republicar o arquivo exato do repositório antes da etapa 4.
  3. Teste de fora, sem token válido:
     - `OPTIONS` responde 204;
     - sem token, ou com token falso bem formado, responde 401 `{"erro":"token"}`. O token falso vai até o banco e volta recusado: a função alcança o banco.
  4. Merge desta branch na `main` (contrato e implementação). A Vercel publica o site com Você > Conexões > CRUNNING.
- Pendente: teste de ponta a ponta com o Caio (gerar token, colar no CRUNNING 0.17.0, corrida nova, lápide e planejados). A tela de juntar duplicata continua pendente.

## Troca com o CRUNNING, Codex, 12/11/2026

- Continuação após revisão do Claude, autor Codex, 12/11/2026, mesma branch `codex/troca-crunning` e base `03dc305`, preservando todo o diff sem commit. Intenção: corrigir a lápide mínima e aplicar limites do contrato esclarecido. Segundo retorno do Caio, revisão inicial de segurança/RLS/grants/token/limite aprovada pelo Claude; revisão destas correções **PENDENTE**.
- Correção: `core.ts` valida lápide só por UUID, ISO e `apagado === true`, descartando os outros campos; migração 21 usa UPDATE da corrida existente da conta com versão estritamente mais nova. Ausente/antiga/igual conta em `ignorados`, aceita preserva dados e atualiza os relógios; reenvio completo mais novo restaura a corrida. Distância de 5 a 300.000 m e duração até 172.800 s validadas antes da RPC. GET ausente/1 aceito e outra versão 400, confirmado por teste.
- Evidência: novos testes reproduziram cinco falhas antes da correção; após ela, 14 testes da troca e suíte completa de **787 testes em 63 arquivos** aprovados. Lint, typecheck e build passaram; typecheck inicialmente acusou tipagem das consultas dos testes novos, corrigida. E2E da troca pelo `playwright.node.config.ts`: **um cenário móvel aprovado, saída 0**, `1 passed (1.9m)`. Encerramento voltou a aguardar servidores; somente os dois desta execução nas portas 54329/4173 foram conferidos e encerrados, então o runner terminou. Tudo com dados fictícios e banco/API locais, sem validação de produção.
- Parecer atualizado em [REVISAO_CODEX_TROCA_2026-11-12.md](REVISAO_CODEX_TROCA_2026-11-12.md), seção de correção após revisão. Claude deve conferir lápides, contadores, limites e regressões, depois fazer commit quando autorizado. Sem escrita em `.git`, commit, push ou acesso à produção nesta continuação.

Registro da entrega inicial, anterior a esta correção:

- Autor Codex. Branch `codex/troca-crunning`, base `03dc305`, checkout inicialmente limpo. Intenção: implementar o lado Anilha da etapa 2 e a base da 4 conforme o contrato do Claude, que permanece sem alteração.
- Entrega local: migração 21; tokens pessoais somente como SHA-256, RPCs e limite transacional; planejados externos com RLS de leitura e sync/Dexie/exportação; três rotas da Edge Function e do servidor local; Você > Conexões > CRUNNING; origem no histórico; regras existentes com planejado importante e motivo explícito; projeção de força pelo motor reutilizado; LGPD sem mudar versão dos termos.
- Detecção de duplicata com testes entregue, sem alteração automática. **Tela para sugerir/juntar com confirmação pendente**, conforme a alternativa autorizada no pedido. Até lá, duplicatas podem contar duas vezes. Revisão do Claude desta implementação: **PENDENTE**.
- Parecer completo, auditoria do contrato, decisões, limites e roteiro em [REVISAO_CODEX_TROCA_2026-11-12.md](REVISAO_CODEX_TROCA_2026-11-12.md). Conferir especialmente a falta de timestamp nos retratos planejados, versão no GET/erros, limites existentes de `runs`, janela e interpretação de parcial.
- Validações reais: lint, typecheck e build passaram; **781 testes em 63 arquivos passaram** com um worker. E2E local ampliado passou com `npx playwright test -c playwright.node.config.ts tests/e2e/crunning.spec.ts`. Inclui token, POST/PUT/GET, chegada ao histórico/IndexedDB e preservação após revogar. O comando normal falhou no `tsx` (`uv_os_get_passwd`/`ENOMEM`); alternativa reproduzível versionada em `scripts/local-api-node.mjs`. Limpeza dos servidores desta execução necessária após o resultado do Playwright, descrita no parecer.
- Para o Claude testar o outro app: `node scripts/local-api-node.mjs --port 54321 --seed` e `npm run dev:web`; base `http://127.0.0.1:54321/functions/v1/troca-crunning`. Token deve ser gerado pela tela e mantido fora de logs/arquivos. Regenerar `engine.generated.ts` com `node scripts/build-crunning-engine.mjs` se mudar a projeção ou suas dependências.
- Sem CLI Supabase/Deno, produção, iPhone ou execução real do CRUNNING. Sem subagentes. Tudo só nesta pasta e sem escrita em `.git`, commit, push, merge ou publicação, por instrução expressa do Caio; Claude revisa e commita.

## Publicação sem vídeos, Codex, 12/11/2026

- Branch `claude/ios-prova-instalacao`, base `7d6018c`. Preservadas as alterações locais da auditoria. Caio informou que o Claude revisou e aceitou as correções anteriores; esta nova intervenção aguarda revisão do Claude.
- Removidos os dois MP4s públicos e os 14 WAVs de `marketing/video/**/assets/sfx/`. Mantidos os três WebPs de mídia conferidos pelo Claude. Pastas de sons ignoradas até haver origem e licença documentadas; reposição local para renders explicada em `SETUP.md`.
- Landing com pôster responsivo em `<picture>`, mesmas proporções, sem reprodução, controles ou transcrição. Instalação preservada. Workflow de checagem de vídeos somente manual enquanto o catálogo estiver vazio.
- Lint, typecheck e build passaram. E2E da landing: seis cenários passaram via `npx playwright test -c .local/auditoria-publico/landing.config.ts tests/e2e/conheca.spec.ts`, saída 0. Comando normal falhou antes dos testes no `tsx` com `uv_os_get_passwd`/`ENOMEM`. A alternativa atualizou os 35 módulos temporários das fontes atuais; API e banco locais, sem produção. Encerramento dos dois servidores exigiu limpeza dos processos desta execução.
- Parecer atualizado em [REVISAO_CODEX_REPO_PUBLICO_2026-11-12.md](REVISAO_CODEX_REPO_PUBLICO_2026-11-12.md), com falhas e detalhes da alternativa. MP4s e WAVs resolvidos por remoção; RepDB e nome nos textos legais seguem para revisão jurídica do Caio. Retrato sem histórico anterior e validação iOS seguem pendentes.
- Claude deve revisar este novo diff, pôsteres nas duas larguras, instalação e remoções. Tudo somente neste checkout, sem commit, remoto, push ou publicação, conforme pedido do Caio.

## Auditoria antes da publicação, Codex, 12/11/2026

- Autor Codex. Branch `claude/ios-prova-instalacao`, base `7d6018c`, checkout inicialmente limpo e sem remoto. Intenção de revisar o retrato público e a prova iOS do Claude.
- Parecer completo em [REVISAO_CODEX_REPO_PUBLICO_2026-11-12.md](REVISAO_CODEX_REPO_PUBLICO_2026-11-12.md), com achados, evidências, decisões, comandos e limitações.
- Correções na árvore de trabalho para a fixture de origem pessoal, agora com valores sintéticos, e seus consumidores. Refeitas 39 capturas PNG de marketing e 20 WebPs públicos. Retirada uma captura histórica complementar que associava identificação ao estado de treino. Atualizados registros históricos e o caractere que impedia o lint no roadmap.
- Workflow iOS agora verifica o status do archive e inclui a fonte do ícone no filtro de push. Swift e configuração receberam revisão estática. A compilação macOS continua pendente.
- Validações reais com lint, typecheck, build, 764 testes em 60 arquivos e sete cenários locais de captura aprovados. Varredura das duas árvores, 82 imagens iniciais, doze páginas do PDF e amostra dos dois MP4s. O parecer registra as falhas de instalação, de inicialização do tsx e a recuperação temporária usada na coleta.
- Pendências antes da publicação incluem os MP4s ainda com capturas antigas, direitos dos WAVs/trilha, distribuição RepDB, identidade pública nos textos legais e novo retrato Git sem os commits que conservam os dados anteriores. Proposta sobre a agenda semanal registrada no parecer.
- Revisão das correções aceita pelo Claude, conforme informado pelo Caio nesta continuação. A intervenção sem vídeos acima ainda aguarda revisão. Alterações locais sem commit, conforme pedido do Caio.

O registro anterior a 11/11/2026 (com as auditorias, revisões e pendências daquela fase) ficou no repositório privado de arquivo, junto com o histórico de commits. Este repositório público começa de um retrato limpo da `main` em `7c1c25b`.

## Prova de instalação do app iOS, Claude, 11/11/2026

- Autor: Claude, a pedido do Caio. Branch `claude/ios-prova-instalacao`, a partir do retrato público.
- Entrega:
  - `ios/project.yml` (XcodeGen): app `Anilha`, bundle `io.github.caiosmiderle.anilha`, iOS 26, Swift 6, só iPhone, **sem extensão**.
  - `ios/App`: `Tema.swift` com os tokens do Harbor UI em claro e escuro; `HojeView` com uma ficha **fictícia** e o botão de começar desligado; `SobreView` com versão, build e identificador; `onOpenURL` para `anilha://`.
  - `ios/Suporte/App-Info.plist`: registra o esquema `anilha`.
  - `.github/workflows/ios.yml`: Mac do GitHub, Xcode estável mais novo, ícone 1024 gerado pelo `sips` a partir de `public/icon-512.png`, `xcodegen`, archive sem assinatura, `.ipa` como artefato e Release `ios-build-N`.
- Validações: nenhuma compilação ainda. Este Windows não tem Xcode, e o workflow só roda depois que o repositório público existir no GitHub.
- Aceite (no aparelho, pelo Caio):
  1. instalar pelo Sideloadly com o mesmo Apple ID do CRUNNING;
  2. anotar quantos App IDs foram gastos e se o limite de 3 apps foi atingido;
  3. abrir `anilha://teste` no Safari;
  4. conferir claro/escuro, o maior Dynamic Type e o contraste.
- Pendências conhecidas: o ícone 512 ampliado para 1024 pode sair borrado; trocar por um 1024 próprio depois.
- Revisão pelo Codex: **PENDENTE**.

## Repositório público a partir de retrato limpo, Claude, 11/11/2026

- Autor: Claude, a pedido do Caio. Origem: `main` do repositório privado em `7c1c25b` ("Waltér aberto para todas as contas, com o mesmo limite diário"), exportada sem histórico.
- Motivo: o Caio decidiu tornar o Anilha público para o CI de macOS do app iOS ser gratuito. Abrir o repositório antigo publicaria o histórico inteiro, inclusive arquivos apagados.
- Ficou de fora, com o motivo:
  - todo o estudo de um app de terceiros feito em outubro (documentos em `docs/`, `docs/agents/` e evidências em `docs/evidence/`): análise de produto de outra empresa não vai para repositório público;
  - o registro antigo deste arquivo e as instruções antigas do `CLAUDE.md`: citavam esse estudo e caminhos locais do computador do Caio.
- Mantido e conferido:
  - `.env.production` só tem valores públicos por natureza (URL do Supabase, chave publicável e chave pública VAPID), que já vão no JavaScript do site. O acesso é controlado por RLS.
  - Os `.env` de desenvolvimento e de teste apontam para a API local.
  - E-mails no código são de teste ou o remetente público.
  - `src/content/media.json` lista as imagens do RepDB no bucket público, com a atribuição exigida. É o mesmo conteúdo que já vai no JavaScript do site. **Pendente para a revisão jurídica** que o Caio vai fazer de uma vez: a licença gratuita do RepDB proíbe republicar como dataset ou API.
  - As evidências restantes em `docs/evidence/` são testes de fumaça e capturas do app com dados de exemplo.
- Validação: varredura por padrões de chave (Anthropic, Resend, Google, Supabase secret, JWT, chaves privadas) na árvore exportada, sem achados. No repositório antigo, a mesma busca em `git log --all -p` também não achou nada. Sem build nem testes nesta intervenção: só remoção de documentos e troca de três arquivos de texto.
- Ações do Caio, fora do alcance dos agentes:
  1. renomear o repositório privado atual para o nome de arquivo;
  2. criar o repositório público `anilha` e enviar este retrato;
  3. religar o projeto da Vercel ao repositório novo e conferir domínio e variáveis.
- Revisão pelo Codex: **PENDENTE**. Conferir se algo do repositório antigo ainda faz falta aqui e se sobrou algum dado pessoal.
