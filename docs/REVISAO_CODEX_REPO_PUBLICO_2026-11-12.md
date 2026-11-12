# Revisão do retrato público do Anilha

Autor Codex. Data 12/11/2026. Branch `claude/ios-prova-instalacao`. Base do checkout `7d6018c`, com `main` em `640ac2e`. Revisão das entregas do Claude. Caio informou que o Claude revisou e aceitou as correções da auditoria. A continuação sem vídeos, descrita abaixo, ainda aguarda revisão do Claude.

## Parecer

O retrato precisa de tratamento adicional antes da publicação. Foi confirmada uma fixture de origem pessoal, apesar do login fictício. A árvore de trabalho recebeu dados sintéticos, novas capturas e correções do CI. Na continuação autorizada pelo Caio, MP4s antigos e WAVs foram removidos. RepDB e identidade pública nos textos legais seguem para revisão jurídica do Caio. Os commits anteriores às correções ainda exigem um retrato sem esse histórico. A compilação iOS depende de execução futura em macOS.

### Escopo e evidência

- Checkout inicialmente limpo, sem remoto. Foram conferidos branch, quatro commits e diff da branch iOS contra a `main`.
- Inventário por `git ls-tree -r`. A `main` tinha 601 arquivos, com 498 arquivos textuais. A branch tinha 612 arquivos, com 509 textuais. Os 103 binários eram iguais entre as duas árvores. Os textos de ambas foram examinados diretamente pelos blobs Git, incluindo `.env.production`, `supabase/`, `scripts/` e arquivos ocultos versionados.
- Inspeção visual das 82 imagens raster iniciais, com 64 conteúdos distintos por SHA-256 e 18 cópias idênticas. Incluiu os dez JPGs de `docs/evidence/uiux-2026-10-22/`, os três WebPs de `public/screenshots/`, os 39 PNGs em `marketing/**/screens`, as imagens de `public/conheca/`, os ícones e as seis imagens próprias de exercícios. Pranchas temporárias ajudaram a conferir o conteúdo de cada imagem e suas duplicatas.
- PDF aberto, texto extraído com pypdf e doze páginas renderizadas com Poppler e inspecionadas. Metadados indicam autoria do assistente, sem caminhos pessoais. Sem anexos, formulário ou JavaScript. Fontes Segoe incorporadas em subconjuntos com `fsType=8`. Os raster não apresentaram EXIF/GPS, comentários ou campos de autor pessoal nos metadados examinados.
- Os dois MP4s foram decodificados no Chromium local, com oito quadros distribuídos pela duração de cada um. Durações medidas de 60 s e 22 s. Essa amostragem evidencia o uso das capturas antigas. Não houve inspeção de todos os quadros nem audição integral.
- Leitura de `AGENTS.md`, `CLAUDE.md`, handoff, roadmap, README, arquitetura, decisões, mídia, auditoria e dossiê anteriores. Comparação somente de leitura com `../crunning-app/project.yml` e `../crunning-app/.github/workflows/build.yml`.

## Achados confirmados e correções

### PUB-01, P1, fixture de origem pessoal e capturas derivadas

**Arquivos** `src/engine/fixtures/exampleWeek.ts`, `server/seed.ts`, `DECISIONS.md`, `docs/evidence/uiux-2026-10-22/08-hoje.jpg` e capturas de marketing/site.

**Evidência** Os comentários iniciais da fixture e do seed declaram origem em uma semana real. A fixture associava a identificação da pessoa a datas, sessões, cargas, repetições, esforço, substituições e motivos de pulo. A captura complementar de Hoje associava o nome ao estado de retorno e ao histórico. Os scripts de marketing importam esse mesmo seed e alteram o nome de exibição. Mudar o nome na captura preservava a origem do histórico.

**Reprodução** Ler os dois arquivos na base `7d6018c` e seguir a chamada `seedDemo` para `exampleWeek`. Conferir as capturas e o código de `marketing/capture/capture.spec.ts`. A evidência é estática e visual. A execução local posterior confirmou que o seed abastece as telas capturadas.

