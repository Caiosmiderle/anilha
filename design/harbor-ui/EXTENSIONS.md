# Harbor UI: extensões do Anilha

O Harbor foi medido em desktop e não tem vários componentes de que um app de treino precisa no celular. Tudo abaixo vive em `extensions.css`, usa os tokens de `tokens.css` e segue a mesma linguagem: canvas off-white, cartões brancos com anel de 1 px, pílulas, discos pastel e uma cor de ação. `tokens.css`, `components.css` e `README.md` ficam intactos.

Cada item lista os tokens que usa e, quando existe, o valor novo e por quê.

## Token derivado

| Token            | Valor                                                         | Por quê                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ink-muted-aa` | `color-mix(in srgb, var(--ink-muted) 80%, var(--ink-strong))` | `ink-muted` dá 4,4:1 sobre `bg-page` e 4,2:1 sobre `bg-subtle`, abaixo de AA para texto pequeno. A mistura de duas tintas do Harbor passa de 5,4:1 em todos os fundos do Harbor, inclusive `brand-50` e `pastel-butter`. Usado em todo texto secundário fora de fundo branco. |

Tokens de contraste das ações (UX-05 e UX-16): `--action-start: #0073c2` e `--brand-deep: #006bb3` mantêm o gradiente azul com texto branco, mínimo 4,96:1 e 4,57:1 no hover com brilho 1,05. `--danger-fill: #c92d28` dá 5,40:1 com branco nos dois temas, preservando `--danger` para textos e outros acentos. `--focus-ring: var(--brand-700)` e `--shadow-focus: 0 0 0 3px var(--focus-ring)` tornam o indicador opaco; `--switch-off: #8a8a8e` distingue trilho, fundo e polegar. Esses dois indicadores superam 3:1 nos fundos neutros dos dois temas. Os valores são verificados em `src/styles/__tests__/contrast.test.ts`.

## Regras globais

- Alvo de toque mínimo de 44 px em botões, chips, campos, abas e ícones (`.hb-btn`, `.hb-iconbtn`, `.hb-qa`, `.hb-input`). Valor novo: 44 px (recomendação de acessibilidade).
- Botão primário com rótulo 18 px peso 600 (Marketing/button-lg), mantendo dimensões e tipografia. O gradiente usa `action-start` e `brand-deep`, com contraste de texto normal de pelo menos 4,5:1, inclusive no hover.
- `.hb-btn-tint` usa `brand-700` no rótulo (o README pede `brand-700` abaixo de 18 px).
- Foco visível sólido com `--shadow-focus` em tudo que é clicável. Em cores forçadas, outline com a cor de sistema `Highlight`; o switch recebe contorno e polegar com cores de sistema.
- `prefers-reduced-motion`: todas as animações e transições desligadas.
- `user-select: none` no `body` e `text` nos campos: segurar uma palavra não seleciona.
- iPhone: `touch-action: manipulation` no `html` e no `body` (dois toques rápidos num stepper não dão zoom; pinça continua), `-webkit-touch-callout: none` em links, botões e linhas de lista (segurar abre o menu do app, não a prévia de link do sistema) e campos com no mínimo 16 px (o iOS dá zoom em campo menor ao focar e a página fica ampliada).

## Componentes

### Abas inferiores (`.hb-tabbar`, `.hb-tab`)

Navegação no celular, escondida a partir de 1024 px (lá entra o `.hb-nav` do Harbor). Aba ativa com pílula `brand-50` e rótulo `brand-700` peso 600, como o NavBar.
Tokens: `bg-surface`, `line-strong`, `brand-50`, `brand-700`, `ink-muted`, `radius-pill`, `space-1`, `space-2`. Novo: altura mínima da aba 52 px.

### Folha e modal (`.hb-sheet`)

`<dialog>` nativo. No celular, folha presa embaixo com cantos `radius-2xl` e alça; a partir de 768 px, modal centrado com `radius-xl` e 520 px de largura.
Tokens: `bg-surface`, `shadow-card`, `radius-2xl`, `radius-xl`, `line-strong`, `space-2` a `space-6`. Fundo: `color-mix` de `ink-strong` a 32%. Novos: alça 36 x 4 px, altura máxima 90dvh, entrada de 0,2 s.

### Menu de ações (`.hb-menu`, `.hb-menu-item`)

Lista de ações dentro de folha, item de 52 px com ícone `ink-muted` e linha de apoio em 13 px.
Tokens: `ink`, `ink-muted`, `ink-muted-aa`, `bg-subtle`, `radius-lg`.

### Toast (`.hb-toasts`, `.hb-toast`)

Cartão branco com `shadow-card`, ícone `brand-700` (ou `danger` no erro), ação opcional em link. Some sozinho em 3,5 s (6 s com ação). Fica acima das abas.
Tokens: `bg-surface`, `shadow-card`, `radius-lg`, `brand-700`, `danger`, `space-24`. Novo: largura máxima 420 px.

