# Anilha: brief de marketing

Dono das decisões: Claude. Execução física (prints em celular real, upload, testes): Caio.

## Fase 0: o que existe

### Funcionalidades que existem e funcionam hoje

Verificado no código e nos testes (166 de unidade e banco, 25 de ponta a ponta em 390x844).

- **Entrar sem senha**: e-mail, código de 6 dígitos, conta sincronizada na nuvem.
- **Plano da semana em 6 passos**: objetivo, dias de academia e corrida (e quais dias correr), minutos, horário, divisão em fichas (A a E em rodízio, superior e inferior, corpo inteiro), equipamento, nível, articulações para poupar. Gera rotinas com o porquê de cada escolha.
- **Tela Hoje**: diz o que treinar hoje e por quê, ajustes de um toque (pouco tempo, focar num grupo, sem equipamento, poupar articulação, trocar por corrida, descanso), semana desenhada, reconhecimentos, semana leve sugerida quando o cansaço acumula.
- **Treino**: carga e repetições já preenchidas, "Concluir série" em um toque, esforço em um toque, descanso contando sozinho com aviso no fim (som, vibração ou notificação com o app fechado), aquecimento obrigatório calculado (40% e 80% da carga), bi-set, trocar ou pular exercício com rastro, entrada rápida por texto ("40kg 10 10 9"), cronômetro do treino.
- **Progressão**: sugestão da próxima carga por exercício, recordes (carga, 1RM estimado, repetições), gráfico de progresso, séries por grupo na semana.
- **Cardio**: corrida (pace, tipo, marcos de distância) e caminhada, bike, elíptico, natação, remo, escada; importar arquivo do relógio (.gpx ou .tcx).
- **Corpo**: peso e cintura com média da semana e ritmo de ganho.
- **Amigos e grupos**: convite por link ou código, aderência ao plano, "boa" em um toque, ranking do grupo pela porcentagem do plano de cada um (treinar a mais não sobe).
- **Avisos e notificações**: sino com convites e reações; push de fim do descanso, atividade de amigos e lembrete do treino.
- **Sem internet**: tudo funciona offline e sincroniza quando a rede volta.
- **Ajustes**: tema claro, escuro ou automático, aviso do descanso (som e vibração, só vibrar, só na tela), tela acesa.
- **Dados**: exportar e importar CSV, apagar conta.
- **Preço**: grátis, sem anúncio, sem plano pago no código.

Não existe e portanto não aparece em vídeo nem landing: integração com Apple Saúde ou Strava, app na loja, número de usuários, depoimentos.

### Identidade visual real (Harbor UI)

- Cores: fundo `#fafafa`, superfície `#ffffff`, tinta `#262626` e `#141413`, marca `#0099ff` (brand-500), `#0087e1`, `#006bb3` (brand-700, texto sobre claro), `#e3f2fd` (brand-50). Pastéis por grupo: peach `#f8d6b0` (peito), sky `#bae3fd` (costas), lime `#e8f0a4` (pernas), lavender `#dbd4fd` (ombros), pink `#f4d0e7` (braços), mint `#b5edeb` (cardio), butter `#fde88a` (plano).
- Tipografia: pilha do sistema (SF Pro no iPhone). Nos vídeos, Inter (do kit), a mais próxima do SF Pro que tem licença livre; títulos 600 a 700.
- Raios: 8, 12, 16, 24 e pílula 99 px. Botão primário em gradiente azul do Harbor, chips em pílula, cartões brancos com sombra fina.
- Ícones: Lucide, traço 1,8. Logo: disco azul com anel branco (`public/favicon.svg`).
- Proibido: gradiente roxo genérico, vidro sem motivo, emoji, 3D falso. Os estilos do kit entram só como vocabulário de movimento.

### Instalabilidade (auditoria do PWA)

