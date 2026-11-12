# Contrato da troca entre Anilha e CRUNNING, versão 1

Autor: Claude, 12/11/2026 (esclarecimentos de 12/11 depois da revisão do Codex, sem mudar a versão: só tornam explícito o que estava ambíguo). Fonte de verdade para os dois lados.
- O Codex implementa o lado Anilha (banco, Edge Function, tela do token, uso nas regras).
- O Claude implementa o lado CRUNNING (`Caiosmiderle/crunning`).

Mudança de contrato exige nova versão e atualização deste arquivo.

## Objetivo e limites

- O CRUNNING manda ao Anilha as corridas feitas e os treinos de corrida planejados dos próximos 14 dias. O Anilha usa isso nas regras que já existem (`run_legs`, `legs_before_run` e `no_legs_before_run` em `src/engine/recommend.ts`): por exemplo, sugerir mudar a perna se houver longão importante amanhã.
- O Anilha devolve ao CRUNNING as sessões de força feitas e as planejadas dos próximos 14 dias. O CRUNNING usa isso para sugerir mover os tiros depois de perna pesada.
- Cada app mostra a atividade que motivou a sugestão, separa planejado de feito e **pede confirmação**. Nada muda sozinho.
- **Só resumos.** Nunca entram no contrato: rota, GPS, coordenadas, ritmo ponto a ponto, amostras de batimento, dor, texto livre, nome ou e-mail.
- O CRUNNING continua funcionando sem o Anilha. Ele guarda uma fila local e manda quando der.

## Autenticação: token pessoal

- No Anilha: **Você > Conexões > CRUNNING**.
  - **Gerar token** mostra o token **uma única vez**: 32 bytes aleatórios em base64url, com o prefixo `anl_` para ser reconhecível.
  - O banco guarda só o SHA-256 do token, com `created_at`, `last_used_at` e `revoked_at`.
  - **Revogar** desliga na hora. Gerar um novo revoga o anterior (um token ativo por conta).
- No CRUNNING: **Ajustes > Conexões > Anilha**. O Caio cola o token, que fica no Keychain.
- **Chamada:** `Authorization: Bearer anl_…`. Token ausente, inválido ou revogado responde `401 {"erro":"token"}`, sem dizer qual dos casos.
- **Escopo:** a conta dona do token e só as operações abaixo.
- **Limite:** 60 chamadas por hora por token. Passando disso, `429 {"erro":"limite"}`.
- O token nunca vai para log, URL, repositório nem relatório.

## Transporte

- Edge Function `troca-crunning` no Supabase do Anilha. JSON em UTF-8. Toda requisição com corpo e toda resposta de sucesso têm `"versao": 1`. O `GET` aceita `?versao=1`; sem o parâmetro, vale 1. Versão desconhecida responde `400 {"erro":"versao"}`. As respostas de erro seguem os exemplos, sem `versao`.
- Unidades sempre em metros e segundos. Datas e horas em ISO 8601 com fuso. `data_local` é `YYYY-MM-DD` no fuso do aparelho.
- **`null` é desconhecido, nunca zero.** Campo desconhecido no corpo é ignorado, para versões futuras conviverem.
- **Idempotência:**
  - A chave de cada item é `(conta, origem, origem_id)`.
  - O item só é aceito se `atualizado_em` for mais novo que o guardado. Mais velho ou igual é ignorado sem erro.
  - Exclusão é `"apagado": true` (lápide), nunca DELETE.

## Operações

### `POST /corridas`: corridas feitas (CRUNNING → Anilha)

Corpo: `{"versao":1,"itens":[…]}`, até 50 itens.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `origem_id` | string (UUID) | sim | código estável da corrida no CRUNNING |
| `atualizado_em` | ISO 8601 | sim | muda a cada edição |
| `apagado` | bool | não (padrão false) | lápide |
| `inicio` | ISO 8601 | sim | |
| `data_local` | data | sim | |
| `tipo` | `leve` / `longo` / `intervalado` | sim | `RunType` do Anilha |
| `tipo_origem` | string ou null | não | tipo do CRUNNING (`facil`, `longao`, `limiar`…) |
| `distancia_m` | número > 0 | sim | |
| `duracao_movimento_s` | inteiro > 0 | sim | |
| `esforco` | 1 a 10 ou null | não | |
| `esteira` | bool | não | |
| `planejado` | objeto ou null | não | `{"semana":n,"dia":0..6}` do plano do CRUNNING |
| `strava_id` | string ou null | não | para reconhecer a mesma atividade importada |

Mapeamento de `tipo` pelo CRUNNING:
- `longao` vira `longo`;
- `intervalado`, `repeticoes`, `limiar`, `ritmoProva` e `prova` viram `intervalado`;
- o resto e a corrida livre viram `leve`.

**No Anilha** cada item vira uma linha de `runs`:
- `id = "crunning-" + origem_id`;
- `source = 'crunning'`, valor novo, que pede migração alterando o `check`;
- `external_id = "crunning:" + origem_id`;
- `activity` nulo, porque é corrida;
- `distance_km` arredondado a 2 casas;
- `duration_sec`, `run_type`, `rpe`, `local_date` e `updated_at` em milissegundos, como o sync espera;
- `deleted` vem de `apagado`.

Ela sincroniza para o PWA e para o app nativo pelo `sync_pull` como qualquer corrida.