### Seleção e interruptor (`.hb-selectwrap`, `.hb-switch`)

Select nativo com seta Lucide; interruptor de 52 x 32 px em `brand-500` quando ligado.
Tokens: `line-strong` no select, `switch-off` no trilho desligado, `brand-500`, `bg-surface`, `shadow-button`, `shadow-focus`, `radius-md`, `radius-pill`.

### Controle segmentado (`.hb-seg`)

Trilho `bg-subtle` em pílula; opção ativa vira cartão branco com `shadow-ring`.
Tokens: `bg-subtle`, `bg-surface`, `shadow-ring`, `ink-strong`, `ink-muted-aa`, `radius-pill`, `space-1`.

### Chips de escolha e etiqueta (`.hb-choice`, `.hb-chip`)

Escolha em pílula com anel `line-strong`; selecionada em `brand-50` com rótulo `brand-700` e anel `brand-300`. Etiqueta pequena (12 px) no pastel do tipo de conteúdo.
Tokens: `line-strong`, `brand-50`, `brand-300`, `brand-700`, pastéis.

### Stepper numérico (`.hb-stepper`)

Para mãos suadas: botões redondos de 52 px nas pontas, número de 24 px (Marketing/title) no meio, digitável com teclado numérico.
Tokens: `bg-subtle`, `bg-surface`, `shadow-ring`, `ink-strong`, `radius-pill`. Novo: botão 52 px.

### Linha de série (`.hb-setrow`, `.hb-kind`, `.hb-donebtn`)

Quatro colunas: tipo, valores, esforço e check. O tipo é uma pílula de um toque: trabalho com anel `line-strong`, aquecimento em `pastel-peach` com ícone de chama. Série ativa com fundo `brand-50`. Check feito em `brand-700` com ícone branco (5,6:1).
Tokens: `brand-50`, `brand-700`, `pastel-peach`, `line-strong`, `ink-strong`, `ink-muted-aa`, `radius-lg`, `radius-pill`. Novos: pílula de tipo 92 px, linha 56 px.

### Timer de descanso (`.hb-rest`)

Tempo grande em 44 px (Marketing/headline-2), barra de progresso `brand-500` sobre `line-strong`, ações "+15 s" e "Pular". Ao terminar, fundo `pastel-butter`, rótulo `banner-ink` e um pulso curto no número (desligado com movimento reduzido).
Tokens: `bg-subtle`, `pastel-butter`, `banner-ink`, `brand-500`, `line-strong`, `radius-xl`.

### Dock da sessão (`.hb-dock`)

Área fixa no rodapé da tela de treino, onde o polegar alcança: timer, esforço e editor da série.
Tokens: `bg-surface`, `line-strong`, `space-3`, `space-4`.

### Aviso dentro de cartão (`.hb-advice`)

Sugestões e alertas: fundo `bg-subtle` (alerta) ou `brand-50` (sugestão do motor), ícone à esquerda, link "Ignorar" quando cabe.
Tokens: `bg-subtle`, `brand-50`, `brand-700`, `ink`, `ink-muted-aa`, `radius-lg`.

### Esqueleto de carregamento (`.hb-skel`)

Faixa com brilho de `bg-subtle` a `bg-page`, 1,2 s, desligada com movimento reduzido.
Tokens: `bg-subtle`, `bg-page`, `radius-md`.

### Gráficos (`.hb-chart` e `BarList`)

Série principal em `brand-500` com 2,5 px e pontos com borda branca; comparação tracejada em `ink-muted`; eixo mínimo em `line-strong`; rótulo direto no último ponto; textos de 12 px em `ink-muted-aa`. O SVG mede a largura real para o texto não encolher. Barras horizontais em HTML com trilho `bg-subtle`, barra `brand-500` e limite tracejado em `ink-muted`. Sem arco-íris.
Novos: coluna de rótulo 108 px e de valor 64 px nas barras.

### Medidor (`.hb-meter`)

Barra de aderência de 8 px em `brand-500` sobre `bg-subtle`.

### Cartão de reconhecimento (`.hb-recog`)

Fundo pastel do tipo de conquista (`pastel-butter` para semana e constância, `pastel-mint` para corrida, pastel do grupo para recorde), título curto em 16 px, número grande em 44 px, detalhe em 15 px, texto sempre `ink`. Uma animação só: sobe 6 px e aparece em 0,4 s, desligada com movimento reduzido. Sem confete, troféu ou medalha.

### Semana (`.hb-week`, `.hb-day`)

Sete dias com letra, disco de 36 px e número. Feito: disco no pastel do treino. Planejado: disco branco com anel e ícone muted. Hoje: anel `brand-500`.

### Listas (`.hb-list`, `.hb-list-row`, `.hb-disc-sm`)

Linhas de 60 px separadas por `line-tint`, disco pastel de 36 px.

### Faixa da semana (`.weekstrip`)

