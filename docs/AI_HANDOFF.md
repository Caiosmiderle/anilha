# Registro entre Codex e Claude

## iOS 0.17.0, análises e revisões por conta, Codex, 12/11/2026

- Branch recebida limpa `codex/ios-analises-sync`, base `e95b21f7d4ef613f20bcc746b2755a7f181edc9b`. Entrega só local, sem escrita em `.git`; Claude revisa e commita. Revisão desta entrega **PENDENTE**.
- `AnalysisSync`/`AnilhaCache` portam payload sem undo, fingerprint estável, push das mudanças e merge que preserva edição em voo e undo local com mesmo status. Cursor/hashes por conta, transação por página e limpeza existente na saída. Só `analysis:` e `review:`.
- `ContaStore` chama as RPCs existentes após `sync_pull`, com lotes/paginação, conta/geração e token fixado. Falha complementar não muda o aviso de sucesso da sync principal. Migração intacta, nada publicado, versão **0.17.0**.
- Adaptados versão/binding/exercises da revisão entre site e nativo. Corrigida leitura de estados incompletos nos cartões/caches PWA. Desfazer nativo só aparece com snapshot local.
- Passaram **80 testes TS em 16 arquivos do CI iOS**, três geradores `--check`, lint, typecheck, build e diff. Após ampliar estados incompletos, os **18 testes** dos dois arquivos afetados passaram novamente. Typecheck/lint finais passaram. Falhas intermediárias de shim do gerador e tipos corrigidas; aviso de import no bundle de fixtures permanece não impeditivo.
- Fixture do TS real com quatro payloads, quatro merges, seis ciclos e revisão. Quatro métodos Swift preparados. `swift test` tentado, comando ausente; CI Apple, Swift 6/iOS 26, iPhone e sync real **PENDENTES**. E2E não executado.
- Parecer e roteiro em [REVISAO_CODEX_ANALISES_SYNC_2026-11-12.md](REVISAO_CODEX_ANALISES_SYNC_2026-11-12.md). Claude deve revisar especialmente adaptação da revisão, fingerprints, edição em voo, conta/geração e isolamento da falha; depois commitar esta árvore. Sem commit/push pelo Codex.

## iOS 0.16.0, ficha manual e Ignorar, Codex, 12/11/2026

- Branch `codex/ios-ficha`, recebida limpa em `e39602b`, com chat `4dfa9f2`. Entrega local para revisão e commit do Claude. Revisão desta entrega **PENDENTE**.
- Nova ficha e Editar nativos, catálogo compartilhado com próprios, campos/padrões do PWA, mover/remover, desfazer pares separados e exclusão confirmada por lápides. `WorkoutAnalysis.fichaChanges` compartilhada e `routines` liberada na fila atômica. Snapshot de abertura preservado e conferido antes de salvar/apagar.
- Ignorar em foco e lista, alvo de 44 pt e acessibilidade pedida, persistido só no aparelho por conta/sessão. Restaura séries pendentes de `increase`/`decrease` com histórico e invalida seus rascunhos na mesma transação. Outros tipos guardam só o estado ignorado. Corrigida borda de `lastTimeFill` com cargas mais curtas que os valores.
- Avisos de volume reutilizam a porta existente, incluindo frequência e mudança de divisão. Aviso específico de frequência sem porta identificada **PENDENTE**. `nova_ficha` pelo chat continua no site.
- Demo `ficha-nova`, `ficha-editar` e sugestão na execução. Duas telas adicionadas à matriz anterior. Versão **0.16.0**. Vetores `routines.json` com 36 padrões, 7 escritas, 1 exclusão, 14 restaurações e 4 cenários da fila.
- Passaram 71 testes TS do CI iOS em 13 arquivos, dois novos repetidos após ampliar vetores, lint, typecheck, build, três geradores `--check`, Bash e diff. Falhas iniciais do gerador/typecheck corrigidas. Swift tentado e ausente neste Windows. Quatro métodos novos, CI Apple, capturas, iPhone e sync real **PENDENTES**. E2E não executado.
- Parecer em [REVISAO_CODEX_FICHA_2026-11-12.md](REVISAO_CODEX_FICHA_2026-11-12.md). Claude deve revisar atomicidade, snapshots, pares, paridade, persistência/rascunhos e acessibilidade antes de commitar. Continuar desta árvore local e base `e39602b`.

## iOS 0.12.0, chat nativo do Waltér, Codex, 12/11/2026