**Mesma corrida por outra fonte:**
- uma linha `import` com o mesmo `strava_id`, ou com início a ±5 min e distância a ±5%, **não é apagada nem juntada sozinha**;
- o Anilha mostra a sugestão de juntar e o Caio escolhe;
- a do CRUNNING é a canônica.

**Lápide:** leva só `origem_id`, `atualizado_em` e `"apagado": true`, porque o CRUNNING já não tem os dados da corrida apagada.
- Se a corrida existe no Anilha e a lápide é mais nova, ela fica apagada (`deleted`) e conta em `aceitos`.
- Se não existe, ou a lápide é mais velha, nada muda e conta em `ignorados`.
- Os outros campos, se vierem, são ignorados.

**Limites** (os de `runs`):
- distância de 5 m a 300 km;
- duração em movimento até 172.800 s (48 h).

Fora disso, o item é rejeitado com o motivo `campos`.

Resposta: `200 {"versao":1,"aceitos":n,"ignorados":n,"rejeitados":[{"origem_id":"…","motivo":"…"}]}`. Item inválido não derruba os outros.

### `PUT /planejados/corrida`: treinos de corrida planejados (CRUNNING → Anilha)

Corpo: `{"versao":1,"de":"YYYY-MM-DD","ate":"YYYY-MM-DD","itens":[…]}`. A janela tem 14 datas: `de` é hoje no fuso do aparelho e `ate` é `de` + 13 dias. Vão até 30 itens. **Substitui** tudo da origem CRUNNING nessa janela: o que não veio vira apagado.

O CRUNNING manda um retrato por vez, em série, e não reenvia retrato velho de uma fila. O Anilha ordena os retratos pela chegada. Um campo `gerado_em` fica para uma versão futura, se precisar.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `origem_id` | string | `plano:<inicio do plano YYYY-MM-DD>:<semana>-<dia>` |
| `data_local` | data | |
| `tipo` | `leve` / `longo` / `intervalado` | mesmo mapeamento |
| `tipo_origem` | string ou null | |
| `nome` | string até 60 | nome do treino ("Longão 16 km") |
| `distancia_m` | número ou null | prevista |
| `duracao_s` | inteiro ou null | prevista |
| `importante` | bool | longão, intervalado forte ou prova |
| `status` | `planejada` / `feita` / `perdida` | |

No Anilha vai para uma tabela sincronizada nova (sugestão: `external_plan_items`, com `source`, `kind = 'corrida'` e as colunas acima, `id` texto até 64, `updated_at`, `deleted` e `server_seq` como as outras), só leitura para o usuário.

Resposta: `200 {"versao":1,"gravados":n,"apagados":n}`.

### `GET /forca?desde=<cursor>`: sessões de força (Anilha → CRUNNING)

Sem `desde`, devolve os últimos 14 dias. O `cursor` é opaco (sugestão: o `server_seq`). Resposta:

```json
{"versao":1,"cursor":"…","feitas":[…],"planejadas":[…]}
```

**`feitas`** (sessões de `sessions` concluídas ou parciais):

| Campo | Tipo | Regra |
| --- | --- | --- |
| `origem_id` | string | id da sessão |
| `atualizado_em` | ISO 8601 | |
| `apagado` | bool | |
| `data_local` | data | |
| `inicio` / `fim` | ISO 8601 ou null | |
| `status` | `concluida` / `parcial` | |
| `pernas` | bool | alguma série de membro inferior pela taxonomia do Anilha |
| `series_pernas` | inteiro | séries de trabalho de membros inferiores (aquecimento não conta) |
| `esforco` | 1 a 10 ou null | se a sessão tiver |
| `duracao_s` | inteiro ou null | |
| `nome` | string até 60 | nome da ficha |

**`planejadas`** (próximos 14 dias, pelo plano ativo):

| Campo | Tipo | Regra |
| --- | --- | --- |
| `data_local` | data | |
| `nome` | string até 60 | nome da ficha |
| `pernas` | bool | |
| `status` | `planejado` / `feito` / `pulado` / `movido` | |

## Links entre os apps

O URL scheme serve porque não há Universal Links na conta gratuita da Apple. O PWA ignora esses links.
- `crunning://corrida/<origem_id>` abre a corrida no CRUNNING.
- `anilha://sessao/<origem_id>` abre a sessão no Anilha nativo.

## LGPD

As corridas recebidas são dados de treino do próprio titular, na tabela que já existe: entram na exportação de "Seus dados" e no apagamento da conta (`on delete cascade`). A política ganha um item novo, "Conexão com o CRUNNING", com base legal "a definir" para a revisão jurídica. Revogar o token não apaga o que já chegou, e a tela diz isso.

## Testes mínimos (cada lado no seu repositório)

- **Anilha:**
  - token gerado, usado, revogado e trocado;
  - 401 sem expor o motivo;
  - 429;
  - reenvio idêntico ignorado; edição mais nova aceita;
  - lápide;
  - item inválido rejeitado sem derrubar o lote;
  - substituição da janela de planejados;
  - cursor de força;
  - RLS: o token de uma conta nunca lê nem grava em outra.
- **CRUNNING:**
  - mapeamento de tipo;
  - codificação dos itens (unidades, fuso, `null`);
  - `origem_id` estável por corrida;
  - fila que sobrevive a fechar o app e reenvia sem duplicar.
- Dados sempre fictícios.
