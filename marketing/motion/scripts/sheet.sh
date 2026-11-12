#!/bin/sh
# Folha de contato: todos os PNG de uma pasta, em grade, numa imagem só.
# sh scripts/sheet.sh qc/Anilha-16x9-45s qc/sheet.png 3 640
dir="$1"; out="$2"; cols="${3:-3}"; w="${4:-640}"
list=$(mktemp)
for f in "$dir"/*.png; do printf "file '%s'\n" "$(cd "$(dirname "$f")" && pwd -W)/$(basename "$f")" >> "$list"; done
n=$(wc -l < "$list")
rows=$(( (n + cols - 1) / cols ))
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -vf "scale=$w:-1,tile=${cols}x${rows}:padding=6:color=white" -frames:v 1 "$out"
rm "$list"