**Corrigido no checkout**

- Fixture convertida para cenários sintéticos, com nome de exemplo, cargas, repetições, esforço e horários/duração inventados. Mantidos os cenários de resumo incompleto, aquecimento, substituição, pulo e excesso semanal necessários às regressões.
- Constante renomeada para `EXAMPLE_PARAMS`, com atualização dos consumidores. O login local fictício existente foi preservado para compatibilidade. A conta de demonstração passa a exibir Rafa.
- Expectativas dos testes ajustadas aos valores sintéticos. A recomendação da elevação lateral agora é `hold_reps`, pois as repetições inventadas ainda variam dentro da faixa. O motor ficou com as mesmas regras.
- Retiradas associações pessoais desnecessárias nos relatos de progressão e de uma ficha em `DECISIONS.md`. Removida a atribuição pessoal de títulos de testes relacionados.
- Reexecutados os sete cenários de captura. Copiados os resultados para os 39 PNGs versionados de marketing e os 20 WebPs de `public/conheca/img` e `public/screenshots`, preservando seus caminhos e dimensões. Quatro PNGs resultaram em bytes idênticos, portanto o diff contém 35 PNGs e 20 WebPs alterados. As capturas desta execução de 12/11 foram conferidas visualmente. A duração sintética aparece no histórico novo.
- Removido o JPG complementar `08-hoje.jpg` e sua geração no script do dossiê. O Markdown histórico recebeu uma nota sobre a revisão de privacidade. As seis imagens exibidas no dossiê e no PDF mostram cenários de interface e valores montados pelos probes. O PDF foi preservado como evidência histórica.

**Resolvido por remoção em 12/11/2026** Por decisão do Caio, retirados `public/conheca/media/anilha-16x9.mp4` e `anilha-9x16.mp4`. A landing passou a usar pôsteres estáticos responsivos e perdeu os controles e a transcrição. Preservados `poster-16x9.webp`, `poster-9x16.webp` e `og-16x9.webp`, conferidos pelo Claude segundo o Caio, sem alteração de bytes nesta continuação. Os 14 WAVs também foram retirados, conforme a seção de sons. Não houve nova renderização dos filmes. A trilha original esperada em `marketing/video/kinetic/music/trilha.mp3` continua ausente e ignorada.

### PUB-02, P1, os commits existentes conservam o material anterior

**Arquivos** Árvore da `main` em `640ac2e` e os três commits seguintes da branch iOS.

**Evidência** A leitura dos blobs da `main` ainda encontra a fixture e a captura de origem pessoal. As correções desta rodada estão somente na árvore de trabalho. Um envio das branches existentes incluiria esses estados anteriores.

**Tratamento** Registrar para o Claude preparar o retrato final sem histórico com a árvore sanitizada e revisada. Isso deve ocorrer antes do primeiro envio público, conforme a intenção do Caio. Nesta rodada, branch, histórico e commits ficaram preservados. As identidades dos quatro commits usam endereços GitHub noreply.

### IOS-01, P2, falha do archive podia terminar com sucesso

**Arquivo** `.github/workflows/ios.yml`, etapa de compilação.

**Evidência** O comando terminava com `|| true`. A única condição final era existir o diretório `.app`. Um archive parcial ou com erro posterior à criação desse diretório passaria para o empacotamento. O workflow de referência usa o mesmo padrão, portanto a comparação com ele não bastava para aprovar este trecho.

**Reprodução local** Executado o bloco Bash original e o corrigido, substituindo somente `xcodebuild` por uma função que cria o diretório esperado e retorna 0 ou 65. Resultado original com retorno 65 teve saída 0. Resultado corrigido com retorno 65 teve saída 1. Os dois casos com retorno 0 terminaram em 0.

**Corrigido** Captura do status em `build_status`, impressão dos diagnósticos e verificação desse status antes de aceitar a existência do app. A falha continua acionando a etapa de guardar o log. O teste usou um simulador de comando em Git Bash e não compilou Swift.

