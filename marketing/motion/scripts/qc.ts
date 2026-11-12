/**
 * Controle de qualidade do vídeo renderizado.
 *
 * 1. Física: o quadro em que a barra toca o chão é o quadro do impacto da trilha.
 * 2. Sincronia: onde cada som marcado (public/audio/anilha-N.cues.json) começa de fato no
 *    áudio do MP4, em milissegundos de diferença.
 * 3. Cores: as cores dominantes da tela do app em cada quadro, comparadas com os tokens do
 *    Harbor (design/harbor-ui). Cor dominante fora do sistema é bug.
 *
 *   npx tsx scripts/qc.ts out/anilha-16x9-45s.mp4 16:9 45
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Duracao, Formato } from '../src/config';
import { BPM, FPS, TAMANHO } from '../src/config';
import { REST_Y } from '../src/physics';
import { UI_SCENES } from '../src/scenes/marks';
import { worldAt } from '../src/three/director';
import { framesPerBeat, impactBeat, spans } from '../src/timeline';
import { biquad } from '../audio/dsp';

const [file = 'out/anilha-16x9-45s.mp4', formato = '16:9', dur = '45'] = process.argv.slice(2);
const f = formato as Formato;
const d = Number(dur) as Duracao;
const all = spans(d, BPM, FPS);
const fpb = framesPerBeat(BPM, FPS);
const report: string[] = [];
const say = (s: string) => {
  report.push(s);
  console.log(s);
};

/* 1. física */
const impactFrame = Math.round(impactBeat(all) * fpb);
const yAt = (fr: number) => worldAt(fr / fpb, all, f, BPM).barY;
const touch = (() => {
  // Contato: até 5 mm do chão (o quique começa no quadro seguinte ao impacto).
  for (let fr = impactFrame - 40; fr <= impactFrame + 2; fr += 1) if (yAt(fr) <= REST_Y + 0.005) return fr;
  return -1;
})();
say(`Física: a barra toca o chão no quadro ${touch}; impacto da trilha no quadro ${impactFrame} (${touch === impactFrame ? 'ok' : 'DIFERENTE'}).`);
say(`  altura no quadro ${impactFrame - 2}: ${yAt(impactFrame - 2).toFixed(3)} m, ${impactFrame - 1}: ${yAt(impactFrame - 1).toFixed(3)} m, ${impactFrame}: ${yAt(impactFrame).toFixed(3)} m`);

/* 2. sincronia */
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], {
  maxBuffer: 1 << 30,
});
// Ataques são de banda larga; o grave (boom, subgrave, drone) oscila em janelas curtas e
// confundiria a detecção, então ela olha acima de 300 Hz.
const audio = biquad(Float32Array.from(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4)), 'hp', 300, 0.7);
const SR = 48000;
const hop = 96; // 2 ms
const energy: number[] = [];
for (let i = 0; i + hop <= audio.length; i += hop) {
  let e = 0;
  for (let k = i; k < i + hop; k += 1) e += (audio[k] as number) ** 2;
  energy.push(10 * Math.log10(e / hop + 1e-10));
}
const cues = JSON.parse(readFileSync(`public/audio/anilha-${d}.cues.json`, 'utf8')) as { beat: number; what: string; seg: number; quadro: number }[];
let worst = 0;
for (const c of cues) {
  const center = Math.round((c.seg * SR) / hop);
  let best = 0;
  let bestAt = center;
  for (let k = center - 20; k <= center + 20; k += 1) {
    // Subida contra a média dos 16 ms anteriores: a cauda do reverb oscila e enganava.
    let base = 0;
    for (let j = k - 9; j <= k - 2; j += 1) base += energy[j] ?? -100;
    const rise = (energy[k + 1] ?? -100) - base / 8;
    if (rise > best) {
      best = rise;
      bestAt = k;
    }
  }
  const off = ((bestAt - center) * hop * 1000) / SR;
  worst = Math.max(worst, Math.abs(off));
  say(`  ${c.what.padEnd(26)} quadro ${String(c.quadro).padStart(4)}  ${c.seg.toFixed(3)} s  ataque ${off >= 0 ? '+' : ''}${off.toFixed(0)} ms  (+${best.toFixed(1)} dB)`);
}
say(`Sincronia: maior desvio entre o som e o quadro marcado: ${worst.toFixed(0)} ms (um quadro a 60 fps = 16,7 ms).`);

