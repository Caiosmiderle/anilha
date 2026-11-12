#!/bin/bash
# Run from ios after xcodegen. All app inputs are Debug-only fictional fixtures.
set -euo pipefail
out="$GITHUB_WORKSPACE/artifacts/ios-native"
mkdir -p "$out"
device=""
finish() {
  result=$?
  if [[ -n "$device" ]]; then xcrun simctl shutdown "$device" || true; fi
  if [[ $result -ne 0 ]]; then
    echo "::warning::Capturas nativas incompletas. Confira o manifesto e o log do simulador. O archive continua."
  fi
  # Include partial evidence and diagnostics even when a build/launch fails.
  (cd "$out" && zip -qry "$GITHUB_WORKSPACE/Anilha-SwiftUI.zip" .) || true
  exit "$result"
}
trap finish EXIT
exec > >(tee "$out/capture.log") 2>&1

xcodebuild -version
# Apple documents simctl through the installed tool's help. Keep that exact contract.
for command in list boot bootstatus install launch terminate ui io; do
  xcrun simctl help "$command" > "$out/simctl-$command.txt"
done
xcrun simctl list devices available --json > "$out/devices.json"
device=$(python3 - "$out/devices.json" <<'PY'
import json, re, sys
devices = json.load(open(sys.argv[1]))['devices']
choices = []
for runtime, entries in devices.items():
    match = re.search(r'iOS-(\d+(?:-\d+)*)$', runtime)
    if not match:
        continue
    version = tuple(map(int, match.group(1).split('-')))
    if version[0] < 26:
        continue
    for entry in entries:
        name = entry['name']
        if entry.get('isAvailable') and name.startswith('iPhone'):
            model = re.search(r'iPhone (\d+)', name)
            choices.append((version, int(model.group(1)) if model else 0,
                            'Pro Max' in name, name, entry['udid']))
if not choices:
    raise SystemExit('Nenhum iPhone com runtime iOS 26 ou superior disponível')
print(max(choices)[-1])
PY
)
printf 'Simulador selecionado %s\n' "$device"
# The GitHub job owns this runner. Only one booted device makes the screenshot alias unambiguous.
xcrun simctl shutdown all
# Start booting now so the first boot (data migration) overlaps the Debug build.
xcrun simctl boot "$device" || true
xcodebuild build -project Anilha.xcodeproj -scheme Anilha -configuration Debug \
  -destination "platform=iOS Simulator,id=$device" \
  -derivedDataPath "$RUNNER_TEMP/anilha-simulator" \
  CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO \
  > "$out/xcodebuild-simulator.log" 2>&1
# Build 7 saw a first boot end with status -1 after 5 min. Retry once on a freshly erased device.
booted=0
for attempt in 1 2; do
  if xcrun simctl bootstatus "$device" -b; then booted=1; break; fi
  echo "::warning::Simulador não ligou na tentativa $attempt; apagando e tentando de novo"
  xcrun simctl shutdown "$device" || true
  xcrun simctl erase "$device" || true
done
test "$booted" -eq 1
xcrun simctl install "$device" "$RUNNER_TEMP/anilha-simulator/Build/Products/Debug-iphonesimulator/Anilha.app"
# Default: normal text size only. Large text (accessibility3) on demand, before closing a version.
read -r -a sizes <<< "${CAPTURA_TAMANHOS:-large}"
bundle=io.github.caiosmiderle.anilha
printf 'appearance,size,screen,result\n' > "$out/manifest.csv"
failures=0
# The first launch after install is slow (the first print came out blank): warm up once.
xcrun simctl launch "$device" "$bundle" -demo hoje -demo-size large || true
sleep 10
xcrun simctl terminate "$device" "$bundle" || true
for appearance in light dark; do
  xcrun simctl ui "$device" appearance "$appearance"
  for size in "${sizes[@]}"; do
    for screen in ficha-nova ficha-editar entrar hoje plano voce perfil exercicios exercicio fichas ficha treino treino-lista descanso esforco blackjack poker proxima resumo evolucao analise revisao chat historico historico-progresso historico-semanas historico-corpo calendario calendario-dia; do
      xcrun simctl terminate "$device" "$bundle" || true
      if xcrun simctl launch "$device" "$bundle" -demo "$screen" -demo-size "$size"; then
        sleep 3
        if xcrun simctl io booted screenshot "$out/$screen-$appearance-$size.png" && \
           xcrun simctl terminate "$device" "$bundle"; then
          printf '%s,%s,%s,captured\n' "$appearance" "$size" "$screen" >> "$out/manifest.csv"
          continue
        fi
      fi
      printf '%s,%s,%s,failed\n' "$appearance" "$size" "$screen" >> "$out/manifest.csv"
      echo "::warning::Falha na captura $screen $appearance $size"
      failures=$((failures + 1))
    done
  done
done

# The rest card table on the smallest iPhone available (narrow screen check), light and dark.
small=$(python3 - "$out/devices.json" <<'PY'
import json, re, sys
devices = json.load(open(sys.argv[1]))['devices']
choices = []
for runtime, entries in devices.items():
    match = re.search(r'iOS-(\d+)', runtime)
    if not match or int(match.group(1)) < 26:
        continue
    for entry in entries:
        name = entry['name']
        if not entry.get('isAvailable') or not name.startswith('iPhone'):
            continue
        rank = 0 if re.search(r'\b(SE|mini|\d+e)\b', name) else 1 if not re.search(r'Plus|Max|Pro', name) else 2
        choices.append((rank, name, entry['udid']))
print(min(choices)[-1] if choices else '')
PY
)
if [[ -n "$small" && "$small" != "$device" ]]; then
  printf 'Tela pequena %s\n' "$small"
  xcrun simctl shutdown "$device" || true
  if xcrun simctl boot "$small" && xcrun simctl bootstatus "$small" -b; then
    xcrun simctl install "$small" "$RUNNER_TEMP/anilha-simulator/Build/Products/Debug-iphonesimulator/Anilha.app"
    xcrun simctl launch "$small" "$bundle" -demo hoje -demo-size large || true
    sleep 10
    for appearance in light dark; do
      xcrun simctl ui "$small" appearance "$appearance"
      for screen in blackjack poker; do
        xcrun simctl terminate "$small" "$bundle" || true
        if xcrun simctl launch "$small" "$bundle" -demo "$screen" -demo-size large && sleep 3 && \
           xcrun simctl io "$small" screenshot "$out/$screen-$appearance-pequena.png"; then
          printf '%s,pequena,%s,captured\n' "$appearance" "$screen" >> "$out/manifest.csv"
        else
          echo "::warning::Falha na captura pequena $screen $appearance"
        fi
      done
    done
    xcrun simctl shutdown "$small" || true
  else
    echo "::warning::Simulador pequeno não ligou; prints de tela pequena ficam de fora"
  fi
fi
test "$failures" -eq 0
