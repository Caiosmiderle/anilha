# Anilha: do ferro bruto à precisão digital

O ferro é pesado; o registro não precisa ser. O vídeo abre como foto de produto, num
estúdio claro: anilhas de ferro pintado com borda torneada e "20 KG" em relevo gasto até o
metal, luz de janela e de softbox, sombra de contato e foco de lente que puxa até as letras.
A anilha sai do chão e deixa o quadro (quem levanta fica fora da imagem); sobra o chão com a
sombra. Ela volta caindo, e a onda de choque abre um círculo do fundo do Harbor; o "20" vira
o "20 kg" que pousa no campo Carga.
Daí em diante o 3D fica atrás, desfocado e pesado, segurando os dados; a barra sobe ao fundo
e o topo da subida aperta "Série feita". No fim, a anilha encara a câmera, a face vira o
azul da marca, o aro vira o anel do logo e se abre o vão do descanso planejado.

Mundo físico: ferro pintado num estúdio claro, com N8AO, profundidade de campo e sombras de
contato (drei e @react-three/postprocessing). Cores dentro da paleta do Harbor (`--ink` na
tinta, `--ink-muted` no metal gasto, `--bg-warm` no estúdio antes do impacto, `--bg-page`
depois, `--line-strong` no aço e `--brand-500` na onda de choque). Interface: o Harbor do app, importado de
`src/styles/app.css` e dos componentes de `src/ui`.

## Master de 45 s (128 BPM, 96 tempos, 60 fps; 1 tempo = 28,125 quadros)

| Tempos | Segundos | Cena | Imagem | Som |
| --- | --- | --- | --- | --- |
| 0-8 | 0-3,75 | Ferro | A anilha no eixo da barra; o foco puxa do fundo até o "20 KG"; "O ferro é pesado." | Coração a cada 2 tempos, inspira e solta, ferro em cada palavra |
| 8-16 | 3,75-7,5 | Carga | Câmera rente ao chão ao longo da barra, foco passando da anilha perto à longe; "Carga. Repetição. Descanso." | Coração a cada tempo, três ferros descendo |
| 16-24 | 7,5-11,25 | Puxada | Close rente ao chão: a anilha sai do piso e do quadro; sobra a sombra; "O registro não precisa ser."; ela volta caindo | Coração em colcheias, fôlego preso, riser, vácuo, assobio da queda |
| 24 | 11,25 | Impacto | Dolly zoom, tremor, poeira, anel `brand-500` no chão e na tela | Impacto, subgrave, o anel do ferro desliza até o sino do app |
| 24-32 | 11,25-15 | Número | "20 kg × 8" bate e voa para os campos Carga e Repetições; Concluir série; descanso | Sino no "20", trava digital no pouso, toque |
| 32-40 | 15-18,75 | Hoje | Treino sugerido, foguinho cinza; toque em Iniciar treino | Groove entra inteiro |
| 40-48 | 18,75-22,5 | Série | Modo foco "22,5 kg × 8"; a barra sobe ao fundo e aperta Série feita | Sino do app no topo da subida |
| 48-56 | 22,5-26,25 | Constância | Foguinho acende (29), Semana cumprida 3 de 3 | Respiro e duas notas do sino |
| 56-64 | 26,25-30 | Recorde | "Recorde: supino reto com barra, 22,5 kg" | Arpejo do sino e um ferro grave |
| 64-72 | 30-33,75 | Amigos | Bruno 25%, toque em "Boa", ranking da turma | Toque e duas notas |
| 72-80 | 33,75-37,5 | Marca | A anilha gira e trava; a face vira azul, o aro vira o anel com o vão | Ferro trava, metal vira sino |
| 80-92 | 37,5-43,1 | Instalar | Passos da landing (Safari, Compartilhar, Adicionar à Tela de Início); o ícone cai | Toques e um clique metálico pequeno |
| 92-96 | 43,1-45 | Fim | Logo, "Anilha", "Adicione à Tela de Início." | Acorde final e cauda |

Os cortes de 30 s e 15 s estão em `src/timeline.ts` (impacto no tempo 16 e no tempo 6).

## Como gerar

```
npm install
npx tsx audio/synth.ts
npx remotion render src/index.ts Anilha-16x9-45s out/anilha-16x9-45s.mp4
npx remotion render src/index.ts Anilha-9x16-45s out/anilha-9x16-45s.mp4
npx remotion render src/index.ts Anilha-9x16-15s out/anilha-9x16-15s.mp4
npx tsx scripts/stills.ts Anilha-16x9-45s 112 675 787
```
