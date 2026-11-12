# Anilha no iPhone e integração com o CRUNNING

Atualizado em 11/11/2026 pelo Claude, a partir do roadmap do Codex e das decisões do Caio no mesmo dia. Substitui a proposta antiga de encapsular o PWA com Capacitor.

## Decisões do Caio

- **Dois apps separados no mesmo iPhone.** O Anilha cuida da musculação. O CRUNNING (`Caiosmiderle/crunning`) cuida da corrida e já envia para o Strava.
- **Anilha nativo em SwiftUI**, com a identidade do Anilha (marca, paleta, Harbor UI). A referência do CRUNNING é a qualidade da interação: a passagem do treino de hoje para a execução, a clareza da tela durante o treino e a análise depois.
- **Preservar** conta, histórico, fichas, IDs dos exercícios e regras. O PWA continua funcionando durante a transição. Ampliar o catálogo de máquinas e melhorar a busca e o cadastro de exercícios.
- **A integração ajuda nas decisões.** O Anilha pode sugerir mover a perna se houver longão importante amanhã. O CRUNNING pode sugerir mover os tiros se ontem houve perna pesada. Cada app distingue planejado de realizado, explica a sugestão e deixa a decisão com o Caio.
- **HealthKit fora do escopo** nos dois apps. Fica guardado para talvez um dia; não propor.
- **Repositório público**, para o CI de macOS ser gratuito. O app iOS fica em `ios/`.

## Limites da instalação (assinatura gratuita)

- O CRUNNING é instalado pelo Sideloadly com Apple ID gratuito (guia em `crunning/docs/INSTALAR.md`). Limites:
  - a assinatura vale 7 dias;
  - até 3 apps "por fora" ao mesmo tempo;
  - até 10 App IDs a cada 7 dias.
- O CRUNNING usa 2 App IDs (app + Live Activity). O Anilha começa **sem extensão**.
- Pela tabela oficial da Apple ("Supported capabilities (iOS)", lida em 11/11/2026), a conta sem programa pago não tem:
  - Associated Domains: abrir o outro app usa URL scheme próprio (`anilha://`, `crunning://`);
  - push remoto;
  - iCloud.

## Ordem

| Etapa | Entrega | Aceite |
| --- | --- | --- |
| 0. Repositório público | Retrato limpo, sem histórico nem material de terceiros | Feito em 11/11/2026; falta o Caio criar o repositório e religar a Vercel |
| 1. Prova de instalação | App mínimo em `ios/`, CI gerando `.ipa` sem assinatura | Instalado ao lado do CRUNNING com o mesmo Apple ID. Registrar App IDs gastos e vagas. `anilha://teste` abre o app. Temas, Dynamic Type e contraste conferidos no aparelho |
| 2. CRUNNING → Anilha | Corridas feitas e planejadas do CRUNNING chegam ao Anilha (o PWA já consome `runs`) | Reenvio não duplica. As regras `run_legs` e `legs_before_run` de `src/engine/recommend.ts` usam as corridas reais e planejadas, mostram o motivo e pedem confirmação |
| 3. Treino de força nativo | Login, ficha de hoje, séries, descanso, planejado x feito, offline e sync | Ficha real concluída sem rede, fechar e reabrir, sincronizar sem duplicar, mesmos dados no PWA |
| 4. Anilha → CRUNNING | Sessões de força (começando por perna) chegam ao CRUNNING | Sugestão de mover um intervalado depois de perna pesada, com motivo e confirmação |
| 5. Catálogo e pós-treino | Máquinas, busca e cadastro; comparação com a sessão anterior; análise do Waltér | Conferido com uma sessão real |

As etapas 2 e 3 podem andar em paralelo. A Live Activity do Anilha só entra depois da etapa 1 mostrar que cabe nos limites.

## Paridade web x nativo

- A fonte da verdade continua sendo o Supabase com as RPCs `sync_push` e `sync_pull` (`src/sync/sync.ts`) e as tabelas de `SYNCED_TABLES` (`src/data/db.ts`). O nativo implementa o mesmo protocolo de cliente; não há backend novo na v1. Coluna nova em tabela sincronizada é anulável.
- Documentar a política de conflito do PWA a partir de `sync.ts` antes do nativo gravar. Caso de teste obrigatório: a mesma sessão editada no PWA e no nativo.
- O motor TypeScript (`src/engine`) é a especificação.
  - Portar para Swift só o que cada etapa usa.
  - Paridade por vetores: um script exporta entradas e saídas das funções TS para `fixtures/paridade/*.json`, os testes Swift leem os mesmos arquivos e o CI falha se divergir.
