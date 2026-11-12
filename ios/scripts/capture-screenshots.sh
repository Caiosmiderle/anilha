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
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcodebuild build -project Anilha.xcodeproj -scheme Anilha -configuration Debug \
  -destination "platform=iOS Simulator,id=$device" \
  -derivedDataPath "$RUNNER_TEMP/anilha-simulator" \
  CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO \
  > "$out/xcodebuild-simulator.log" 2>&1
xcrun simctl install "$device" "$RUNNER_TEMP/anilha-simulator/Build/Products/Debug-iphonesimulator/Anilha.app"
bundle=io.github.caiosmiderle.anilha
printf 'appearance,size,screen,result\n' > "$out/manifest.csv"
failures=0
for appearance in light dark; do
  xcrun simctl ui "$device" appearance "$appearance"
  for size in large accessibility3; do
    for screen in entrar hoje fichas ficha treino treino-lista descanso esforco blackjack poker proxima resumo evolucao analise historico; do
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
test "$failures" -eq 0
