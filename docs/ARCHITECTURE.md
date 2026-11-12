# Arquitetura

Local-first: o aparelho é a fonte de verdade da interface e a nuvem é onde os aparelhos e os amigos se encontram.

```
 Celular (PWA)                                         Supabase
 +-------------------------------------------+         +--------------------------------+
 | React 19 + Vite + TypeScript              |         | Postgres                       |
 |   telas (src/screens)                     |         |   tabelas por usuário + RLS    |
 |   motor puro (src/engine) <- testes       |         |   RPC sync_push / sync_pull    |
 |   dados (src/data): Dexie/IndexedDB       |  HTTPS  |   RPC sociais (definer)        |
 |      cada escrita: linha + fila de saída  | ------> |   reminders + pg_cron          |
 |   sync (src/sync): push, pull, cursor     | <------ | Auth: código por e-mail        |
 | Service worker (Workbox): app offline     |         | Edge Function send-reminders   |
 +-------------------------------------------+         +--------------------------------+
```

## Camadas

- `src/engine`: regras de treino sem React nem banco. Progressão, recomendação do dia, alertas de fadiga, gerador de plano e rotinas, ajuste do dia, entrada rápida, dor, modo retorno, aderência, reconhecimento, ranking e recordes. Testes em `src/engine/__tests__`.
- `src/agent`: conversa, contexto e ferramentas do assistente. O modelo escolhe ferramentas; o motor local gera propostas. Salvar usa a mesma camada de dados, com desfazer que protege edições posteriores. O popup só carrega o chat depois do primeiro clique e preserva o estado ao minimizar. `agente` e `analise-treino` exigem conta e compartilham o limite diário de `agent_begin_turn`, aberto a todas as contas desde a migração 20.
- `src/analysis` calcula evolução local por exercício em qualquer ficha, com máximos simples e volume. O contexto numérico da IA usa lista permitida, cinco ocorrências por exercício e prévia do motor sem gravação. A saída estruturada traz avaliação, comentários para a próxima vez e até um ajuste. O PWA passa por `executeTool` e `applyProposal`; o Swift porta o mesmo subconjunto de `editar_ficha`, com vetores gerados pelo TS. Resposta, uso/custo estimado, prévia, prescrição original, regra aplicada e desfazer ficam apenas no aparelho, fora do sync. A função ampliada precisa de publicação separada após autorização.
- `src/data`: Dexie com as mesmas tabelas da nuvem (snake_case). `store.ts` grava a linha e a entrada da fila na mesma transação. `ops.ts` reúne todas as escritas do app. `hooks.ts` expõe consultas reativas.
- `src/review`: revisão da ficha pelo Sonnet 5.5 só para admins, autorizada no servidor por `is_admin`. Lista permitida da ficha, plano, volume das fichas ativas e corridas agregadas em 14 dias, com `projectDays`/`legsBeforeRunAlert`. Até três ajustes passam por `editar_ficha` e confirmação individual. Cache e desfazer por versão local (inclui `updated_at` dos itens), sem sync. Reutiliza o limite diário do assistente. A análise pós-treino recebe as mesmas corridas numa janela de dois dias; o contrato aceita clientes antigos sem o campo.
- `src/sync`: `sync.ts` empurra a fila em lotes de 200 e puxa por cursor; roda depois de escritas, ao voltar a rede ou o foco e a cada minuto. `client.ts` carrega o supabase-js sob demanda.
- `src/screens` e `src/ui`: telas e componentes Harbor; estilos em `design/harbor-ui` e `src/styles/app.css`.
- `supabase/migrations`: esquema, RLS e RPCs versionados. `supabase/functions/send-reminders`: envio de push.
- `server/`: Supabase local (OTP e RPC) sobre PGlite, com as mesmas migrações. Usado em dev, nos testes de banco e nos E2E.

## Sincronização

1. Toda escrita local grava a linha com `updated_at` monotônico e põe `tabela:id` na fila.
2. `sync_push` faz upsert por (usuário, id). Mais nova vence; repetir não duplica. Linha inválida volta em `rejected` sem travar o lote.
3. Cada escrita no servidor ganha `server_seq`. `sync_pull` devolve o que passou do cursor, em ordem, esperando pushes em andamento do mesmo usuário (trava consultiva).
4. No pull, se a linha local tem edição pendente mais nova, ela fica e sobe no próximo push.
5. Cada ciclo captura banco e usuário; cada RPC fixa o token da sessão correspondente. Troca de conta invalida respostas antigas e não bloqueia a sincronização da conta seguinte. Leituras remotas mantêm cache separado por banco da conta.

## Segurança

- RLS em todas as tabelas. Dono lê e escreve o que é seu. Amigo lê detalhes só com `share_details` do dono. Anônimo não executa nada.
- Escritas sociais por funções com checagem explícita de amizade, bloqueio e tentativas.
- Segredos no Vault do Supabase; no repositório só a URL e a chave publicável.
- CSP na Vercel restrita ao próprio domínio e ao Supabase.

## Para crescer

- Assistente: implementado ao lado de `src/engine`, em teste com administradores. Ampliar o acesso exige revisão do beta, privacidade e custos.
- Strava ou relógio: corridas já têm `source` e `external_id`.
- Novo tipo de dado: tabela com as colunas de sync, adicionada em `synced_tables()` e em `SYNCED_TABLES`.