- Catálogo: exportar `src/engine/exercises.ts` para JSON com IDs estáveis, gerado de uma fonte só para web e nativo.

## Contrato mínimo da troca

- **Transporte:** Edge Function no Supabase (por exemplo, `troca-crunning`), com upsert idempotente e leitura incremental.
- **Autenticação:** o CRUNNING usa um token pessoal gerado no Anilha, guardado só como hash, revogável e restrito à conta e a essas operações. O Caio cola o token no CRUNNING (Keychain).
- **Fora do ar:** o CRUNNING mantém fila local e segue normal se o Anilha estiver fora.

**Campos comuns:**

| Campo | Regra |
| --- | --- |
| `versao` | 1 |
| `origem` | `crunning` ou `anilha` |
| `origem_id` | estável |
| `atualizado_em` | ISO 8601 com fuso |
| `apagado` | lápide em vez de remoção |
| `link` | URL scheme |

`null` é desconhecido, nunca zero.

**CRUNNING → Anilha**

- **Realizado:**

  | Campo | Conteúdo |
  | --- | --- |
  | `inicio` | data e hora de início |
  | `data_local` | YYYY-MM-DD |
  | `tipo` | mapeado para `RunType` (`leve` / `longo` / `intervalado`) |
  | `tipo_origem` | o tipo original do CRUNNING |
  | `distancia_m` | distância |
  | `duracao_movimento_s` | duração em movimento |
  | `esforco` | 1 a 10 ou `null` |
  | `planejado` | `{semana, dia}` ou `null` |
  | `esteira` | se foi na esteira |
  | `strava_id` | se houver |
- **Planejado** (próximos 14 dias):

  | Campo | Conteúdo |
  | --- | --- |
  | `data_local` | dia do treino |
  | `tipo` | tipo do treino |
  | `distancia_m` | distância prevista |
  | `duracao_s` | duração prevista |
  | `importante` | longão, tiros e prova |
  | `status` | `planejada` / `feita` / `perdida` |

**Anilha → CRUNNING**

- **Realizado** (sessão de força):

  | Campo | Conteúdo |
  | --- | --- |
  | `data_local` | dia da sessão |
  | `inicio` / `fim` | se conhecidos |
  | `status` | `concluida` / `parcial` |
  | `pernas` | se a sessão teve perna |
  | `series_pernas` | séries efetivas de membros inferiores |
  | `esforco` | ou `null` |
  | `duracao_s` | duração |
- **Planejado** (próximos 14 dias):

  | Campo | Conteúdo |
  | --- | --- |
  | `data_local` | dia |
  | `ficha` | nome |
  | `pernas` | se a ficha tem perna |
  | `status` | `planejado` / `feito` / `pulado` / `movido` |

**Nunca no contrato:** rota, GPS, coordenadas, amostras de batimento, dor, texto livre, nome ou e-mail.

**Reenvio, edição e outras fontes:**
- Chave `(conta, origem, origem_id)`.
- Só aceita o item se `atualizado_em` for mais novo.
- Uma corrida do CRUNNING é a canônica, com `external_id = "crunning:<uuid>"`. Conferir se `runs.source` aceita um valor novo ou se precisa de coluna anulável.
- Importação TCX ou Strava com o mesmo `strava_id`, ou com horário (±5 min) e distância (±5%) sobrepostos, vira sugestão de juntar, nunca junção automática.

Regra de treino nova precisa de fonte em `docs/CIENCIA.md` ou ser marcada como prática de treinador.

## Reaproveitar do CRUNNING (como padrão, copiado e adaptado aos tokens do Anilha)

- `App/Design/Vidro.swift`, `Componentes.swift` e `FundoView.swift`: cartão, tela e fundo.
- `App/Design/ComponentesTreino.swift`: `TabelaBlocos`, planejado x feito.
- `App/Design/ComponentesCorrida.swift`: gráfico com toque.
- `App/Telas/Plano/CartoesPlanoHoje.swift`: passagem de hoje para a execução.
- `App/Telas/Corrida/PainelTreino.swift`: tela durante o treino.
- `App/Telas/CartaoAnaliseTreino.swift` e `App/Servicos/AnaliseTreino.swift`: análise pós-treino.
- `App/Servicos/Chaveiro.swift`: Keychain.

A paleta do CRUNNING não vem junto: o Anilha tem os próprios tokens, transcritos do Harbor UI (`src/styles/app.css`, `src/ui`).
