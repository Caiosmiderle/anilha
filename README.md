# Anilha

Treino de musculação e corrida guiado pelo seu próprio plano da semana. Diz o que fazer hoje e por quê, registra série a série com uma mão e sem sinal, sugere a carga da próxima vez por dupla progressão e trata excesso como desvio, igual à falta. Amigos veem a sua constância, não as suas cargas.

PWA instalável, local-first (IndexedDB) com sincronização no Supabase. Design no Harbor UI.

## Rodar local

Sem conta externa: um servidor local imita o Supabase com Postgres embutido (PGlite) e as mesmas migrações.

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:5173 e entre com `caio@anilha.dev` (conta fictícia Rafa, com semana sintética de outubro de 2026). O código de login aparece na tela no modo local. Qualquer outro e-mail cria uma conta nova.

## Testar

```bash
npm test
```

Motor (cenários de treino e bordas) e banco (privacidade, sync, ranking, lembretes) com as migrações reais.

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

Fluxo principal com offline, dois usuários, dados e uma passada visual que salva screenshots em `artifacts/screens`.

```bash
npm run lighthouse
```

Também: `npm run lint`, `npm run typecheck`, `npm run verify` (tudo em sequência).

## Onde está cada coisa

- `src/engine`: motor de progressão, recomendação, gerador de plano e reconhecimento (puro, testado).
- `src/data` e `src/sync`: banco local e sincronização.
- `src/screens` e `src/ui`: telas e componentes.
- `supabase/migrations`: esquema, RLS e RPCs. `server/`: Supabase local.
- `design/harbor-ui`: design system e extensões.
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `DECISIONS.md`, `SETUP.md`.
- `AGENTS.md`, `CLAUDE.md` e `docs/AI_HANDOFF.md`: instruções e registro da revisão mútua entre Codex e Claude. `docs/ROADMAP_IOS.md`: app iOS e integração com o CRUNNING.
- [Dossiê de UI/UX](docs/DOSSIE_UIUX_2026-10-22.md): auditoria de 22/10/2026, com PDF, evidências e plano de ação; base `f741f92`.

## Licença

O código está visível para consulta, mas sem licença de uso: todos os direitos reservados. As imagens de exercícios do RepDB seguem a licença deles (atribuição em Você, Créditos e licenças).
