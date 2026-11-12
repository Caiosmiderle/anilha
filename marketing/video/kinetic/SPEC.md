# SPEC: Anilha kinetic (04/11/2026)

Pedido: `marketing/PROMPT-KINETIC.md`. Fonte única das cenas: `storyboard.mjs`; `node build.mjs` gera os três projetos (`desktop/`, `mobile/`, `landing/`). Não edite os HTML gerados à mão: o próximo build apaga.

```text
GOAL:    quem treina com o celular na mão entende em um olhar que o Anilha monta a
         semana e anota a série num toque, e toca em "Comece grátis".
OUTPUT:  HyperFrames 0.9.13, 30 fps. desktop 1920x1080 (34 s), mobile 1080x1920
         (22 s), landing 1920x1080 (60 s, toca sem som em loop).
TIME:    trilha a 90 BPM (batida 0,667 s = 20 quadros), entrando no drop aos 10,785 s;
         o storyboard é escrito em meio segundo e build.mjs encaixa cada cena em
         batidas inteiras, esticando o que acontece dentro dela na mesma proporção.
LOOK:    o próprio app (Harbor UI). Chão das telas #e3f2fd (brand-50), chão de gancho,
         marca e final #fafafa, tinta #141413, destaque #006bb3 numa expressão por linha.
         Inter 700 nas linhas (84 px no 16:9, 92 px no 9:16), Inter 900 nas palavras
         grandes (300 px / 210 px, tracking -5%). Telas reais 1170x2532, raio 84 px,
         sombra 0 50 140 a 16% e contorno de 5 px a 6%.
         Palavras grandes em campo de cor chapado com os pastéis dos grupos musculares do
         app: butter #fde88a, lime #e8f0a4, mint #b5edeb, sky #bae3fd, peach #f8d6b0;
         "Um toque." no azul do botão primário do app, #0071bd (amostrado da captura).
OBJECTS: a tela do app como objeto (cantos e sombra no plano aberto); o botão
         "Iniciar treino" e o "Concluir série" reais, que afundam quando tocados; a logo
         (public/favicon.svg) e o botão "Comece grátis" no azul do app.
MOTION:  câmera: expo.inOut 0,4 a 0,5 s, desfoque de 5 px no pico do movimento; entradas
         whip (0,36 s expo.out, desfoque 18 px), rise (0,45 s), settle (1,12x -> 1x em
         0,4 s) ou corte seco; zoom através do botão 0,5 s power3.in até 9x.
         Linhas: por palavra blur 8 -> 0 em 0,14 s, 0,07 s entre palavras; ou cinza ->
         tinta 0,08 s por palavra; ou a linha inteira 10 -> 0 px. Saída 0,15 s blur.
         Palavra grande: chega a 1,32x com blur 10 px e assenta em 0,22 s expo.out, depois
         parada. Toque: 0,955x e brilho 86% em 0,08 s, volta em 0,14 s, e a tela troca de
         estado no rebote.
SHOTS:   ver storyboard.mjs; o desktop em resumo (tempos antes do encaixe na batida):
         0,0  gancho "Ainda anota o treino no bloco de notas?", risco azul em "no bloco
              de notas?" a 1,4 s (tick)
         2,0  marca: disco gira e assenta, "Anilha" letra a letra, "Monta sua semana. Anota
              cada série." (pop). Promessa inteira na tela antes dos 5 s.
         4,0  Hoje: whip, plano aberto da tela, zoom no cartão "Hoje: costas e bíceps",
              "Abre e já sabe o que treinar."; vai ao "Iniciar treino" e atravessa o botão
         7,5  "Um toque." no azul do botão
         8,5  Treino: séries com carga já preenchida e "antes 50 kg x 12"; desce ao editor,
              toca "Concluir série" (tick), a tela vira descanso 2:00 e esforço; corte para
              o 1:45 grande
         13,5 "Bateu a meta?" / sugestão "Suba para 52,5 kg..." com punch-in na frase
         17,5 Progresso: gráfico e carga máxima
         20,0 "Sua semana." / Plano: semana e fichas, zoom na faixa dos dias
         24,0 Grupo: ranking pela porcentagem do plano, zoom em "acima do plano não conta"
         27,5 "Grátis." / "Funciona sem sinal."
         29,0 final: logo, "Seu treino, num toque.", botão "Comece grátis" é tocado
BANNED:  os padrões de spec.md; mais: endereço do site na tela (decisão do Caio); nome
         real de qualquer pessoa (conta de exemplo "Rafa Souza"); "teste grátis"
         (o app é grátis, não tem teste); tela redesenhada ou número inventado; o
         gradiente antigo do botão (o app usa #0071bd chapado desde a captura de 04/11).
QA:      snapshot --review de cada filme: frame 0 com texto; promessa até 5 s no desktop;
         no vertical, texto e produto entre 168 e 1330 px; telas de largura inteira sem
         corte lateral; o zoom através do botão termina no azul do cartão seguinte.
```

## As três histórias que pesei

1. **Feita (recomendada): "O bloco de notas não conta o descanso".** Gancho na dor (anotar no papel), o app resolve na frente da pessoa, uma tela por promessa, palavras grandes entre elas. Escolhida porque qualquer pessoa de academia se reconhece no primeiro segundo e cada tela prova uma frase.
2. **Uma série inteira em tempo real.** Um plano contínuo de uma série de puxada: abrir, aquecer, concluir, descansar, ver a sugestão subir a carga na semana seguinte. Mais elegante, mas lenta para anúncio e pouco "kinetic".
3. **Contagem regressiva do descanso como relógio do filme.** O 2:00 do descanso conta o vídeo inteiro e cada tela aparece num segundo do relógio. Ousada, mas amarra tudo a um número e esconde o plano e o grupo.