| Item                                                              | Estado                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `name`, `short_name`, `start_url`, `scope`, `display: standalone` | ok                                                                                                |
| `theme_color`, `background_color`                                 | ok (`#fafafa`)                                                                                    |
| Ícones 192, 512 e maskable 512                                    | ok                                                                                                |
| Service worker (Workbox, atualiza sozinho)                        | ok                                                                                                |
| `apple-touch-icon`, metas do iOS                                  | ok                                                                                                |
| `id` do app                                                       | faltava: corrigido (`/`)                                                                          |
| Capturas no manifesto (instalação rica no Android)                | faltavam: corrigido com telas reais                                                               |
| Barra do sistema no tema escuro                                   | ficava clara: corrigido com `theme-color` por esquema de cor                                      |
| Landing fora do app                                               | o service worker mandaria `/conheca` para o app: corrigido (lista de exclusão e fora do precache) |

### Onde ficam os dados

IndexedDB no aparelho (uma base por conta) e Supabase na nuvem, com login por e-mail. No iPhone, o app instalado tem armazenamento separado do Safari, então o login não passa de um para o outro: é preciso entrar de novo no app instalado. Os dados não se perdem, porque voltam da nuvem ao entrar com o mesmo e-mail. Exceção: treino feito sem internet no Safari que ainda não sincronizou; abrir o Safari com internet uma vez envia. Decisão: o produto já resolve (sync); o manual deixa claro "entre com o mesmo e-mail".

### Ambiente de vídeo

Node 24, FFmpeg 9.0.2 com H.264 e AAC (winget, só para o usuário, sem admin), HyperFrames 0.8.174, Chromium headless do Playwright via `HYPERFRAMES_BROWSER_PATH`. Whisper não instalado: não há narração. Docker não é preciso (render local).

## Plano

### Público

Quem faz musculação de 3 a 5 vezes por semana, 18 a 40 anos, treina com o celular na mão e hoje anota no bloco de notas, no papel ou de cabeça. Boa parte também corre ou faz cardio. Fala de academia: ficha, série, carga, descanso.

### Promessa (1 frase)

O Anilha monta sua semana de treino e anota cada série num toque.

### Provas reais (mostradas com telas reais)

1. A tela Hoje diz o que treinar e por quê.
2. Carga e repetições já vêm preenchidas; um toque conclui a série e o descanso começa a contar.
3. Bateu a meta, ele sugere subir a carga.
4. Fichas em rodízio e corrida nos dias escolhidos, montadas em 6 passos.
5. Ranking do grupo pela porcentagem do plano de cada um.

Extras de uma linha: funciona sem internet; grátis.

### Som

Escolha: o método do guia do HyperFrames, não o do Katana. Som só onde algo acontece de verdade: tick quando uma série é concluída ou um item marca, counter enquanto um número rola, chime no cartão final, pop no logo. Nenhum whoosh. Motivo: o anúncio roda quase sempre no mudo, então o som é reforço e não muleta; um som por movimento vira ruído de template e briga com a precisão que o app vende (um toque, uma série).

Música: a primeira versão sai sem trilha e com a edição numa grade de 120 BPM (batida a cada 0,5 s), para encaixar uma trilha depois sem recortar. Se o Caio quiser trilha: Pixabay Music (licença cobre anúncio no YouTube e uso no site, sem atribuição), instrumental sem voz, 118 a 122 BPM, eletrônica ou hip-hop limpo, energia constante desde o primeiro compasso, 40 s ou mais. Salvar em `marketing/video/assets/music/trilha.mp3`.

Narração: não. O texto na tela carrega tudo e o vídeo tem que funcionar no mudo.

Sem endereço do site na tela (decisão do Caio): o anúncio leva o link; o vídeo fecha com a marca e a chamada.

### Vídeo 1: YouTube, 1920x1080, cerca de 28 s

Grade de 0,5 s. Celular com a tela real à direita, texto à esquerda; o zoom vai na parte que importa.

