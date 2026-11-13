# Progresso da missão: terminar o Anilha

Mantido pelo Claude, atualizado a cada item. Última atualização: 13/11/2026 (depois do fechamento: apagar treino e plano novo no iPhone).

## O que está no ar

| App | Versão | Onde |
| --- | --- | --- |
| Anilha, site | `main` em 13/11 | https://anilha-eight.vercel.app (Vercel publica a cada push na `main`) |
| Anilha, iPhone | 0.20.0, build 47 | Release `ios-build-47` do GitHub; cópia em `C:\Users\caiog\crunning-artifacts\anilha-ipa\Anilha-0.20.0-build47.ipa` (versão e esquema `anilha://` conferidos no Info.plist). Falta instalar (você) |
| Funções do Anilha | `analise-treino` v3, `revisao-ficha` v1, `troca-crunning` v4 (publicada pelo painel, idêntica ao repositório), `agente` (sem mudança) | Supabase, projeto `ssuuvzgqtobnfvobvjcu` |
| Banco do Anilha | migração 24 (`crunning_exchange` com corridas planejadas e detalhe da força) | Supabase |
| CRUNNING | 0.22.0, build 59 (`5724738`) | `C:\Users\caiog\crunning-artifacts\ipa\CRUNNING-build-59.ipa`. Falta instalar (você) |

Backup da `main` anterior: tag `backup-main-antes-ios-2026-11-12` (`abc2b1e`). A publicação anterior da Vercel era `anilha-96av088my`.

## Feito

- **A1 e A2:** revisão da ficha pelo Sonnet e memória das análises com a dica do Waltér na tela de foco, no site e no iPhone.
  - `analise-treino` v3 aceita o contexto antigo e o novo (corridas e memória). Caixa-preta: antigo e novo passam na validação e param no login (401); campo estranho dá 400. Volta: republicar os arquivos do commit `f7ebee8`.
  - `revisao-ficha` v1 (Sonnet 5.5, só admin): sem login 401, OPTIONS 204. Corrigidos antes de publicar: acentos quebrados no prompt e um import de outra pasta.
- **B3:** chat do Waltér nativo (Codex, revisado): editar ficha, antes e depois, Salvar, Recusar e Desfazer pela fila. Plano novo e ficha nova pelo chat continuam no site, com aviso.
- **B4:** criar, editar e apagar ficha no iPhone e o "Ignorar" da sugestão do motor (Codex, revisado). Na revisão, a linha nova da análise e do chat voltou a nascer limpa, como no site.
- **B5, B6, B7:** plano da semana na aba Plano, perfil de treino na aba Você, catálogo com busca, máquinas, exercício próprio e "como fazer" com imagens.
- **B8:** mesa de descanso refeita (feltro, cartas desenhadas, fichas, distribuir e virar, háptico, vitória e derrota), partida salva no aparelho e retomada no próximo descanso, losango de ouros, halter com contraste no escuro, primeiro print sem tela branca, prints em tela pequena no claro e no escuro.
- **C9:** branches do iPhone juntadas na `main` por avanço rápido (sem forçar) e site publicado. Teste de fumaça no Chrome do Caio, só abrindo telas, sem erro no console: Hoje, Histórico, treino (evolução e cartão da análise, sem clicar em Analisar), Calendário, Plano, ficha com a revisão, Você e Privacidade.
- **C10:** `troca-crunning` republicada a partir dos arquivos exatos do repositório. Caixa-preta antes e depois idêntica (OPTIONS 204; sem token, token inválido e token inexistente 401; POST sem token 401). Volta: republicar os arquivos de `e81ef2a`.
- **C11:** tela "Corridas repetidas" no site. O teste de fumaça achou um caso real que ela não pegava (a mesma corrida do dia 11 registrada à mão e pelo CRUNNING); passou a sugerir também esse caso (mesmo dia, distância até 5%). Juntar guarda cópia e tem Desfazer. O aviso já aparece no histórico do Caio; juntar ou não é decisão dele.
- **C12 (técnico):** dossiê `docs/DOSSIE_LGPD_ADVOGADO.md`; política de privacidade atualizada com corridas e memória na análise, modelos usados, revisão da ficha e análises guardadas no servidor, tudo com base legal "a definir". Exportar dados inclui as análises; apagar a conta leva as análises do servidor junto (chave estrangeira). Consentimento de saúde e termos seguem como estavam.
- **C13:** análises e revisões acompanham a conta entre iPhone e site. Migração só aditiva (tabela `analysis_sync` com RLS e três funções novas), aplicada em produção; sem login, tabela e funções recusam (401). O desfazer fica só no aparelho que salvou. Em produção, o primeiro ciclo do site rodou sem erro (`analysis_pull` 200).
- **D14 (automático):** resultados no fim de `docs/ROTEIRO_TESTE_IPHONE.md` e abaixo.
- **E1:** logs da leitura de força sem erro (200 em 12/11) e roteiro em `crunning-app/docs/TESTES-NA-RUA.md`.
- **E2:** perna pesada numa constante só, `ConflitoForca.seriesPesada = 6`.
- **E3:** CRUNNING 0.21.0: coach, revisão semanal, revisão e criação do plano recebem a força do Anilha (só agregados), com a regra de perna pesada por até 48 h (Doma e colegas, 2017 e 2019).

