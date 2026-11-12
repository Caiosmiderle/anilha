# Mídia e vídeos dos exercícios

Como o "Como fazer" ganha imagem e vídeo sem puxar nada de site de terceiros.

## Onde fica cada coisa

| Arquivo                         | Quem escreve                       | O quê                                                                  |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `src/content/howto.json`        | a equipe (dicas) e o Caio (vídeos) | 3 a 4 dicas, até 2 erros comuns, `videoId`, `start` e `end` (segundos) |
| `src/content/media.json`        | `scripts/media/import.ts`          | URL no nosso armazenamento, fonte, autor, licença, link da licença     |
| `src/content/video-status.json` | GitHub Action semanal              | vídeo que saiu do ar, ficou privado ou sem incorporação                |

## Fontes de mídia: o que os termos permitem (lidos em 20/10/2026)

- **ExerciseDB V1, versão gratuita** (oss.exercisedb.dev, da AscendAPI, o repositório
  github.com/ExerciseDB/exercisedb-api): permitido em projetos pessoais, protótipos,
  ferramentas educativas e apps **não comerciais**. Produto comercial, SaaS ou uso monetizado
  exige plano pago pela RapidAPI. Atribuição obrigatória. O AGPL-3.0 do repositório cobre o
  código, não as mídias. **Não serve para o Anilha na versão gratuita**: o script recusa.
- **ExerciseDB com vídeos e imagens, plano pago** (AscendAPI na RapidAPI, termos de janeiro de
  2026): acesso só em tempo real. Proibido guardar GIFs, vídeos ou imagens no aparelho, em
  servidor, banco ou nuvem, cache acima de 1 hora e uso depois da assinatura. Só funcionaria
  carregando do CDN deles a cada vez, o que contraria a regra de não puxar mídia de fora e o
  uso sem sinal na academia. **Não serve**: o script recusa. O dataset completo vendido à parte
  (shop.ascendapi.com) pode ter outra licença, mas a página fica atrás de uma verificação
  anti-robô; só com confirmação por escrito da AscendAPI (support@exercisedb.dev).
- **RepDB, versão gratuita** (github.com/RepDB/exercise-dataset, licença v1.0): uso pessoal e
  comercial **dentro de apps**, sem custo, com o link "Exercise data by RepDB (repdb.co)"
  visível (fica em Você, Créditos e licenças). Não pode republicar como dataset ou API, nem
  usar as imagens em IA generativa; as animações de amostra da versão paga não podem ir para
  produção. Imagens estáticas de 512 px, na maioria em duas posições (começo e pico), que o
  app alterna em loop. **Serve**, com uma ressalva para o jurídico: as imagens ficam num bucket
  público, acessível por URL, o que entendo como uso no app e não como redistribuição de
  dataset.

## Importação feita (20/10/2026)

O Caio escolheu o RepDB. A importação rodou dentro da própria Supabase, pela Edge Function
`importar-midia` (`supabase/functions/importar-midia/index.ts`), que já tem a chave de serviço
no ambiente dela: ninguém copiou a chave. Ela criou o bucket público `midia-exercicios` (só
imagens, até 1 MB), copiou as imagens para `repdb/{exercício}/{inicio|fim|principal}.webp` e
devolveu os endereços, gravados em `src/content/media.json`: 89 exercícios, 87 com as duas
posições. Depois foi publicada de novo desligada (responde 410 e exige login), e o token de
uso único foi apagado.

Para importar de novo pela função: gerar um token novo, pôr o SHA-256 dele em `TOKEN_SHA256`
no arquivo da função (vazio recusa tudo), publicar, chamar em lotes
(`POST /functions/v1/importar-midia?inicio=0&fim=30` com o cabeçalho `x-token`), juntar as
`entradas` no `media.json` com fonte, autor, licença e atribuição, e publicar a função
desligada de novo.

## Importar pelo terminal (alternativa)

```bash
npx tsx scripts/media/import.ts --fonte repdb
```

Só confere: termos, mapa e o que falta. Nada é enviado.

```bash
SUPABASE_URL=https://ssuuvzgqtobnfvobvjcu.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/media/import.ts --fonte repdb --enviar
```

Cria o bucket público `midia-exercicios`, baixa da fonte, envia para o nosso armazenamento e
grava `src/content/media.json`. A chave de serviço fica no terminal de quem roda, nunca em
arquivo. Depois, commit e push do `media.json`.

### Mapa do catálogo para o RepDB (`scripts/media/mapa-repdb.json`)

- 89 de 92 exercícios com equivalente.
- Sem equivalente (ficam só com as dicas): supino inclinado na máquina, tríceps na polia com
  corda, panturrilha no leg press.
- Aproximados, revisados olhando as imagens em 20/10/2026 e mantidos: elevação lateral na
  máquina (máquina de anilha), paralelas (barras paralelas), panturrilha unilateral (sem o
  halter, mesmo movimento).

## Vídeos do YouTube

Em espera desde 20/10/2026: o Caio prefere imagem a vídeo. Nenhum id no conteúdo; "Buscar no
YouTube" aparece só nos exercícios sem imagem. O que segue vale se a ideia voltar.

- Só entra id que o Caio escolher. Em `src/content/howto.json`, no exercício: `videoId` (11
  caracteres, o que vem depois de `v=`), e se quiser `start` e `end` em segundos.
- O app mostra uma fachada; o player do youtube-nocookie só carrega no toque.
- Toda segunda, a Action "Vídeos dos exercícios" consulta o oEmbed de cada vídeo. Removido,
  privado ou sem incorporação: marcado em `video-status.json` e some do app no deploy seguinte.
  Dá para rodar na mão em Actions, ou `node scripts/media/check-videos.mjs`.

