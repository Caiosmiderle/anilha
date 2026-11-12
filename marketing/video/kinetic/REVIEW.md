# REVIEW: Anilha kinetic, v2 com trilha (04/11/2026, Claude)

## Entregue

| Filme | Formato | Duração | Master (fora do git) |
| --- | --- | --- | --- |
| Anúncio no computador | 1920x1080, 30 fps, H.264 + AAC | 34 s | `marketing/video/out/anilha-kinetic-desktop-16x9.mp4` (7,1 MB) |
| Anúncio no celular | 1080x1920, 30 fps | 22 s | `marketing/video/out/anilha-kinetic-mobile-9x16.mp4` (5,2 MB) |
| Vídeo da landing | 1920x1080, 30 fps | 60 s | `marketing/video/out/anilha-kinetic-landing-16x9.mp4` (12,8 MB); versão web `anilha-kinetic-landing-web.mp4` (3,8 MB) |

Pôsteres em `marketing/video/out/poster-kinetic-*.jpg`.

## Decisões

- História: "o bloco de notas não conta o descanso" (as outras duas estão em `SPEC.md`).
- Telas recapturadas em 04/11/2026: os prints de 20 e 21/10 não tinham o calendário do Histórico, o "antes 50 kg × 12" nas séries, o -15 s do descanso nem o botão primário azul chapado.
- A captura estava quebrada: o relógio falso da captura (26/10) ficou no passado em relação à base de exemplo, gravada na hora real, e a sincronização devolvia o nome real da conta de exemplo. O nome neutro agora é salvo num contexto em hora real antes do relógio (`renameAtRealTime` em `marketing/capture/flow.ts`), e o teste do grupo falha se o primeiro nome real aparecer na tela.
- CTA "Comece grátis" no lugar de "Start your free trial": o Anilha não tem plano pago.
- Sem endereço do site, como o Caio pediu nos vídeos anteriores.

## O que foi medido e o que não foi

- `hyperframes check` no desktop: sem erros. Avisos mantidos de propósito: o cinza do texto riscado do gancho (é o "jeito antigo", contraste 3,3:1) e a cópia do botão usada para o toque (`duplicate_media_discovery_risk`).
- `snapshot --review` dos três e quadros extraídos dos MP4 renderizados: telas inteiras sem corte lateral depois do ajuste de área, promessa na tela aos 2,5 s do desktop, texto do vertical entre 210 e 620 px.
- Trilha: "The Mountain - Hip Hop Sport" (Pixabay, escolhida pelo Caio), 90 BPM, entrando no drop aos 10,785 s do arquivo. Cada cena foi encaixada em batidas inteiras (0,667 s) e o que acontece dentro dela esticou na mesma proporção, por isso as durações mudaram (34 s, 22 s, 60 s). O arquivo original chega a +0,6 dBTP a -9,5 LUFS; no filme fica a 0,5 de volume. Medido nos renders: desktop e celular -14,8 LUFS (pico -3,3 e -4,2 dBTP), landing -15,6 LUFS (-3,7 dBTP), nenhum clipping. Medido, não ouvido.
- A trilha não vai para o git (licença do Pixabay): fica em `music/trilha.mp3`, e o build copia para cada filme. O catálogo do HeyGen não serviu: precisa do programa do HeyGen, que não tem versão para Windows.
- Não checado: tela de celular real, autoplay na landing, desempenho da landing com o vídeo novo.

## Mais fraco e o que eu mudaria

- O plano aberto da tela Hoje (0,45 s) mostra a tela pequena no meio do campo azul; funciona como respiro, mas é o quadro mais "mockup".
- Nas telas que terminam acima da borda (editor do treino), aparece o fim da tela e o chão azul embaixo. Com mais tempo, uma captura em página inteira (`treino-inteiro.png`) para a câmera não encontrar o fim.
- O vídeo da landing tem 60 s e ainda não substitui os vídeos de `public/conheca/media/`: trocar mexe na produção (push na main publica sozinho).