### IOS-02, P2, alteração da fonte do ícone não acionava o build

**Arquivo** `.github/workflows/ios.yml`, `on.push.paths`.

**Evidência** O CI lê `public/icon-512.png`, mas os filtros cobriam somente `ios/**` e o próprio workflow. Um push alterando apenas o ícone nessas branches não teria build.

**Corrigido** Incluído `public/icon-512.png` no filtro. Os padrões `claude/ios-*` e `codex/ios-*` foram preservados.

### DOC-01, P3, registros históricos apontavam para seções ausentes

**Arquivo** `docs/AUDIT_2026-10-22.md`, seção de validação.

**Evidência** O relatório remetia o leitor aos detalhes de execução e à seção de revisão do Claude no handoff público. Esse conteúdo histórico foi retirado no retrato.

**Corrigido** O relatório agora localiza o registro detalhado no arquivo privado e preserva seu resumo histórico. Nenhum novo link para documento ausente foi criado.

### DOC-02, P3, roadmap impedia o lint

**Arquivo** `docs/ROADMAP_IOS.md`, tabela do esforço realizado.

**Evidência** A primeira execução de `npm run lint` falhou em `scripts/check-text.mjs` por uma meia-risca na faixa numérica.

**Corrigido** Faixa escrita com a palavra `a`. O lint passou depois.

## Dados pessoais, terceiros e decisões do Caio

### P2, identidade pública nos documentos legais

`docs/LGPD.md`, `public/privacidade/index.html` e `public/termos/index.html` identificam uma pessoa física como responsável/controlador. Um teste E2E verifica essa identificação. É um nome real deliberadamente publicado no produto. A decisão sobre mantê-lo, alterar o responsável ou reformular os textos cabe ao Caio na revisão jurídica. O conteúdo foi preservado. O nome e outros detalhes pessoais não são reproduzidos neste parecer.

Os demais nomes de testes e de captura foram confrontados com seus geradores locais. Os e-mails de fixture são fictícios, e o remetente informado pelo Caio é público. Referências públicas de autoria/licença, contatos institucionais e metadados de dependências foram preservados. Nenhum telefone, endereço residencial ou caminho de diretório pessoal foi encontrado nas buscas textuais das duas árvores. O caminho para fontes do Windows no gerador do PDF é um caminho de sistema.

### P1 de decisão, catálogo RepDB

`src/content/media.json` contém 89 entradas RepDB e três de imagens próprias. As imagens RepDB ficam por URL no bucket público. Também há o mapeamento de IDs em `scripts/media/mapa-repdb.json` e na função de importação. A atribuição está na tela de créditos. As seis imagens locais de exercícios têm implementação 3D correspondente em `marketing/motion/src/exercise`.

A licença consultada permite uso em aplicações com atribuição e restringe republicação como dataset, inclusive derivado. A qualificação do catálogo público versionado e do bucket fica para a revisão jurídica do Caio. Não foi comprovada infração nesta auditoria. O parecer anterior tratava esse ponto como pendente, e a pendência continua. Fonte primária consultada em 12/11/2026. [Licença RepDB v1.0](https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md)

### P1 de decisão, sons do kit e trilha nos filmes

Na auditoria inicial havia 14 WAVs versionados, com quatro conteúdos únicos, em `marketing/video/**/assets/sfx`. O prompt de marketing os atribui ao starter kit e afirma geração em código. Não há licença desses sons nem o código gerador correspondente na árvore recebida. Essa afirmação não comprova o direito de distribuir os WAVs isolados em um repositório público. **Resolvido por remoção em 12/11/2026**, por decisão do Caio: os 14 WAVs foram apagados e `.gitignore` passou a ignorar essas pastas, com comentário sobre origem e licença. `SETUP.md` explica a reposição local necessária aos renders existentes. As referências nas composições foram preservadas.