- **Depois do fechamento, pedidos do Caio no teste:**
  - **Apagar treino no iPhone (0.17.1):** na tela do treino concluído, com confirmação; sessão, exercícios e séries viram lápide pela fila e os recordes são recalculados, como no site. Teste Swift no CI.
  - **Plano novo no iPhone (0.18.0, Codex, revisado):** mesmas perguntas do perfil, prévia e confirmação; o gerador é o mesmo código TypeScript do site, empacotado e executado pelo JavaScriptCore (paridade conferida no CI); só a montagem das linhas foi portada. Pedir plano pelo chat continua pendente (precisa de proposta, avisos e desfazer para todas as fichas).
  - **Mesa de descanso (0.18.1):** no modo claro o seletor e o botão de fechar ficavam sem contraste e "Dobrar" quebrava em tela pequena; corrigido e conferido nos prints do build 36.
  - **Plano novo, Salvar à vista (0.18.2):** o botão ficava no fim da prévia com o nome "Gerar plano novo"; agora "Salvar plano novo" fica fixo embaixo, e depois de salvar a tela lista as fichas novas para a revisão do Waltér (decisão: revisão depois de salvar, onde já há Aplicar, Recusar e Desfazer).
  - **Auditoria da interface (0.18.3):** `docs/AUDITORIA_INTERFACE_IPHONE.md`. Corrigidos os 6 itens P1 (plural, data crua, "Braços", cor da corrida, textos "PWA", "Reordenar"); P2 e P3 aguardam o Caio.
  - **P2 da auditoria (0.19.0):** ajustes do dia e treinar outra ficha no Hoje (Codex, mesmo motor do site via JavaScriptCore; corrigida também a volta do ajuste de articulação num pull depois de revogar a saúde), descartar treino, corrigir série de treino concluído, editar respostas sem trocar o plano e menu com nomes na aba Plano. Site: 873 testes unitários e os de ponta a ponta do Hoje passando depois da extração de funções de `src/data/today.ts`.
  - **P3 da auditoria (0.19.1):** um título por tela, calendário único, sugestão só antes de série de trabalho, "Aplicar" em toda proposta da IA, rodapé curto ("Haiku · US$ 0,0003"), sem RIR e 1RM, atribuição do RepDB em português.
  - **Revisão com IA dava 502:** a ferramenta strict tinha `maxItems`, que a API recusa antes do Sonnet. Corrigido (`f1e568c`) e publicado em 13/11 pelo painel da Supabase (o conector estava fora): o código no ar tem o mesmo tamanho e hash do repositório; OPTIONS 204 e 401 sem login. Falta a primeira revisão real do Caio para confirmar a resposta do Sonnet.
  - **Ficha de perna sumia da semana (0.19.2):** o rodízio pulava a perna em toda véspera de corrida, e com academia em seg, ter, qui e sáb e corrida em qua, sex e dom ela só cabia na segunda, uma vez a cada duas semanas. Agora só corrida forte afasta a perna: intervalado ou longão do plano, troca do dia para corrida, ou corrida marcada como importante no CRUNNING; quando o CRUNNING planeja o dia, vale o plano dele. Antes de corrida fácil, a perna fica. Mesma regra no site, no iPhone (Swift e motor JS), no calendário, na revisão do Waltér e na força prevista que o CRUNNING lê (`GET /forca`, que passou a levar as corridas planejadas do próprio CRUNNING: migração `20261113000023`). Tipos do CRUNNING com acento na semana ("fácil", "longão").
  - **Força do Anilha no CRUNNING:** já chega pelo `GET /forca` (respostas 200 em 13/11): halter no Hoje e no calendário do plano, cheio quando feito e vazado quando previsto, laranja quando teve perna, e o aviso de perna pesada perto de treino forte. Não aparece como treino na lista de corridas.
  - **Treino detalhado no CRUNNING (Anilha 0.20.0):** o `GET /forca` passa a levar, de cada treino que mudou, os exercícios na ordem do treino com carga, repetições, segundos e aquecimento, e da ficha prevista os exercícios com séries e faixa de repetições, mais um link (`anilha://treino/<id>` ou `anilha://ficha/<id>`). Nada de nota, esforço ou dor; só vão as séries dos treinos que mudaram desde a última leitura (migração `20261113000024`). O Anilha no iPhone abre o treino ou a ficha pelo link; se ainda não estiver no aparelho, pede para puxar e tentar de novo. No CRUNNING (0.22.0, Codex), tocar na força do dia abre o detalhe com "Abrir no Anilha"; o detalhe não vai para o Coach.
  - **CI:** os prints passaram do limite de 20 minutos com as telas novas; limite aumentado. Builds 35 e 36: todas as capturas feitas, nenhuma falha.