- Branch recebida limpa `codex/ios-chat`, base `d2f38d9`. Entrega só local, sem escrita em `.git`; Claude revisa e commita. Revisão desta entrega **PENDENTE**.
- Hoje abre `ChatWalterView`, com Harbor, mensagens, respostas rápidas, teclado, última mensagem, carregamento, erro, cota e sem rede. Mesmo `{messages}`/loop de quatro rodadas da função `agente` existente, Haiku e limite compartilhado. Nenhum servidor alterado.
- `AnilhaCore` com edição completa de ficha e substitutos. Contexto do PWA, frequência/retorno e saúde exclusivamente pelo consentimento `History.healthOn`. Conversa em memória por conta; limpeza/revogação invalida respostas pendentes e snapshots locais.
- Cartões antes/depois, volume/avisos e Salvar/Recusar/Desfazer pela fila da parte B. Extraída a transformação de linhas compartilhada com a parte C; bindings e desfazer bloqueiam substituição de edições posteriores.
- Gerar plano/criar ficha seguem pelo site com aviso explícito. Direções usam destinos do site; pedidos não atendidos ainda não são registrados pelo nativo na equipe, e a tela avisa. Sem tabela, coluna, RPC ou pacote novos. Versão **0.12.0**.
- Passaram 111 testes TS em 14 arquivos, incluindo o passo do CI iOS e testes do agente; três repetidos após ampliar vetores de teto e mudança nula. Geradores `--check`, lint, typecheck, build, Bash e diff aprovados. 25 vetores de ferramentas, 12 contextos e 10 escritas, gerados do TS real.
- Seis métodos Swift novos preparados. `swift test` tentado e ausente no Windows. CI Apple, Swift 6/iOS 26, iPhone e **print nativo ainda PENDENTES**. Demo `-demo chat` com proposta real local, matriz de 48/96 PNGs preparada; não confundir com captura executada. E2E/modelo remoto não executados.
- Parecer, limitações e roteiro em [REVISAO_CODEX_CHAT_2026-11-12.md](REVISAO_CODEX_CHAT_2026-11-12.md). Claude deve revisar fila/conflitos, porta/avisos/substitutos, privacidade durante requisição, teclado/fonte grande e capturas. Sem commit, push ou publicação pelo Codex.

## iOS 0.11.0, memória das análises, Codex, 12/11/2026

- Branch recebida limpa `codex/memoria-analise`, origem `493bde4`; entrega local, sem escrita em `.git`. Claude revisa e commita; revisão desta entrega **PENDENTE**.
- `memory` opcional na análise e revisão: três análises locais da ficha, avaliação, comentários da IA e operação/destino do ajuste, com limites e associação pelo catálogo. Sem SQL novo ou mudança do motor.
- Dica Waltér no foco nativo, foco PWA e cartão PWA, da última análise, até 21 dias e com exercício/linha da ficha conferidos. Demo nativa preparada; print PWA `artifacts/screens/211-foco-memoria.png`.
- Quinze vetores TS/Swift; passaram 61 testes TS do CI, geradores `--check`, lint, typecheck, build e E2E local novo com `.local/e2e-dist`. Falhas intermediárias e limites registrados no parecer.
- Swift tentado, ausente no Windows; teste Swift, CI Apple, captura nativa e iPhone **PENDENTES**. Servidores ampliados devem ser publicados antes dos clientes, após revisão/autorização. Nada publicado pelo Codex.
- Parecer, prompt, custos extras estimados e roteiro em [REVISAO_CODEX_MEMORIA_2026-11-12.md](REVISAO_CODEX_MEMORIA_2026-11-12.md). Revisões já guardadas mantêm o cache por versão da ficha.

## iOS 0.10.0, revisão da ficha com corridas, Codex, 12/11/2026

