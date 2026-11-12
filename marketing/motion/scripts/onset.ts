/** Energia acima de 300 Hz em janelas de 4 ms em volta de um instante (diagnóstico). */
import { readFileSync } from 'node:fs';
import { biquad } from '../audio/dsp';
const [file, ...times] = process.argv.slice(2);
const b = readFileSync(file as string);
const n = (b.length - 44) / 6;
const x = new Float32Array(n);
for (let i = 0; i < n; i += 1) x[i] = (b.readIntLE(44 + i * 6, 3) + b.readIntLE(47 + i * 6, 3)) / 2 / 8388607;
biquad(x, 'hp', 300, 0.7);
for (const t of times.map(Number)) {
  const row: string[] = [];
  for (let ms = -48; ms <= 48; ms += 4) {
    const i0 = Math.round((t + ms / 1000) * 48000);
    let e = 0;
    for (let k = 0; k < 192; k += 1) e += (x[i0 + k] ?? 0) ** 2;
    row.push(`${ms}:${(10 * Math.log10(e / 192 + 1e-12)).toFixed(0)}`);
  }
  console.log(t, row.join(' '));
}