## Resultado dos testes automáticos

| O quê | Resultado |
| --- | --- |
| Site: checagem de tipos, lint e testes unitários | 859 de 859, em 76 arquivos |
| Site: ponta a ponta (Playwright, servidor local com as migrações reais) | 130 testes; 129 passaram na rodada completa e o que falhava (também na `main` antiga) foi corrigido e passa; rodadas depois das mudanças: 14 de 14 nas telas tocadas, 3 de 3 de privacidade |
| Banco: `analysis_sync` em PGlite com as migrações reais | 4 de 4 (vence a mais nova, isolamento por conta, formato, apagar e cascata) |
| Sincronização entre dois aparelhos, sem rede no meio (site) | 4 de 4 (desfazer fica no aparelho, decisão de um chega no outro, edição local não enviada não é atropelada, nada reenviado sem mudança) |
| iPhone no CI (build 30): testes TS do CI, paridade Swift, fila, chat, baralho, ficha, sincronização | tudo verde, archive Release gerado |
| Payload do iPhone no servidor e site locais (treino, análise, revisão, calendário) | verde no CI |

O que só o iPhone de verdade comprova está em `docs/ROTEIRO_TESTE_IPHONE.md`.

## Decisões tomadas

- **Prints do iPhone só sob pedido (13/11, pedido do Caio):** o job de prints (uns 20 minutos a mais) roda só com "prints" marcado no Run workflow ou com `[prints]` na mensagem do commit; o `.ipa` sai em uns 20 minutos.
- **Pasta separada para o Claude:** `../anilha-claude` (git worktree), para não mexer nos arquivos do Codex em `anilha-publico`.
- **CI:** dispara em `claude/**` e `codex/**`; ao falhar sem erro, o passo de compilação mostra o fim do log e o contexto de uma quebra do compilador.
- **Quebra do compilador Swift 6.3.3 no Release:** era uma referência de método (`set: mudarRetorno`) num `Binding<String>` do perfil de treino. Trocada por closure literal, como nos outros Bindings.
- **Versões do iPhone:** seguem a ordem de entrega, não a da lista (chat 0.15.0, ficha 0.16.0, sincronização 0.17.0).
- **Item 13 numa branch própria** (`claude/analises-sync`), publicado só depois do item 9, com a migração aplicada antes do site.
- **Juntar duplicados sem apagar:** a corrida que sai vira lápide, a cópia das duas fica no aparelho e o Desfazer restaura.
- **Política de privacidade:** texto atualizado sem pedir novo aceite; a versão dos termos sobe junto com a revisão do advogado.
- **Publicação:** servidor antes dos clientes, aceitando formato antigo e novo.

## Depende do Caio

- **Instalar o iPhone 0.20.0 e o CRUNNING 0.22.0 (E4, Apple ID gratuito):** os apps vencem 7 dias depois de cada instalação. Abrir o Sideloadly no PC, ligar o iPhone no cabo, escolher `C:\Users\caiog\crunning-artifacts\anilha-ipa\Anilha-0.20.0-build47.ipa` (e depois `C:\Users\caiog\crunning-artifacts\ipa\CRUNNING-build-59.ipa`), entrar com o mesmo Apple ID e instalar por cima. Os dados ficam.
- **D14, teste no iPhone:** seguir `docs/ROTEIRO_TESTE_IPHONE.md` (blocos independentes) e contar o que não bateu, com print.
- **E1, teste da força no CRUNNING:** seguir a seção "Força do Anilha" de `crunning-app/docs/TESTES-NA-RUA.md`.
- **C11:** no site, Histórico > "1 corrida parece repetida" > Revisar, e decidir se junta a do dia 11.
- **C12, advogado:** levar `docs/DOSSIE_LGPD_ADVOGADO.md`. Depois da resposta, o Claude troca "a definir" pelas bases aprovadas e sobe a versão dos termos.

## O que falta

- Comprovação no iPhone de verdade (D14 e E1). Nada mais da lista está pendente do lado do Claude.