- Branch `codex/revisao-ficha`, base `f7ebee8`, arquivos interrompidos revisados/aproveitados; entrega só local, sem escrita em `.git`. Claude revisa e commita; nada publicado.
- Nova `revisao-ficha`, só admin via JWT/`is_admin`, cota compartilhada, Sonnet 5.5, `auto`, 8.000 tokens/120 s, sem repetição. Contexto permitido da ficha/plano/volume e corridas feitas/planejadas em 14 dias, projeção e alerta existentes; TS/Swift com seis vetores.
- Cartões PWA/iPhone com até três ajustes fechados, antes/depois, Aplicar/Recusar separados, desfazer protegido, cache por conta e versão com `updated_at` dos itens, uso/custo. LGPD com base legal a definir; iOS **0.10.0**.
- Análise Opus/Haiku inclui corridas em dois dias antes/depois; contrato aceita clientes antigos sem o campo. Corrigido timeout herdado dos clientes de 45 para 125 s, contra 120 s do Opus. Chat intacto no Haiku.
- Passaram geradores `--check`, lint, typecheck, build e diff; 55 testes TS do conjunto CI cobertos nas execuções descritas no parecer. Quatro E2E da análise e um novo da revisão passaram; revisão repetida após acabamento final. Só API/PGlite locais e `.local/e2e-dist`.
- Swift tentado, ausente no Windows; quatro testes Swift novos, paridade Apple, CI, iPhone e modelo real **PENDENTES**. Demo `revisao` na matriz, 46/92 PNGs esperados; print PWA `210-revisao-ficha.png` inspecionado. Revisão do Claude **PENDENTE**.
- Parecer, prompt/esquema, custos, falhas e roteiro em [REVISAO_CODEX_REVISAO_FICHA_2026-11-12.md](REVISAO_CODEX_REVISAO_FICHA_2026-11-12.md). Após revisão/OK, publicar funções ampliadas antes dos clientes; a análise v2 atual rejeita `running`. Sem SQL novo.

## iOS 0.8.0, Histórico, Codex, 12/11/2026

- Branch `codex/ios-historico`, origem `116ddd4`, recebida limpa. Entrega local; Claude revisa e commita por decisão do Caio sobre `.git`.
- `HistoricoView` com Treinos, Progresso, Semanas e Corpo, na ordem e com informações/vazios do PWA, Harbor e Swift Charts. Detalhe existente conserva Evolução e Análise.
- Porta do motor TS com 12 vetores de progresso/semanas/volume e 11 de corpo; cinco métodos Swift novos preparados. Peso/cintura criam, corrigem e apagam pela fila da parte B, com consentimento persistido por conta e RPCs existentes.
- `body_logs` incluída no pull/cache, replay versão 2 preservando pendências e negativa limpando saúde/fila. Sem mudança de esquema. Quatro abas registradas no roadmap; `TabView` intacta para o Claude integrar Hoje, Plano, Histórico e Você.
- Versão **0.8.0**, demo das quatro partes e matriz claro/escuro, 40 PNGs normais ou 80 com fonte grande. Capturas Apple ainda não executadas.
- Passaram os dois geradores `--check`, **45 testes TS do passo do CI**, lint, typecheck, build, Bash e diff. Swift tentado e ausente; CI Apple, paridade Swift, prints, aparelho e revisão do Claude **PENDENTES**. E2E não executados.
- Parecer, fontes, limites, ações fora do escopo e roteiro em [REVISAO_CODEX_HISTORICO_2026-11-12.md](REVISAO_CODEX_HISTORICO_2026-11-12.md). Continuar do checkout local, sem commit/push do Codex.

## iOS 0.7.0, calendário integrado, Codex, 12/11/2026

- Branch `codex/ios-calendario`, origem `814ea28`, recebida limpa. Entrega local para revisão e commit pelo Claude, conforme pedido do Caio sobre `.git`.
- Calendário mensal no PWA, com entradas em Histórico e Plano, e aba SwiftUI com Harbor. Força e corrida coexistem no dia, com pontos, seleção e detalhes. Decisão híbrida registrada no roadmap.
- Dados de `sessions`, `runs`, `external_plan_items`, `routines`, `plans` e `day_overrides`. As duas tabelas de corrida já passam pelo pull/cache nativo. Nenhuma mudança de esquema necessária.
- Função pura TS portada ao `AnilhaCore`, 15 vetores, dois métodos Swift novos. Projeção existente `projectDays`, sem `todayRec`; aviso de perna extraído da recomendação, com paridade. Importância vem do planejado externo.
- Lint, typecheck, build, 34 testes TS focados, gerador `--check`, sintaxe Bash e diff passaram. E2E mobile local aprovado, com ingestão CRUNNING, detalhes e quatro prints PWA, build isolada em `.local/e2e-dist`.
- `swift test` tentado, comando ausente. CI, Swift 6/iOS 26 e aparelho pendentes. Demo e CI esperam 34 PNGs normais ou 68 com fonte grande. Corrigido teste herdado incompatível com os tamanhos configuráveis do CI do Claude.
- Parecer em [REVISAO_CODEX_CALENDARIO_2026-11-12.md](REVISAO_CODEX_CALENDARIO_2026-11-12.md), com fontes, limites e falhas reais. Claude deve revisar projeção, avisos, sync, Swift, UI e capturas. Revisão mútua desta entrega **PENDENTE**.

## iOS 0.6.0, execução em foco e baralho no descanso, Codex, 12/11/2026

