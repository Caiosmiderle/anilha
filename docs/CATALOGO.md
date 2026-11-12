# Catálogo de exercícios

A biblioteca do app fica em `src/engine/exercises.ts`: 92 exercícios, com ids estáveis (nunca
renomear). Os exercícios do catálogo vivem no aparelho; só as mudanças da pessoa sobem para o
servidor. Exercícios criados pela pessoa têm o mesmo formato, sem nível.

## Schema (`ExerciseDef`, em `src/engine/types.ts`)

| Campo               | Tipo                                                                                 | Para quê                                                           |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `id`                | texto                                                                                | Chave estável, em pt-BR sem acento (`supino-reto-barra`)           |
| `name`              | texto                                                                                | Nome na tela                                                       |
| `primary_group`     | `peito`, `costas`, `ombros`, `bracos`, `pernas`, `core`                              | Grupo da biblioteca e do filtro "Ver todos de"                     |
| `secondary_groups`  | lista de grupos                                                                      | Grupos que ajudam                                                  |
| `muscles`           | lista de músculos                                                                    | O primeiro é o músculo principal: define o grupo de volume semanal |
| `secondary_muscles` | lista de músculos                                                                    | Músculos que ajudam                                                |
| `equipment`         | `halteres`, `barra`, `polia`, `maquina`, `peso_corporal`, `kettlebell`, `barra_fixa` | Filtro pelo local de treino                                        |
| `pattern`           | padrão de movimento (`empurrar_horizontal`, `puxar_vertical`, `agachar`...)          | Troca e ajuste do dia                                              |
| `measure`           | `weight_reps`, `reps`, `time`                                                        | Como a série é registrada                                          |
| `increment_kg`      | número                                                                               | Passo da progressão de carga                                       |
| `joints`            | lista de articulações                                                                | Fica de fora quando a pessoa poupa essa articulação                |
| `compound`          | sim ou não                                                                           | Composto antes do isolado; descanso e repetições                   |
| `bodyweight`        | sim ou não                                                                           | Carga do corpo                                                     |
| `progression_hint`  | texto ou vazio                                                                       | Dica de progressão                                                 |
| `level`             | `iniciante`, `intermediario`, `avancado`                                             | **Novo.** Técnica e força de base que o exercício pede             |

### Nível (`level`)

- **Iniciante**: máquinas, polias e movimentos simples com halteres ou com o corpo (66).
- **Intermediário**: barra livre e movimentos que pedem equilíbrio ou amplitude grande (21: agachamento livre, supino com barra, stiff, búlgaro, afundo).
- **Avançado**: o que muita gente ainda não faz ou carrega a coluna pesado (5: barra fixa, paralelas, levantamento terra, elevação de pernas na barra, roda abdominal).

Um teste (`src/engine/__tests__/suggest.test.ts`) falha se algum exercício do catálogo ficar
sem nível. Exercícios salvos no aparelho antes deste campo usam o nível do catálogo pelo id.

## Troca de exercício no treino

`suggestSubstitutes` em `src/engine/substitute.ts`:

1. Só exercícios do mesmo grupo muscular do principal (peito com peito, posterior com
   posterior). Fora o próprio exercício e os que já estão no treino; com a permissão de saúde,
   fora os que forçam articulações poupadas.
2. Ordem: mesmo músculo principal, depois mesmo padrão de movimento, depois equipamento do
   local da pessoa, depois nível compatível (acima do nível vai para depois), e no empate a
   ordem do catálogo, onde a variação mais próxima vem antes.
3. No máximo 6, cada um com uma linha de porquê: "Mesmo movimento, com halteres.", "Mesmo
   músculo em outro movimento, na polia.", "Outra parte do ombro, com halteres.", "Mesmo
   movimento, mas pede barra.", "..., e pede mais técnica.".
4. Abaixo, o link "Ver todos de {grupo}" abre a biblioteca já filtrada pelo grupo, com busca.

## Como fazer (`src/content/`)

`howto.json`, um item por exercício do catálogo (um teste falha se faltar ou sobrar):

| Campo     | Tipo               | Regra                                                     |
| --------- | ------------------ | --------------------------------------------------------- |
| `tips`    | lista de textos    | 3 a 4 dicas, escritas por nós em PT-BR                    |
| `errors`  | lista de textos    | 1 a 2 erros comuns                                        |
| `videoId` | texto              | vazio até o Caio escolher; 11 caracteres de id do YouTube |
| `start`   | segundos ou `null` | onde o vídeo começa                                       |
| `end`     | segundos ou `null` | onde o vídeo termina                                      |

`media.json`, um item por exercício com mídia importada: `frames` (posições em sequência) ou
`url` (arquivo animado), `fonte`, `autor`, `licenca`, `licencaUrl`, `origem` e `atribuicao`.
O passo a passo da importação e dos vídeos está em docs/MIDIA.md.
