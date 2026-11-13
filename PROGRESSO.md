# Progresso da missão: terminar o Anilha

Mantido pelo Claude, atualizado a cada item. Última atualização: 12/11/2026, 23h (fechamento).

## O que está no ar

| App | Versão | Onde |
| --- | --- | --- |
| Anilha, site | `main` em `08ea80a` | https://anilha-eight.vercel.app (Vercel, publicação `index-BdVyF1ws.js`) |
| Anilha, iPhone | 0.17.0, build 30 | Release `ios-build-30` do GitHub; cópia em `C:\Users\caiog\crunning-artifacts\anilha-ipa\Anilha-0.17.0-build30.ipa` (SHA-256 conferido). Falta instalar (você) |
| Funções do Anilha | `analise-treino` v3, `revisao-ficha` v1, `troca-crunning` v2, `agente` (sem mudança) | Supabase, projeto `ssuuvzgqtobnfvobvjcu` |
| Banco do Anilha | migração 22, `analysis_sync` (só aditiva) | Supabase |
| CRUNNING | 0.21.0, build 57 (`53e0ca3`) | `C:\Users\caiog\crunning-artifacts\ipa`. Falta instalar (você) |

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

- **Pasta separada para o Claude:** `../anilha-claude` (git worktree), para não mexer nos arquivos do Codex em `anilha-publico`.
- **CI:** dispara em `claude/**` e `codex/**`; ao falhar sem erro, o passo de compilação mostra o fim do log e o contexto de uma quebra do compilador.
- **Quebra do compilador Swift 6.3.3 no Release:** era uma referência de método (`set: mudarRetorno`) num `Binding<String>` do perfil de treino. Trocada por closure literal, como nos outros Bindings.
- **Versões do iPhone:** seguem a ordem de entrega, não a da lista (chat 0.15.0, ficha 0.16.0, sincronização 0.17.0).
- **Item 13 numa branch própria** (`claude/analises-sync`), publicado só depois do item 9, com a migração aplicada antes do site.
- **Juntar duplicados sem apagar:** a corrida que sai vira lápide, a cópia das duas fica no aparelho e o Desfazer restaura.
- **Política de privacidade:** texto atualizado sem pedir novo aceite; a versão dos termos sobe junto com a revisão do advogado.
- **Publicação:** servidor antes dos clientes, aceitando formato antigo e novo.

## Depende do Caio

- **Instalar o iPhone 0.17.0 e o CRUNNING 0.21.0 (E4, Apple ID gratuito):** os apps vencem 7 dias depois de cada instalação. Abrir o Sideloadly no PC, ligar o iPhone no cabo, escolher `C:\Users\caiog\crunning-artifacts\anilha-ipa\Anilha-0.17.0-build30.ipa` (e depois o `.ipa` mais recente em `C:\Users\caiog\crunning-artifacts\ipa` para o CRUNNING), entrar com o mesmo Apple ID e instalar por cima. Os dados ficam.
- **D14, teste no iPhone:** seguir `docs/ROTEIRO_TESTE_IPHONE.md` (blocos independentes) e contar o que não bateu, com print.
- **E1, teste da força no CRUNNING:** seguir a seção "Força do Anilha" de `crunning-app/docs/TESTES-NA-RUA.md`.
- **C11:** no site, Histórico > "1 corrida parece repetida" > Revisar, e decidir se junta a do dia 11.
- **C12, advogado:** levar `docs/DOSSIE_LGPD_ADVOGADO.md`. Depois da resposta, o Claude troca "a definir" pelas bases aprovadas e sobe a versão dos termos.

## O que falta

- Comprovação no iPhone de verdade (D14 e E1). Nada mais da lista está pendente do lado do Claude.