- Autor Codex. Branch recebida `codex/ios-execucao`, origem `1c96097`, iOS 0.5.0. Estado inicial com apenas `RestCards.swift` não versionado da execução interrompida, revisado e aproveitado. Entrega na árvore local para revisão e commit do Claude, conforme pedido do Caio sobre `.git`. Versão **0.6.0**.
- Foco como abertura padrão, com ficha, cronômetro pelo início persistido, prescrição grande, aquecimento, estado sem valor, ação circular e Ajustar. Lista a um toque, menu concentrado, exercícios recolhidos e painel fixo com controles únicos de carga e repetições. Esforço em quatro chips numa linha, com encerramento visual após escolha ou dez segundos. As operações existentes de treino/cache/fila sustentam a nova apresentação.
- Descanso com contagem, controles de 15 segundos, Pular, progresso e Jogar uma mão. Blackjack e poker de uma troca, cartas e naipes desenhados em SwiftUI, animação com Reduzir Movimento, nomes acessíveis e anúncio do resultado. Preferência local em `@AppStorage`, mão temporária em memória e fechamento pelo prazo absoluto, com feedback e Próxima série. Banca para em todo 17, inclusive macio. Lógica pura com gerador injetável no `AnilhaCore`.
- Correções de fonte do visual recebido. Cor global removida das raízes e primeiro plano `Tema.sobreMarca` centralizado no estilo preenchido compartilhado. Hoje destaca o treino ativo acima do planejado. Datas do histórico em pt-BR, título de Evolução único na demonstração e custo decimal em pt-BR nos dois clientes.
- **Ignorar sugestão está PENDENTE.** A parte B nativa carece da operação equivalente a `lastTimeUpdates` do PWA para restaurar todas as séries pendentes e invalidar seus rascunhos. Esse ponto foi interrompido e registrado conforme a regra de parar ao precisar alterar lógica de treino. O Caio recebeu essa dependência durante o trabalho. Parecer descreve a continuação e os testes necessários.
- Validações locais passaram com lint, typecheck, build, geradores `--check`, Bash pelo executável do Git e diff. **825 testes TS em 68 arquivos**, cinco checks da fixture, **oito E2E móveis em duas execuções** com saída zero. A segunda inclui a expectativa explícita de `0,0003395`. API/banco locais e `.local/e2e-dist` mantidos no fluxo dos E2E. Capturas PWA 05/06, 190/191 e 208/209 atualizadas na pasta ignorada `artifacts/screens`.
- Limites e falhas reais. A primeira tentativa E2E falhou antes dos cenários por `os.userInfo`, `uv_os_get_passwd` com `ENOMEM`. O preload temporário documentado no parecer forneceu um usuário sintético apenas à pasta temporária do tsx. O teardown aguardou servidores no Windows. Listeners e horários foram conferidos, e apenas os servidores da execução foram encerrados. Bash e Python estavam fora do PATH ou ausentes. Textos afetados por pipe Unicode do PowerShell foram corrigidos por patch UTF-8.
- **16 testes Swift novos, 46 métodos ao todo, preparados e ainda não executados.** `swift test` foi tentado e falhou por comando ausente. CI da nova árvore deve provar Swift 6, UI Apple e **60 PNGs esperados**, quinze telas em claro/escuro e `.large`/`.accessibility3`. Estados novos incluem lista, esforço, blackjack no meio da mão, poker com cartas seguradas e Próxima série. O prazo vencido da fixture passa pelo estado real do descanso. O workflow permite continuar archive diante de falha de captura, portanto conferir manifesto e imagens.
- Parecer completo em [REVISAO_CODEX_IOS_EXECUCAO_2026-11-12.md](REVISAO_CODEX_IOS_EXECUCAO_2026-11-12.md). Claude deve revisar especialmente estilo compartilhado, Swift 6, bindings/rascunhos, expiração e retomada do jogo, fonte grande em iPhone estreito, VoiceOver, notificações e aceite da parte B no aparelho. A ação Ignorar e a revisão do Claude desta entrega continuam **PENDENTES**.

## iOS 0.5.0, visual nativo e prints no CI, Codex, 12/11/2026