| Tempo       | Tela     | Texto                                                                                                             | Movimento                                        | Som             |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------- |
| 0,0 a 0,8   | logo     | Anilha                                                                                                            | disco entra com pop, nome sobe                   | pop             |
| 0,8 a 2,5   |          | Seu treino da semana, montado.                                                                                    | palavras sobem em sequência                      |                 |
| 2,5 a 4,5   |          | Cada série, num toque.                                                                                            | punch-in de 15%                                  | tick            |
| 4,5 a 7,5   | Hoje     | Abre e já sabe o que treinar.                                                                                     | celular sobe, zoom no cartão "Hoje"              |                 |
| 7,5 a 12,0  | Treino   | Carga já preenchida. Um toque e o descanso conta.                                                                 | zoom nos campos, toque em Concluir, check, timer | tick, counter   |
| 12,0 a 15,0 | Sugestão | Bateu a meta? Ele sobe a carga.                                                                                   | zoom na sugestão, número rola                    | counter         |
| 15,0 a 18,5 | Plano    | Fichas em rodízio. Corrida no seu dia.                                                                            | pan pela semana                                  | tick nas fichas |
| 18,5 a 21,5 | Grupo    | Treine com os amigos. Vale o plano de cada um.                                                                    | zoom no ranking                                  |                 |
| 21,5 a 24,0 |          | Funciona sem internet. Grátis.                                                                                    | palavras batem no ritmo                          | tick            |
| 24,0 a 28,0 | final    | Anilha. Treino de academia e corrida, num toque. Comece grátis. Instala direto do navegador do celular, sem loja. | logo, linha, chamada                             | chime           |

### Vídeo 2: celular, 1080x1920, cerca de 21 s

Diagramado para o vertical: celular grande no centro, texto acima dele, tudo dentro dos 80% centrais, fora dos 250 px do topo, dos 20% de baixo e da lateral direita.

| Tempo       | Tela     | Texto                                                    |
| ----------- | -------- | -------------------------------------------------------- |
| 0,0 a 0,6   | logo     | Anilha                                                   |
| 0,6 a 2,0   |          | Seu treino da semana, montado.                           |
| 2,0 a 4,0   |          | Cada série, num toque. (punch-in)                        |
| 4,0 a 8,0   | Treino   | Carga já preenchida. Um toque e o descanso conta.        |
| 8,0 a 11,0  | Sugestão | Bateu a meta? Ele sobe a carga.                          |
| 11,0 a 14,0 | Plano    | Fichas em rodízio. Corrida no seu dia.                   |
| 14,0 a 16,5 | Grupo    | Vale o plano de cada um.                                 |
| 16,5 a 18,0 |          | Grátis. Funciona sem internet.                           |
| 18,0 a 21,0 | final    | Anilha. Comece grátis. Instala pelo navegador, sem loja. |

### Landing

Página estática em `/conheca/`, fora do pacote do app (não pesa no carregamento dele), linkada da tela de entrar e da tela Você.

1. Topo: nome, promessa, vídeo (horizontal no computador, vertical no celular, só um baixa), botão de som, "Abrir o Anilha" e "Instalar".
2. Provas: as 5 provas com as telas reais.
3. Como instalar: detecta o aparelho e abre a aba certa (Android, iPhone, computador); botão de um toque quando o navegador oferece; esconde tudo se já estiver instalado; navegador interno (Instagram, Facebook, TikTok) ganha o passo de abrir no Chrome ou Safari.
4. Manual: do primeiro acesso ao primeiro treino e o que vem depois, um passo por tela.
5. Perguntas frequentes: só o que é verdade no código.
6. Texto do vídeo, para quem não assiste.

## Resultado

- YouTube: 28 s, 1920x1080, H.264 e AAC. Celular: 21 s, 1080x1920. Masters em `marketing/video/out/` (fora do git); versões leves (0,9 MB e 0,7 MB) e pôsteres em `public/conheca/media/`.
- Mudanças em relação ao plano: o fim fecha com "Comece grátis" e "Instala direto do navegador, sem loja", sem endereço (pedido do Caio). O zoom virou movimento de câmera no celular inteiro, para nenhum texto da tela ser cortado na lateral. A troca de tela é corte seco no toque.
- Landing: Lighthouse no celular com 100 em performance, acessibilidade e boas práticas. Teste de ponta a ponta cobre aba por aparelho, aviso de navegador interno, um vídeo só por visita e o caminho até entrar.
- Pendente com o Caio: o checklist de celular real (`marketing/CHECKLIST.md`) e, se quiser, a trilha.