A trilha musical isolada está ausente e ignorada. Os dois MP4s finais com áudio foram removidos; essa distribuição deixa de ser pendência desta entrega. `marketing/video/kinetic/REVIEW.md` registra a música escolhida e a origem Pixabay. Para eventual retorno dos filmes, conferir o comprovante e as condições aplicáveis ao filme acabado. Os arquivos de fonte Inter têm `OFL.txt` nas duas pastas correspondentes. Os avisos de autoria e licença foram preservados.

`git ls-files` contém somente o PDF próprio do dossiê. Não contém os guias pagos, o diretório `marketing/referencias`, a faixa musical isolada nem mídia de amostras premium. `git check-ignore` confirmou as regras para referências, música e capturas intermediárias. O `.gitignore` fica na raiz. Esses arquivos privados não estavam disponíveis para comparação de autoria ou licença.

Nenhuma captura de interface de outro app foi identificada nas imagens examinadas. A ausência de correspondência visual não certifica a autoria de todo asset ou código de marketing.

## Segredos e referências removidas

- Busca nas duas árvores por PEM de chave privada, JWT completo, padrões de provedores, tokens GitHub/Slack, AWS, Supabase secret e credenciais literais. Nenhum segredo de produção encontrado. As atribuições candidatas foram examinadas, incluindo o segredo fixo do servidor local, tokens de teste, placeholders SQL e a leitura de segredos por ambiente/Vault.
- `supabase/functions/agente-avaliar/index.ts` contém um verificador SHA-256 de token de avaliação. O token original não está na árvore. A função de importação tem verificador vazio. O hash existente não foi reproduzido neste relatório. A força do token original e o estado das funções implantadas ficaram fora da verificação.
- `.env.production` tem exatamente `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_VAPID_PUBLIC_KEY`. A URL tem formato de projeto Supabase, a chave tem prefixo `sb_publishable_` e a VAPID decodifica para uma chave pública P-256 válida de 65 bytes. Nenhuma chave privada VAPID ou service-role consta nesse arquivo. Os valores não foram copiados para este relatório.
- `.env.development` usa API local em 54321, e `.env.e2e` em 54329. `.env.example` tem placeholders. A auditoria de arquivos não verificou o RLS nem os segredos da infraestrutura em produção.
- Busca literal, sem distinguir maiúsculas, pelos nomes e prefixos dos documentos retirados, em arquivos de ambas as árvores, com inspeção adicional do texto extraído do PDF. Zero referências remanescentes a esses documentos. Os links Markdown locais de README, DECISIONS e `docs/*.md` existentes foram conferidos e resolvem após as edições.

## Revisão estática do app iOS