- Autor Codex. Branch recebida `codex/ios-visual`, origem `6491647`, checkout inicialmente limpo. Intenção de dar acabamento às telas SwiftUI e gerar evidência pública no simulador. Entrega na árvore local, com revisão e commit a cargo do Claude por instrução do Caio. Versão **0.5.0**.
- Hoje com cabeçalho, selo, disco do grupo e vidro do iOS 26. Treino com progresso e campos numéricos maiores, descanso com relógio escalável e controles de vidro. Resumo, Fichas, detalhe, Histórico e Entrar com hierarquia Harbor. Cores de grupos reproduzem a taxonomia do PWA. Fontes dinâmicas, rótulos acessíveis, alvos de 44 pt e tratamento de Reduzir Movimento/Transparência.
- Evolução mais compacta no iOS e PWA, com valor/delta na mesma linha e recordes junto do nome do exercício. Análise nativa agrupada em um cartão, próxima vez compacta e rodapé único de modelo, entrada/saída de tokens e custo estimado. No PWA, a prévia salva na Análise concentra “Na próxima vez” dos itens cobertos. Respostas antigas e itens sem prévia conservam a sugestão por exercício.
- Demonstração exclusivamente `#if DEBUG` com argumento `-demo tela`, dados fictícios em memória e controles sem interação. A raiz demonstrativa evita a abertura da conta. O construtor privado Debug evita o acesso ao armazenamento lazy de chaveiro e avisos, e o construtor normal inicializa os dois serviços imediatamente. O CI prepara **40 PNGs** com dez telas, claro/escuro e `.large`/`.accessibility3`, incluindo enquadramentos separados de Evolução e Análise. `Anilha-SwiftUI.zip` vai ao artefato do run e à Release `ios-build-N` do IPA. Captura e upload de evidência permitem continuação do archive quando falham.
- Validações locais passaram com lint, typecheck, build, **823 testes TS em 68 arquivos**, três checks novos da fixture e verificadores dos geradores, sintaxe Bash e diff. Depois dos ajustes de isolamento e data, **sete E2E móveis passaram em duas execuções conjuntas**, saída 0, incluindo os cartões, payload iOS, telas gerais e onboarding. O último conjunto inclui o rodapé acessível definitivo e capturas atualizadas.
- Falhas registradas no parecer. O teste visual geral esperava aquecimento de retorno já vencido em novembro. A data foi fixada apenas no teste. A primeira leitura da fixture no teste novo usou caminho relativo incorreto, corrigido. O teardown do Playwright aguardou os servidores no Windows, encerrados após conferir listeners e horários dos PIDs da execução. Capturas 208/209 atualizadas, também escuras e em fonte ampliada, em `artifacts/screens`, pasta ignorada pelo Git.
- Incidente na repetição conjunta. O Codex iniciou uma build normal em paralelo ao E2E e o bundle de `dist` foi substituído. Quatro testes tentaram OTP no host de produção, todos bloqueados com `net::ERR_NETWORK_ACCESS_DENIED`, status `-1`, conforme os quatro traces. A saída do build/preview Playwright passou a `.local/e2e-dist`. O parecer registra cenário, evidência sanitizada e a repetição sequencial.
- Swift está ausente neste Windows. `swift test` não iniciou. Compilação Swift 6, apresentação Apple, VoiceOver, captura `simctl`, archive e ZIP remoto dependem do próximo CI. Os comandos e APIs foram conferidos em documentação Apple, e o script guarda a ajuda do Xcode efetivo no ZIP. Esta entrega ainda está somente no checkout.
- Parecer completo em [REVISAO_CODEX_IOS_VISUAL_2026-11-12.md](REVISAO_CODEX_IOS_VISUAL_2026-11-12.md). Claude deve revisar especialmente o isolamento Debug, serviços sob demanda, `@ObservationIgnored`, Swift 6, enquadramento dos PNGs, os dois tamanhos de texto e a apresentação de análises antigas. Revisão do Claude desta entrega e da C.2 continuam **PENDENTES** até registro efetivo.

## iOS Parte C.2, evolução do treino, Codex, 12/11/2026