## Prioridade para escolher vídeos

Os 40 exercícios que mais aparecem nos planos gerados (1.080 combinações de objetivo, foco,
dias, local e nível, cada exercício contado pelas vezes por semana). Os 12 primeiros cobrem
61% das séries. Gerado com `npx tsx scripts/media/priority.ts 40`.

| #   | Exercício                            | id                                 | Parte das séries | Acumulado |
| --- | ------------------------------------ | ---------------------------------- | ---------------- | --------- |
| 1   | Stiff com halteres                   | `stiff-halteres`                   | 7,2%             | 7,2%      |
| 2   | Prancha                              | `prancha`                          | 6,6%             | 13,8%     |
| 3   | Agachamento búlgaro                  | `agachamento-bulgaro`              | 6,5%             | 20,3%     |
| 4   | Desenvolvimento com halteres sentado | `desenvolvimento-halteres-sentado` | 5,7%             | 26,0%     |
| 5   | Elevação lateral com halteres        | `elevacao-lateral`                 | 5,3%             | 31,2%     |
| 6   | Supino inclinado com halteres        | `supino-inclinado-halteres`        | 5,0%             | 36,3%     |
| 7   | Puxada frente na polia               | `puxada-frente`                    | 4,9%             | 41,2%     |
| 8   | Remada unilateral com halter         | `remada-unilateral`                | 4,5%             | 45,6%     |
| 9   | Panturrilha unilateral com halter    | `panturrilha-halter`               | 4,1%             | 49,7%     |
| 10  | Rosca martelo                        | `rosca-martelo`                    | 3,9%             | 53,7%     |
| 11  | Agachamento goblet                   | `agachamento-goblet`               | 3,9%             | 57,6%     |
| 12  | Supino reto com halteres             | `supino-reto-halteres`             | 3,7%             | 61,3%     |
| 13  | Rosca alternada com halteres         | `rosca-alternada`                  | 2,5%             | 63,8%     |
| 14  | Tríceps na polia com barra           | `triceps-polia`                    | 2,5%             | 66,3%     |
| 15  | Agachamento livre com barra          | `agachamento-livre`                | 2,0%             | 68,3%     |
| 16  | Stiff com barra                      | `stiff`                            | 2,0%             | 70,2%     |
| 17  | Tríceps francês com halter           | `triceps-frances`                  | 1,9%             | 72,2%     |
| 18  | Cadeira flexora                      | `cadeira-flexora`                  | 1,9%             | 74,0%     |
| 19  | Leg press 45                         | `leg-press-45`                     | 1,9%             | 75,9%     |
| 20  | Supino reto com barra                | `supino-reto-barra`                | 1,7%             | 77,6%     |
| 21  | Remada curvada com barra             | `remada-curvada`                   | 1,7%             | 79,3%     |
| 22  | Remada baixa na polia                | `remada-baixa`                     | 1,5%             | 80,8%     |
| 23  | Elevação de pernas deitado           | `elevacao-pernas-solo`             | 1,5%             | 82,3%     |
| 24  | Passada com halteres                 | `passada`                          | 1,5%             | 83,8%     |
| 25  | Rosca direta com barra               | `rosca-direta`                     | 1,5%             | 85,2%     |
| 26  | Mergulho no banco                    | `mergulho-banco`                   | 1,5%             | 86,7%     |
| 27  | Elevação de pernas na cadeira        | `elevacao-pernas-cadeira`          | 1,2%             | 87,9%     |
| 28  | Agachamento sumô com halter          | `agachamento-sumo`                 | 1,1%             | 89,0%     |
| 29  | Panturrilha sentado                  | `panturrilha-sentado`              | 1,0%             | 90,1%     |
| 30  | Afundo com halteres                  | `afundo`                           | 0,9%             | 91,0%     |
| 31  | Panturrilha em pé na máquina         | `panturrilha-em-pe`                | 0,8%             | 91,8%     |
| 32  | Crucifixo na máquina                 | `crucifixo-maquina`                | 0,8%             | 92,5%     |
| 33  | Hack squat                           | `hack-squat`                       | 0,8%             | 93,3%     |
| 34  | Levantamento terra                   | `levantamento-terra`               | 0,8%             | 94,1%     |
| 35  | Cadeira extensora                    | `cadeira-extensora`                | 0,8%             | 94,8%     |
| 36  | Crossover na polia                   | `crossover`                        | 0,8%             | 95,6%     |
| 37  | Crucifixo com halteres               | `crucifixo-halteres`               | 0,8%             | 96,4%     |
| 38  | Elevação pélvica com barra           | `elevacao-pelvica`                 | 0,7%             | 97,1%     |
| 39  | Dead bug                             | `dead-bug`                         | 0,6%             | 97,7%     |
| 40  | Abdominal supra                      | `abdominal-supra`                  | 0,5%             | 98,2%     |

## Imagens próprias (21/10/2026)

Os três exercícios que o RepDB não tem (supino inclinado na máquina, tríceps na polia com
corda, panturrilha no leg press) ganharam imagens feitas por nós em 3D, no projeto do motion
(`marketing/motion/src/exercise`): um manequim com a mesma roupa das outras imagens, cinemática
inversa para mãos e pés pararem nas pegas e na plataforma, e as duas posições (início e fim).
Ficam no próprio app, em `public/midia/{exercício}/inicio.webp` e `fim.webp` (512 por 512),
com a fonte "Anilha" nos créditos.

Para refazer ou criar outra:

```
cd marketing/motion
npx tsx scripts/stills.ts Exercicio-triceps-corda 0 1
ffmpeg -i qc/Exercicio-triceps-corda/0000.png -vf scale=512:512 -c:v libwebp -quality 86 ../../public/midia/triceps-corda/inicio.webp
```
