#!/bin/sh
# Quadros-chave tirados do MP4 final (não do Studio): sh scripts/frames.sh out/x.mp4 qc/final-x 112 675 ...
set -e
mp4="$1"; dir="$2"; shift 2
rm -rf "$dir"; mkdir -p "$dir"
for f in "$@"; do
  ffmpeg -y -v error -i "$mp4" -vf "select=eq(n\,$f)" -vframes 1 "$dir/$(printf %04d "$f").png"
done