- Autor Codex. Branch recebida `codex/ios-analise`, origem `4498035f119ac79036c857e28a6e9b71426de684`, checkout inicialmente limpo. Intenção de mostrar evolução local e ampliar a análise no padrão da referência CRUNNING. Versão **0.4.1**. Caio informou revisão/push da parte C pelo Claude e build 4 em execução no CI. A revisão do Claude de **C.2 está PENDENTE**. Entrega somente local, com commit/push a cargo do Claude conforme pedido expresso do Caio sobre `.git`.
- Evolução grátis e offline antes da IA no iOS e PWA, com séries lado a lado, esforço, última vez em qualquer ficha, carga máxima, melhor série na mesma carga, volume e máximos simples pessoais. Séries feitas antes e depois de troca permanecem visíveis. Aquecimentos aparecem, comparações/recordes usam trabalho. Primeira ocorrência é base, tempo usa segundos e volume indisponível. Funções puras TS portadas ao Swift, com **14 vetores**.
- Contexto permitido agora inclui até cinco ocorrências do exercício, dias atrás, melhor série, volume e `next` do motor real, sem gravar. A prévia usa a ficha disponível ao analisar e a semana do dia analisado, condição mostrada no cartão. Data futura, edição da ficha e novos treinos podem mudar a abertura real. Ausência de base ou associação segura resulta em nulo. Histórico futuro fica fora do retrato.
- Saída estrita com `avaliacao` fechada, `summary`, até três `points`, comentários `proximaVez` por slot e um ajuste `series`, `repeticoes` ou `trocar`. Números da próxima vez vêm do `next` guardado. Comentário com numerais é ocultado. Mantidos Salvar/Ajustar/Recusar e desfazer. Respostas antigas abrem sem inventar campos novos.
- Função devolve modelo e tokens informados pela API em `usage`, guardados localmente e exibidos junto do custo estimado. Mesma tabela local da parte C, US$ 0,10/0,50 por milhão. Cenário sintético com oito exercícios, cinco ocorrências e prévia, três anteriores da ficha e 500 tokens de saída estima **US$ 0,0008459**. Não houve chamada ao modelo ou contagem remota.
- Validações reais locais passaram com lint, typecheck, build, geradores/`--check`, **820 testes TS em 67 arquivos**, **28 testes focados** e **cinco E2E móveis**, inclusive repetição após revisão visual. Dez casos confrontam `next` com as séries gravadas ao abrir pelo motor. `git diff --check` passou. Falhas intermediárias de fixture/artefato e `EPERM` no primeiro E2E, diagnóstico e limpeza dos servidores estão no parecer.
- `swift test` não iniciou porque Swift está ausente neste Windows. **Três métodos Swift novos, 30 preparados ao todo**, ainda não executados nesta intervenção. CI inclui os casos novos antes do archive. Compilação Swift 6/iOS 26, migração sobre 0.4.0, Dynamic Type, VoiceOver e aceite no iPhone continuam pendentes. A build 4 da parte C informada pelo Caio não comprova C.2.
- Nenhuma coluna, RPC, tabela, migração ou entidade SwiftData nova foi necessária. Arquitetura, política de sync e descrições factuais de privacidade atualizadas. Revisão jurídica da parte C continua pendente. Produção, modelo real e publicação dependem do fluxo autorizado pelo Caio.
- Parecer completo, prompt e esquema novos, estimativa, falhas e roteiro estão na seção **Parte C.2** de [REVISAO_CODEX_ANALISE_2026-11-12.md](REVISAO_CODEX_ANALISE_2026-11-12.md). Claude deve revisar especialmente a porta nativa, os vetores, o contrato novo, as condições da previsão, o rodapé e compatibilidade das análises antigas, depois commitar a árvore local conforme combinado.

## iOS parte C, análise do treino, Codex, 12/11/2026

