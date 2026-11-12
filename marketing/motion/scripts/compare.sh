#!/bin/sh
# Lado a lado: a tela do app no vídeo 9:16 (esquerda) e a captura real do app (direita),
# na mesma largura, para comparar cor, fonte e espaçamento.
#   sh scripts/compare.sh out/anilha-9x16-45s.mp4
set -e
mp4="$1"
shots="../../artifacts/screens"
mkdir -p qc/compare
pair() {
  frame="$1"; shot="$2"; name="$3"
  # Moldura no 9:16: x 111, y 600, 858 px de largura (390 px de CSS com zoom 2,2).
  ffmpeg -y -v error -i "$mp4" -vf "select=eq(n\,$frame),crop=858:1298:111:600,scale=780:-1" -vframes 1 "qc/compare/$name-video.png"
  ffmpeg -y -v error -i "$shots/$shot" -vf "crop=780:1180:0:0" "qc/compare/$name-app.png"
  ffmpeg -y -v error -i "qc/compare/$name-video.png" -i "qc/compare/$name-app.png" -filter_complex "[0:v]crop=780:1180:0:0[a];[a][1:v]hstack=inputs=2" "qc/compare/$name.png"
  rm "qc/compare/$name-video.png" "qc/compare/$name-app.png"
  echo "qc/compare/$name.png"
}
pair 1012 186-foguinho-cinza.png hoje
pair 1209 191-foco-serie.png foco
pair 816 06-sessao-descanso.png treino
pair 1856 40-amigos.png amigos