Os sete dias do plano em quadrados, segunda primeiro: letra da ficha no pastel do treino, tênis na corrida, lua no descanso. Usada no onboarding e no plano gerado.
Tokens: `radius-md`, pastéis, `ink-strong`, `ink-muted-aa`, `space-1`. Novo: vão de 6 px entre os quadrados, para caber sete em 358 px.

### Pílulas de ficha (`.fichapills`, `.fichapill`)

Cada ficha do rodízio como pílula no pastel do grupo, com a letra num disco branco de 22 px.
Tokens: `radius-pill`, `bg-surface`, pastéis, `ink`, `ink-strong`.

### Cartões de opção (`.optioncards`, `.optioncard`)

Escolha única entre poucas opções, cada uma como cartão com título, uma linha de explicação, ícone ou pílulas e um selo "Sugerido". Selecionado: borda e anel `brand-500` e círculo de check preenchido. Substitui listas longas de chips no onboarding.
Tokens: `bg-surface`, `line-strong`, `brand-500`, `brand-50`, `brand-700`, `bg-subtle`, `radius-lg`, `radius-md`, `radius-pill`, `space-2`, `space-3`, `space-4`, `shadow-focus`.

### Mapa do corpo (`.bodymap`)

Silhueta em `line-strong` com as articulações para tocar: ponto como caixa de seleção (anel `ink-subtle`, marcado em `brand-500` com check) e rótulo em pílula `bg-subtle`, que fica `brand-50` com texto `brand-700` quando marcado. Um lado é tocável e o outro espelha. Novo: desenho de 200 por 320 px e alvo de 44 px em cada ponto.

### Código de convite (`.invite-code`)

Código grande, 28 px peso 600 com espaçamento de 3 px e separado em dois blocos de quatro, para ler em voz alta ou redigitar no app instalado. Fundo `bg-subtle`, `radius-lg`.

### Caixa de marcar (`.checkrow`)

Para consentimento e confirmação, onde um interruptor diria "ligado" e o que se quer é "concordo". O `.hb-check` do Harbor tem 16 px e não desenha o check; esta tem caixa de 24 px com borda `ink-muted` (4,6:1 sobre `bg-surface`), marcada em `brand-deep` com check branco, texto de 16 px ao lado e linha de no mínimo 44 px. O campo nativo fica por cima da caixa, transparente: teclado e leitor de tela funcionam como numa caixa comum.
Tokens: `bg-surface`, `ink-muted`, `brand-deep`, `ink-on-brand`, `ink`, `shadow-focus`, `space-2`, `space-3`.

### Marca (`.hb-logo`, `.hb-wordmark`)

Substitui o bloco neutro do Harbor: o mesmo bloco com gradiente `brand-300` a `brand-500`, agora com uma anilha cujo anel tem um vão (o descanso planejado). Nome em 18 px peso 600.

## Tema escuro

Os mesmos tokens com outros valores, em `:root[data-theme='dark']` e em `prefers-color-scheme: dark` quando a pessoa não escolheu o claro. Fundo `#0f1012`, superfície `#18191c`, sutil `#222327`; tinta `#e6e6e8`, forte `#f7f7f8`, muted `#a1a1a8`; linhas em branco a 8%. `brand-50` vira `#0d2a40` e `brand-700` vira `#8fd0ff`, porque `brand-700` é texto sobre `brand-50`. Pastéis viram tons profundos (céu `#1c3a4e`, pêssego `#4a3322`, lima `#3a421a`, lavanda `#302a4f`, rosa `#47283b`, menta `#1a4240`, manteiga `#474016`) com tinta clara. Sombras viram um anel claro de 6%. Contrastes medidos: texto secundário de 4,9:1 a 9:1, `brand-700` sobre `brand-50` 8,9:1.

Token novo `--brand-deep: #006bb3` (igual nos dois temas): preenchimento sólido sob texto branco (contador do sino, botão de série feita), já que `brand-700` clareia no escuro.

## Mapa de pastéis

Um pastel fixo por tipo de conteúdo, igual em chips, discos, gráficos e reconhecimentos.

| Conteúdo                                     | Pastel               |
| -------------------------------------------- | -------------------- |
| Costas, puxar, superior                      | `pastel-sky`         |
| Peito, empurrar                              | `pastel-peach`       |
| Pernas, inferior                             | `pastel-lime`        |
| Ombros                                       | `pastel-lavender`    |
| Braços                                       | `pastel-pink`        |
| Corrida                                      | `pastel-mint`        |
| Plano, semana e reconhecimento de constância | `pastel-butter`      |
| Abdômen, treino misto, corpo inteiro         | `bg-subtle` (neutro) |

## Layout

- Coluna de até 1100 px (do README do Harbor), margens de `space-4` no celular e `space-6` a partir de 640 px.
- Grade de duas colunas (3 para 2) a partir de 1024 px, como o grid de widgets do Harbor.
- Títulos de página: App/auth-title (24 px) no celular e App/page-title (32 px) no desktop.
- Barra superior da sessão com 56 px, a mesma altura do NavBar.