- Autor Codex. Branch recebida `codex/ios-analise`, base `c8a90b9`, checkout inicialmente limpo. Intenção: análise do Waltér após concluir o treino, também no detalhe do PWA. Versão **0.4.0**. Conforme pedido do Caio: sem escrita em `.git`, branch nova, commit, push ou produção; Claude revisa e commita. Referência CRUNNING somente lida; Treinapp não alterado.
- Nova função **`analise-treino`**, modelo `claude-haiku-5-5`, mesmo segredo Anthropic, **`verify_jwt = true`**, verificação adicional do usuário e as RPCs existentes `agent_begin_turn`/`agent_end_turn`. Mesmo limite diário do chat, sem quota nova. Contrato gerado, validado antes de reservar uso, ferramenta estruturada única, timeout e SDK sem repetição automática. Sem chave usada ou chamada real ao modelo. **Nenhuma migração SQL, tabela ou RPC nova necessária.**
- Contexto puro TS portado ao Swift com cinco vetores: números planejados/feitos, aquecimento, pulos/trocas, esforço, até três anteriores da mesma ficha, semana/foco/leve e regra aplicada. Lista permitida exclui dados pessoais, notas/motivos livres e saúde mesmo com consentimento. Nomes só do catálogo; personalizado vira rótulo genérico. Retratos numéricos e regra são metadados locais; sem retrato antigo usa vazio/`unknown`, sem inventar a carga planejada.
- Saída: resumo, até três pontos e no máximo uma operação `series`, `repeticoes` ou `trocar`. Carga inicial fora desta fase porque as ferramentas atuais não a gravam. Ajuste inválido é descartado; narrativa válida aparece. PWA usa `executeTool`/`applyProposal`; Swift porta associação de linhas e limites, mais avisos de volume do motor com 36 vetores. Salvar vai pelo outbox normal da parte B; antes/depois, Ajustar, Recusar e desfazer persistente com proteção de revisão.
- No iOS, conclusão e marca pendente são atômicas; com rede analisa em seguida, offline aguarda reconectar/primeiro plano, com Analisar agora. Tentativa enviada e interrompida exige repetição explícita. Resposta local e estado do cartão não fazem parte do sync. Reabrir resposta guardada não chama o modelo. Falha de disco guarda resposta em memória para tentar persistir; sem idempotência remota, perda da resposta na rede ou outro aparelho pode consumir outra chamada.
- Bug herdado reproduzido e corrigido em `src/agent/apply.ts`: exercícios repetidos em posições distintas podiam trocar posição/metadados ao salvar uma edição em outra linha. Teste falhou antes e passou depois de ordenar por posição e ID. Não muda regras de progressão.
- LGPD, política pública, arquitetura e política de sync atualizadas. Base legal do assistente/análise **a definir**, sem mudar `TERMS_VERSION`. Estimativa offline pela tabela local Haiku: cerca de **4.393 tokens de entrada + 300 de saída = US$ 0,0005893** para oito exercícios e três anteriores; não é medição do provedor.
- Validações finais: geradores e `--check`, lint, typecheck, build, **806 testes TS em 66 arquivos**, **quatro E2E móveis locais** e `git diff --check` passaram. E2E repetido após os ajustes finais, saída 0 em ambas as execuções; detalhes no parecer. `swift test` não iniciou porque Swift não está instalado neste Windows. **Sete métodos Swift novos, 27 no total, preparados e ainda não executados.** CI mantém Swift antes do archive e inclui E2E da análise. Sem prova nova de CI, runtime Apple, IPA ou aparelho.
- Parecer completo, prompt/esquema, custos, falhas e roteiro: [REVISAO_CODEX_ANALISE_2026-11-12.md](REVISAO_CODEX_ANALISE_2026-11-12.md). Caio informou que a build 3 da parte B passou com os 20 testes Swift, ainda sem teste no iPhone; isso não valida esta parte C. Claude deve revisar o diff, especialmente Swift 6/SwiftData sobre 0.3.0, rede/conta, contrato estrito, filas/desfazer, avisos e bug dos repetidos. Revisão do Claude desta entrega: **PENDENTE**. Não aplicar/publicar nada até o OK do Caio; ordem no parecer: revisão/CI, decisão jurídica, nenhum SQL novo, função autenticada, depois clientes e aceite conjunto no aparelho.

## iOS etapa 3B, executar ficha e enviar, Codex, 12/11/2026

- Autor Codex. Branch recebida `codex/ios-treino`, base `c32ca5b`, checkout inicialmente limpo. Intenção: treino offline e gravação na conta do PWA. Por pedido expresso do Caio: sem escrita em `.git`, branch nova, commit ou push; Claude revisa e commita. Sem produção, migração, coluna/RPC nova ou publicação. Versão **0.3.0**.
- Política documentada antes de gravar em [POLITICA_SYNC_IOS.md](POLITICA_SYNC_IOS.md): push aceita carimbo igual (`<=`); pull preserva só pendência estritamente maior; ACK protege edição durante envio; lápides, `sync_ids` e horizonte de retenção. Substituída a limpeza total da parte A por reconciliação que preserva fila. `records` entra no pull com releitura versionada e cursor anterior preservado para retenção.
- Entrega: iniciar/retomar em Hoje e Ficha, séries ordenadas, aquecimento, sugestão/última vez, ajuste rápido e entrada numérica, rascunho único persistente, esforço, bi-set, trocar/mover/pular exercício, descanso por relógio salvo, aviso local com autorização e cancelamento, concluir com planejado/feito e reabrir resumo no Histórico. SwiftData confirma linhas/fila e conclusão/recordes atomicamente. Envia em lotes pela RPC existente, depois puxa. Disparos: concluir, abrir/primeiro plano, atualizar e reconectar. Saída com pendência/rejeição avisa e pede confirmação.
- Motor portado por decisões numéricas do TS, incluindo progressão, pré-preenchimento, aquecimento, retorno usado pela tela, semana leve aceita, bi-set, editor, ordem e recordes. Vetores em `training.json`; `session.json` vem das funções reais de gravação do PWA com dados fictícios. Catálogo inclui metadados necessários, sem regra nova no TS. CI mantém `swift test` antes do archive e passa o JSON emitido pelo Swift ao E2E local.
- Validações reais: gerador/`--check`, lint, typecheck, build, **791 testes TS em 64 arquivos** e **1 E2E móvel local** passaram. Após ampliar vetores, os **4 testes de artefatos** passaram novamente. `git diff --check` passou. `swift test` não iniciou porque Swift não existe neste Windows. **20 métodos Swift preparados, não executados**. E2E Windows usa fixture de contrato gerada pelo PWA; o payload executado pelo Swift depende do CI, ainda não observado.
- Falhas registradas no parecer: IDs iniciais incorretos no gerador e erros de tipagem corrigidos; primeira tentativa E2E esperava indicador ausente no Histórico, corrigida. Runner Windows aguardou servidores após resultado; somente os PIDs conferidos nas portas locais desta execução foram encerrados, e a segunda execução terminou com saída 0. Sem Xcode, novo IPA, teste visual ou execução no iPhone. O sucesso da 0.2.0 foi informado pelo Caio, não valida esta 0.3.0.
- Parecer completo, achados, comandos, fontes, limites e roteiro de aceite: [REVISAO_CODEX_IOS_TREINO_2026-11-12.md](REVISAO_CODEX_IOS_TREINO_2026-11-12.md). Claude deve conferir especialmente compilação Swift 6/concorrência, migração sobre 0.2.0, fila/ACK/horizonte, troca após série feita, paridade e notificações. Revisão do Claude desta entrega: **PENDENTE**. Etapa 3 só aceita depois de concluir offline, fechar/reabrir, enviar sem duplicar e comparar no PWA no aparelho.