/* 3. cores */
function tokens(): Map<string, [number, number, number]> {
  const css = readFileSync('../../design/harbor-ui/tokens.css', 'utf8') + readFileSync('../../design/harbor-ui/extensions.css', 'utf8').split('@media')[0];
  const out = new Map<string, [number, number, number]>();
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*#([0-9a-f]{6})\b/gi)) {
    const h = m[2] as string;
    if (!out.has(m[1] as string)) out.set(m[1] as string, [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
  }
  // color-mix do extensions.css: ink-muted 80% com ink-strong.
  const im = out.get('--ink-muted') as [number, number, number];
  const is = out.get('--ink-strong') as [number, number, number];
  out.set('--ink-muted-aa', [0, 1, 2].map((i) => Math.round(im[i]! * 0.8 + is[i]! * 0.2)) as [number, number, number]);
  return out;
}
const T = tokens();
const { width: W, height: H } = TAMANHO[f];
const ph = f === '9:16' ? { x: (1080 - 390 * 2.2) / 2, y: 600, w: 390 * 2.2, h: 590 * 2.2 } : { x: 1200, y: (1080 - 844 * 1.1) / 2, w: 390 * 1.1, h: 844 * 1.1 };
const frames = all
  .filter((s) => UI_SCENES.includes(s.id))
  .map((s) => ({ id: s.id, frame: s.from + Math.round((s.beats - 1) * fpb) }));
let offenders = 0;
for (const { id, frame } of frames) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame})`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  const counts = new Map<string, number>();
  let n = 0;
  for (let y = Math.ceil(ph.y + 30); y < Math.min(H, ph.y + ph.h - 30); y += 1) {
    for (let x = Math.ceil(ph.x + 30); x < ph.x + ph.w - 30; x += 1) {
      const i = (y * W + x) * 3;
      // Grade de 4: o H.264 mexe 1 ou 2 unidades na cor.
      const key = [raw[i]!, raw[i + 1]!, raw[i + 2]!].map((v) => Math.round(v / 4) * 4).join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
      n += 1;
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).filter(([, c]) => c / n > 0.004).slice(0, 14);
  const rows = top.map(([key, c]) => {
    const rgb = key.split(',').map(Number) as [number, number, number];
    let best = '';
    let dist = Infinity;
    for (const [name, t] of T) {
      const dd = Math.hypot(rgb[0] - t[0], rgb[1] - t[1], rgb[2] - t[2]);
      if (dd < dist) {
        dist = dd;
        best = name;
      }
    }
    // Cores que o próprio CSS do app deriva dos tokens: o meio do gradiente do botão
    // primário (brand-300 para brand-500) e a pílula da aba ativa (ink a 7% sobre o branco).
    if (dist > 7) {
      const a3 = T.get('--brand-300')!;
      const a5 = T.get('--brand-500')!;
      const seg = [0, 1, 2].map((i) => a5[i]! - a3[i]!);
      const len2 = seg.reduce((x, v) => x + v * v, 0);
      const tt = Math.max(0, Math.min(1, [0, 1, 2].reduce((x, i) => x + (rgb[i]! - a3[i]!) * seg[i]!, 0) / len2));
      const dg = Math.hypot(...[0, 1, 2].map((i) => rgb[i]! - (a3[i]! + seg[i]! * tt)));
      const ink = T.get('--ink')!;
      const sf = T.get('--bg-surface')!;
      const pill = [0, 1, 2].map((i) => ink[i]! * 0.07 + sf[i]! * 0.93);
      const dp = Math.hypot(...[0, 1, 2].map((i) => rgb[i]! - pill[i]!));
      if (dg <= 7) {
        best = 'gradiente brand-300 a brand-500 (botão primário)';
        dist = dg;
      } else if (dp <= 7) {
        best = 'pílula da aba (ink 7% sobre bg-surface, app.css)';
        dist = dp;
      }
    }
    const ok = dist <= 7;
    if (!ok) offenders += 1;
    return `    ${ok ? 'ok ' : 'FORA'} rgb(${key}) ${((c / n) * 100).toFixed(1)}%  ${best} a ${dist.toFixed(1)}`;
  });
  say(`Cores da tela "${id}" (quadro ${frame}):`);
  rows.forEach(say);
}
say(`Cores: ${offenders} cor(es) dominante(s) longe de um token do Harbor.`);
writeFileSync(file.replace(/\.mp4$/, '.qc.txt'), report.join('\n') + '\n');