- `ios/project.yml` define um app, um esquema compartilhado, Release para archive, Swift 6.0, iOS 26.0 e família de aparelho 1. Não há extensão ou pacote externo. As fontes incluem o asset catalog. O plist de suporte fica fora dessa pasta de fontes.
- `GENERATE_INFOPLIST_FILE=YES` junto de `INFOPLIST_FILE` é uma configuração admitida. O arquivo fornece os URL schemes, e a geração acrescenta as chaves do produto e `INFOPLIST_KEY_*`. O projeto de referência usa a mesma combinação. Nome, categoria, scene manifest, launch screen e orientação iPhone usam chaves documentadas. A sintaxe do YAML e do plist foi validada localmente. A mesclagem efetiva depende do Xcode. [Build settings da Apple](https://developer.apple.com/documentation/xcode/build-settings-reference)
- Os quatro Swift foram lidos integralmente. Há um único `@main`, estado de URL em `AnilhaApp`, passagem por Binding e tratamento de `anilha://`. NavigationStack, toolbar, formatação de data e demais APIs empregadas existem no alvo indicado. As Views declaram sua conformidade na definição original e herdam isolamento MainActor do protocolo. `Tema` armazena cores SwiftUI e números, com provedores dinâmicos de UIColor. Não foi identificado erro confirmado de concorrência que justificasse modificar o Swift. [View e isolamento](https://developer.apple.com/documentation/swiftui/view), [UIColor dinâmico](<https://developer.apple.com/documentation/uikit/uicolor/init(dynamicprovider:)>)
- Os três `Contents.json` são JSON válido. O catálogo aponta para o PNG 1024 ausente por projeto, gerado pelo `sips` antes do XcodeGen. O PNG de origem tem 512 por 512, RGB opaco. A ampliação continua pendente de avaliação de qualidade. Abrir e compilar diretamente sem gerar o ícone exige executar essa preparação.
- `defaults.run.working-directory=ios` combina com os caminhos de `sips`, XcodeGen e archive. IPA e checksum são gravados na raiz por `GITHUB_WORKSPACE`. `upload-artifact` usa caminhos relativos à raiz do workspace. A Release sobrescreve `working-directory` para `.` e usa os mesmos nomes. O gatilho de push e a condição de pré-release atendem às branches de iOS previstas. A Action ainda publicará pré-releases nesses pushes quando o workflow for executado no futuro. Esta rodada não executou Actions. [Sintaxe e diretórios do GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

Compilar, instalar, validar assinatura, `anilha://teste`, limites de App IDs, Dynamic Type, contraste e claro/escuro no aparelho continuam pendentes. Esta revisão não transforma a referência do CRUNNING em evidência de compilação do Anilha.

## Workflow semanal de vídeos

**Arquivo** `.github/workflows/videos.yml`. A agenda anterior era segunda às 09h UTC, 06h de Brasília. Na continuação de 12/11/2026, o `schedule` foi removido por decisão do Caio e ficou somente `workflow_dispatch`, com comentário para reavaliar quando houver curadoria. O disparo manual permite selecionar a referência. A lógica existente ainda tem permissão de escrita e faz commit/push somente quando `video-status.json` muda; nenhum workflow foi executado nesta intervenção.

O conteúdo atual tem zero `videoId` e `video-status.json` vazio. Conferência local com cópias dos dois arquivos resultou em zero vídeos e nenhuma mudança. O código não faz consultas a YouTube nesse estado. Ainda haveria inicialização duplicada dos runners se as agendas dos dois repositórios continuassem ativas após a migração.

**Decisão aplicada no checkout** Somente disparo manual no público enquanto o catálogo estiver sem vídeos. A recomendação de interromper a agenda no privado ao transformá-lo em arquivo continua como ação externa futura; nenhum outro checkout foi acessado nesta continuação.

## Validações executadas e limitações

| Comando ou verificação                                                                    | Resultado real                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`, branch, log, remoto e diff contra main                              | Checkout inicialmente limpo, branch correta, sem remoto                                                                                                                               |
| Inventários `git ls-tree`, `git ls-files` e leitura dos blobs `git show` nas duas árvores | Concluídos, com os totais registrados acima                                                                                                                                           |
| Varredura de segredos, e-mails, caminhos e referências removidas                          | Concluída, com os achados e limites deste parecer                                                                                                                                     |
| `npm ci --ignore-scripts --no-audit --no-fund`                                            | Falhou com `Exit handler never called`; tentativa com cache local registrou EACCES ao buscar pacotes                                                                                  |
| Recuperação de dependências locais                                                        | SHA-256 dos dois package-locks idêntico. Cópia somente de leitura da origem `../Treinapp/node_modules` para `node_modules` deste checkout, sem novos pacotes ou alteração no lockfile |
| `npm run lint`                                                                            | Primeira execução falhou no roadmap. Execução após correção passou                                                                                                                    |
| `npm run typecheck`                                                                       | Passou                                                                                                                                                                                |
| `npm test -- --maxWorkers=1 --no-file-parallelism`                                        | Primeira execução teve 763 aprovados e uma expectativa incompatível com a fixture nova. Depois do ajuste, 764 testes em 60 arquivos passaram                                          |
| `npm run build`                                                                           | Passou, com geração do service worker                                                                                                                                                 |
| `npx playwright test -c marketing/capture/playwright.config.ts`                           | Parou antes dos testes em `tsx`, por `uv_os_get_passwd` com ENOMEM                                                                                                                    |
| `npx playwright test -c .local/auditoria-publico/capture.config.ts`                       | Sete testes passaram. Configuração derivada da original, usando API transpilada temporariamente e o mesmo PGlite, seed e migrações locais                                             |
| Harness Bash do archive                                                                   | Dois casos de sucesso e dois de falha executados, com resultado descrito em IOS-01                                                                                                    |
| YAML, JSON dos assets e XML do plist                                                      | Sintaxe validada com Prettier, JSON.parse e leitor XML do PowerShell                                                                                                                  |
| PDF e imagens                                                                             | Inspeção visual e de metadados concluída. `pdftotext` não estava disponível; extração feita com pypdf                                                                                 |
| `git diff --check` e varredura final da árvore de trabalho                                | Passaram, sem padrões de segredo ou caminhos pessoais nos textos examinados                                                                                                           |

Para a coleta, o bundle experimental por esbuild também falhou por leitura de diretório ancestral negada. A recuperação usou `typescript.transpileModule` nos 35 módulos de servidor/motor, com imports `.js` e URLs de origem preservadas para localizar as migrações. Somente o comando de inicialização da API foi substituído na configuração temporária. As URLs continuaram em localhost. O encerramento automático dos servidores da coleta ficou aguardando. Os dois processos criados para ela foram encerrados após conferir PIDs, horário e portas, e o Playwright terminou com saída 0 e `7 passed`. A consulta CIM de processos foi negada pelo ambiente.

Os arquivos transitórios de auditoria, imagens renderizadas e configuração alternativa estão sob `.local`, ignorado pelo Git. As novas capturas-fonte estão em `marketing/capture/screens`, também ignorado. Os resultados versionáveis estão no diff do checkout.

Não foram executados a suíte E2E completa, XcodeGen, compilador Swift/Xcode, Actions, testes no iPhone, publicação ou validação de produção. O comando de entrada normal da coleta ainda depende de um ambiente onde o `tsx` consiga consultar o usuário do sistema.

### Continuação: publicação sem vídeos, 12/11/2026

Alterações anteriores preservadas na branch `claude/ios-prova-instalacao`, sem commit. Nesta continuação só foram acessados arquivos e processos deste checkout. Sem acesso a `../Treinapp` ou `../crunning-app`, remoto, GitHub, Vercel ou produção.

| Comando ou verificação                                                                                      | Resultado real nesta continuação                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                                                                                              | Passou, incluindo a regra de texto sem travessão, meia-risca ou emoji                                                                                                                                                                                        |
| `npm run typecheck`                                                                                         | Passou                                                                                                                                                                                                                                                       |
| `npm run build`                                                                                             | Passou; service worker gerado com 106 entradas no precache                                                                                                                                                                                                   |
| `npx playwright test tests/e2e/conheca.spec.ts`                                                             | Falhou antes dos testes: `tsx` com `uv_os_get_passwd`/`ENOMEM`                                                                                                                                                                                               |
| Primeira tentativa de `.local/auditoria-publico/landing.config.ts`                                          | Falhou antes dos testes: `MODULE_NOT_FOUND`, pois o diretório do config temporário virou o diretório de trabalho do servidor. Corrigido com `cwd` explícito para a raiz deste checkout em ambos os servidores                                                |
| `node .local/auditoria-publico/prepare-landing-runtime.mjs`                                                 | Atualizados 35 módulos temporários de servidor/motor a partir das fontes atuais deste checkout                                                                                                                                                               |
| `npx playwright test -c .local/auditoria-publico/landing.config.ts tests/e2e/conheca.spec.ts` após o ajuste | Seis cenários aprovados em Chromium, um worker, saída 0, `6 passed (1.4m)`                                                                                                                                                                                   |
| Pôsteres e ausência de MP4 no E2E                                                                           | `currentSrc` e imagem carregada conferidos em 390 e 1440 px; proporções 9:16 e 16:9 conferidas. Teste adicional em 767, 768 e retorno a 767 px, com JavaScript desligado. Nenhum pedido `.mp4`, inclusive com query/hash, nos cenários que monitoram a mídia |
| Instalação e manual no E2E                                                                                  | Abas Android/iPhone/Computador, teclado, aviso do Instagram, navegação para entrar, manual e FAQ aprovados                                                                                                                                                   |
| Inspeção visual                                                                                             | Capturas locais de celular e computador em `artifacts/screens/l1-conheca-celular.png` e `l5-conheca-computador.png` abertas e conferidas                                                                                                                     |
| `git check-ignore --no-index`                                                                               | Regra de SFX confirmada para caminhos em kinetic/desktop, mobile e youtube                                                                                                                                                                                   |
| `git diff --check` e Prettier nos arquivos desta continuação                                                | Diff sem erro de whitespace; formatação ajustada no HTML e neste parecer após os avisos iniciais                                                                                                                                                             |

A configuração alternativa importa `../../playwright.config`, mantém os mesmos projetos e testes, redefine `testDir` para `../../tests/e2e` e `cwd` de cada `webServer` para a raiz do checkout. Somente o comando da API muda para `node .local/auditoria-publico/start-api.mjs`. Este inicia `startLocalSupabase({port:54329,seed:true})` do runtime temporário. O preparo usa `typescript.transpileModule` em ESNext/ES2022, acrescenta `.js` aos imports relativos e preserva a URL de origem em `import.meta.url` para carregar as migrações reais. O servidor web continua fazendo build em modo E2E e preview local em 4173. Não foram alterados dependências, lockfile ou configuração versionada de execução.

Como na coleta anterior, o encerramento automático dos servidores ficou aguardando depois dos seis resultados aprovados. Conferidos logs de inicialização, horário dos processos e portas locais 54329/4173; encerrados somente os dois processos Node criados para API e preview desta execução. O runner terminou então com saída 0. A consulta CIM de linha de comando foi negada pelo ambiente. Os arquivos temporários permanecem em `.local`, ignorado. As capturas ficam em `artifacts`, também ignorado.

Na conferência direta dos dois pôsteres, ambos mostram a marca e o convite para começar. O `alt` e a legenda foram ajustados para esse conteúdo. Repetido o E2E completo da landing após esse ajuste: `test-results/.last-run.json` registrou `status: passed` e `failedTests: []`, com a mesma limpeza dos dois servidores no encerramento. Lint e build foram repetidos e passaram. Confirmado por comparação com os blobs de `HEAD` que os três WebPs foram preservados byte a byte; os 14 WAVs e os dois MP4s estão ausentes, inclusive os MP4s no `dist` do build final. Branch e HEAD continuam `claude/ios-prova-instalacao` e `7d6018c`.

Não foram renderizados vídeos nem executados a suíte E2E completa, a suíte unitária, Actions, build macOS ou validação de produção nesta continuação. Os renders existentes precisam dos sons e da trilha repostos localmente conforme `SETUP.md`. A revisão do Claude desta continuação permanece pendente, distinta do aceite da auditoria anterior informado pelo Caio.

## Passagem para o Claude

1. Auditoria anterior aceita pelo Claude conforme informado pelo Caio. Revisar agora o diff da continuação: landing com pôsteres, remoção dos dois MP4s e 14 WAVs, regra de ignore, SETUP, E2E e workflow manual.
2. MP4s e WAVs resolvidos por remoção. Distribuição RepDB e nome nos textos legais ficam para a revisão jurídica do Caio. Rever origem e licença dos sons e da trilha antes de eventual retorno dos filmes.
3. Preparar o retrato final sem os commits que ainda conservam dados anteriores. Separar as correções comuns e o app iOS conforme o plano de publicação.
4. Repetir checks relevantes no estado que for separado e, quando houver autorização de publicação, executar o primeiro build macOS e o aceite no aparelho.

As alterações da auditoria e desta continuação ficaram sem commit, conforme o pedido do Caio. Nenhum remoto foi consultado ou alterado nesta continuação.