## iOS etapa 3A, login e consulta, Codex, 12/11/2026

- Autor Codex. Branch recebida `codex/ios-login`, base `fec24fc`, checkout inicialmente limpo. Intenção: entrar por código e consultar dados reais/offline, sem gravação de treino. Por instrução expressa do Caio: sem criar branch ou escrever em `.git`; Claude revisa e commita. Tudo só neste checkout, sem produção, publicação ou push.
- Entrega: Supabase Swift **2.55.6 exata**, confirmada na release oficial; OTP `.email`; sessão no Keychain com checagem de persistência e saída local offline que sela o armazenamento do cliente antigo. Configuração gerada da `.env.production`, somente URL e chave publicável. Pull com token fixado por chamada, paginação, cursor atômico, lápides, isolamento por conta e recuperação por `horizon` uma vez por ciclo. SwiftData das onze tabelas pedidas, sem outbox ou `sync_push`.
- Hoje com plano/rotação e planejado separado do realizado; Fichas com prescrição e carga anterior; histórico curto com origem CRUNNING; começar desligado. Catálogo de **92 exercícios** e taxonomia gerados do TS; **15 vetores de plano e 44 de projeção** para paridade Swift. Pacote local com produtos `AnilhaCore` e `AnilhaCache` e testes SwiftData em memória. CI gera os recursos e roda testes TS/Swift antes de archive.
- Revisão estática da prova do Claude: faixas com meia-risca estavam fora do alcance do verificador, agora estendido a Swift; URL completa deixava parâmetros visíveis, agora só confirmação genérica. Nenhum vazamento real observado. O relato anterior de instalação vem do Caio, não de uma nova execução do Codex.
- Validações reais: gerador e `--check`, lint, typecheck, build e **53 testes TS em 5 arquivos** passaram. `git diff --check` passou. `swift test --package-path ios/AnilhaCore` não iniciou: `swift` ausente no Windows. **11 métodos Swift escritos, não executados**. Sem login real, runtime Apple, UI visual, CI ou validação de produção nesta intervenção.
- Parecer completo, fontes oficiais, comandos e roteiro: [REVISAO_CODEX_IOS_LOGIN_2026-11-12.md](REVISAO_CODEX_IOS_LOGIN_2026-11-12.md). Claude deve revisar compilação/concorrência, Keychain, cache/cursor, saída durante refresh, paridade e telas; obter prova no CI e no aparelho. Revisão do Claude desta entrega: **PENDENTE**.
- Limites: Hoje é agenda/rotação, não o recomendador completo de fadiga. Reconstrução após lápides purgadas pode deixar cache parcial se a rede cair; novo pull retoma. Saída apaga a sessão local, sem prometer revogação remota ou afetar o PWA. Parte B, conflitos e escrita continuam pendentes. Dependências transitivas do SPM ainda precisam da resolução real no Mac; nenhum lockfile foi inventado.

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
