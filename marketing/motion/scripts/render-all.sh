#!/bin/sh
# Os três vídeos que vão para o ar, em sequência.
set -e
for id in Anilha-16x9-45s Anilha-9x16-45s Anilha-9x16-15s; do
  out="out/$(echo "$id" | tr 'A-Z' 'a-z').mp4"
  npx remotion render src/index.ts "$id" "$out" --gl=angle --concurrency=4 --log=error 2>&1 | grep -v "X4122\|double precision\|PCFSoft\|THREE.Clock" || true
  echo "pronto: $out"
done
