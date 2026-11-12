/**
 * Trilha e desenho de som do vídeo, 100% sintetizados aqui, offline. Lê a mesma grade do
 * vídeo (src/timeline.ts) e a mesma tabela de ações (src/scenes/marks.ts): cada impacto,
 * toque e troca de tela cai no tempo exato da imagem. Saída: public/audio/anilha-{15,30,45}.wav,
 * 48 kHz, 24 bits, normalizado para -14 LUFS com pico real abaixo de -1 dBTP.
 *
 *   npx tsx audio/synth.ts          (as três durações)
 *   npx tsx audio/synth.ts 45
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { BPM, type Duracao } from '../src/config';
import { marksFor } from '../src/scenes/marks';
import { FALL_S as FALL_S_FOR_AUDIO, liftMarks } from '../src/physics';
import { impactBeat, spans, totalBeats, type Span } from '../src/timeline';
import {
  biquad, buf, env, limit, lufs, noise, reverb, rng, saw, sine, SR, Stereo, svf, truePeak, writeWav24,
} from './dsp';

const BEAT = 60 / BPM;
const T = (b: number) => b * BEAT;

/* ------------------------------------------------------------------ instrumentos */

/** Coração: "tum-tá", grave e abafado. */
function heart() {
  const b = buf(0.5);
  const lub = sine(0.5, (t) => 48 + 26 * Math.exp(-t / 0.04));
  const dub = sine(0.5, (t) => 55 + 28 * Math.exp(-t / 0.035));
  for (let i = 0; i < b.length; i += 1) {
    const t = i / SR;
    const a = Math.min(1, t / 0.004) * Math.exp(-t / 0.085);
    const t2 = t - 0.16;
    const a2 = t2 < 0 ? 0 : Math.min(1, t2 / 0.004) * Math.exp(-t2 / 0.065) * 0.62;
    b[i] = (lub[i] as number) * a + (t2 < 0 ? 0 : (dub[i - Math.round(0.16 * SR)] ?? 0) * a2);
  }
  return biquad(b, 'lp', 160);
}

function kick() {
  const b = sine(0.45, (t) => 44 + 118 * Math.exp(-t / 0.028));
  env(b, 0.001, 0.26);
  const click = env(biquad(noise(0.006, 3), 'hp', 3000), 0.0003, 0.0015);
  for (let i = 0; i < click.length; i += 1) b[i] = (b[i] as number) + (click[i] as number) * 0.25;
  return b;
}

function hat(open: boolean, seed: number) {
  const b = biquad(noise(open ? 0.2 : 0.06, seed), 'hp', 8200, 0.8);
  return env(b, 0.0005, open ? 0.055 : 0.011);
}

/** Caixa digital: ruído na banda de 1,9 kHz e um corpo curto. */
function snare(seed: number) {
  const n = env(biquad(biquad(noise(0.25, seed), 'bp', 1900, 0.7), 'hp', 380), 0.001, 0.065);
  const body = env(sine(0.25, (t) => 205 - 30 * t), 0.001, 0.045);
  for (let i = 0; i < n.length; i += 1) n[i] = (n[i] as number) * 1.4 + (body[i] as number) * 0.45;
  return n;
}

/** Ferro: modos de uma placa circular grossa, inarmônicos, com o golpe na frente. */
const METAL = [1, 1.594, 2.136, 2.296, 2.653, 3.156, 3.652, 4.06, 4.6, 5.2];
function metal(f0: number, decay: number, seed: number) {
  const r = rng(seed);
  const len = Math.min(6, decay * 4.5);
  const b = buf(len);
  METAL.forEach((ratio, i) => {
    const f = f0 * ratio * (1 + r() * 0.004);
    const amp = 1 / (1 + 0.55 * i);
    const tau = decay / (1 + 0.35 * i);
    const ph = r() * Math.PI;
    for (let k = 0; k < b.length; k += 1) {
      const t = k / SR;
      b[k] = (b[k] as number) + Math.sin(ph + 2 * Math.PI * f * t) * amp * Math.exp(-t / tau) * Math.min(1, t / 0.0008);
    }
  });
  const strike = env(biquad(noise(0.02, seed + 9), 'bp', Math.min(9000, f0 * 12), 0.9), 0.0002, 0.004);
  for (let i = 0; i < strike.length; i += 1) b[i] = (b[i] as number) * 0.32 + (strike[i] as number) * 0.9;
  for (let i = strike.length; i < b.length; i += 1) b[i] = (b[i] as number) * 0.32;
  return b;
}

function thud(seed: number) {
  const b = env(biquad(noise(0.45, seed), 'lp', 140), 0.001, 0.11);
  const s = env(sine(0.45, (t) => 58 - 12 * t), 0.001, 0.18);
  for (let i = 0; i < b.length; i += 1) b[i] = (b[i] as number) * 2.2 + (s[i] as number) * 0.8;
  return b;
}

/** Respiração: ruído numa banda que sobe (puxa o ar) ou desce (solta). */
function breath(sec: number, inhale: boolean, seed: number, low = 1) {
  const b = noise(sec, seed);
  const n = b.length;
  svf(b, (i) => {
    const p = i / n;
    return (inhale ? 650 + 1100 * p : 1500 - 950 * p) * low;
  }, 1.1, 'bp');
  biquad(b, 'lp', 3200);
  for (let i = 0; i < n; i += 1) {
    const p = i / n;
    b[i] = (b[i] as number) * Math.sin(Math.PI * p) ** (inhale ? 1.2 : 0.8);
  }
  return b;
}

/** Passada curta com ataque definido: a troca de tela começa no quadro do som. */
function swish(sec: number, from: number, to: number, seed: number) {
  const b = noise(sec, seed);
  const n = b.length;
  svf(b, (i) => from * (to / from) ** (i / n), 1.4, 'bp');
  return env(b, 0.006, sec / 4);
}

function whoosh(sec: number, from: number, to: number, seed: number, q = 1.6) {
  const b = noise(sec, seed);
  const n = b.length;
  svf(b, (i) => from * (to / from) ** (i / n), q, 'bp');
  for (let i = 0; i < n; i += 1) {
    const p = i / n;
    b[i] = (b[i] as number) * Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 1.5;
  }
  return b;
}

/** Subida de tensão antes do impacto: ruído que abre e sobe. */
function riser(sec: number, seed: number) {
  const b = noise(sec, seed);
  const n = b.length;
  svf(b, (i) => 220 * (6000 / 220) ** ((i / n) ** 1.6), 3, 'bp');
  for (let i = 0; i < n; i += 1) b[i] = (b[i] as number) * (i / n) ** 2.2;
  return b;
}

/** Drone do galpão: serras graves em Ré, fechadas num filtro que respira. */
function drone(sec: number) {
  const voices = [36.71, 73.42, 73.42 * 1.004, 110, 110 * 0.997];
  const b = buf(sec);
  voices.forEach((f, i) => {
    const s = saw(sec, () => f, i * 0.21);
    for (let k = 0; k < b.length; k += 1) b[k] = (b[k] as number) + (s[k] as number) * (i === 0 ? 0.7 : 0.35);
  });
  svf(b, (i) => 160 + 90 * Math.sin((2 * Math.PI * i) / SR / (BEAT * 8)) + 260 * (i / b.length), 0.9, 'lp');
  const n = b.length;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    b[i] = (b[i] as number) * Math.min(1, t / 2.5) * Math.min(1, (sec - t) / 0.08);
  }
  return b;
}

/** Ferro "cantando": parciais do metal com vibrato lento, muito baixo. */
function shimmer(sec: number) {
  const b = buf(sec);
  const r = rng(77);
  [1, 2.136, 3.156, 4.6].forEach((ratio, i) => {
    const f = 196 * ratio;
    const ph = r() * 6;
    for (let k = 0; k < b.length; k += 1) {
      const t = k / SR;
      b[k] = (b[k] as number) + Math.sin(2 * Math.PI * f * t + ph) * (0.5 + 0.5 * Math.sin(t * (0.7 + i * 0.31) + ph)) / (1 + i);
    }
  });
  for (let k = 0; k < b.length; k += 1) {
    const t = k / SR;
    b[k] = (b[k] as number) * Math.min(1, t / 3) * Math.min(1, (sec - t) / 0.08);
  }
  return b;
}

/**
 * O metal vira digital: as parciais inarmônicas do anel do ferro deslizam até as notas do
 * sino do app (880 e 1175 Hz e oitavas), a aspereza some e sobra seno puro.
 */
const CHIME = [880, 1175, 1760, 2349.3];
function morph(sec: number, seed: number) {
  const r = rng(seed);
  const b = buf(sec + 0.4);
  const start = [196, 196 * 2.136, 196 * 3.156, 196 * 4.6];
  start.forEach((f0, i) => {
    const f1 = CHIME[i] as number;
    let ph = r() * 6;
    for (let k = 0; k < b.length; k += 1) {
      const t = k / SR;
      const p = Math.min(1, t / sec);
      const glide = p * p * (3 - 2 * p);
      const f = f0 * (f1 / f0) ** glide;
      ph += (2 * Math.PI * f) / SR;
      const rough = 1 - (1 - p) * 0.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (31 + i * 7) * t));
      const amp = (1 / (1 + i * 0.8)) * Math.min(1, t / 0.005) * (t < sec ? 0.55 + 0.45 * p : Math.exp(-(t - sec) / 0.09));
      b[k] = (b[k] as number) + Math.sin(ph) * amp * rough;
    }
  });
  return b;
}

/** O sino do fim do descanso do app (src/lib/device.ts): 880 e 1175 Hz, 180 ms entre eles. */
function chime() {
  const b = buf(0.4);
  [880, 1175].forEach((f, n) => {
    const off = n * 0.18;
    for (let k = 0; k < b.length; k += 1) {
      const t = k / SR - off;
      if (t < 0 || t > 0.18) continue;
      const g = t < 0.02 ? 0.0001 * (0.25 / 0.0001) ** (t / 0.02) : 0.25 * (0.0001 / 0.25) ** ((t - 0.02) / 0.14);
      b[k] = (b[k] as number) + Math.sin(2 * Math.PI * f * t) * g * 4;
    }
  });
  return b;
}

/** Toque na tela: um clique curto e um corpo pequeno. */
function tap(seed: number) {
  const b = env(sine(0.08, (t) => 1500 + 900 * Math.exp(-t / 0.006)), 0.0005, 0.012);
  const body = env(sine(0.08, (t) => 180 + 120 * Math.exp(-t / 0.01)), 0.0005, 0.02);
  const tick = env(biquad(noise(0.01, seed), 'hp', 5000), 0.0002, 0.0012);
  for (let i = 0; i < b.length; i += 1) b[i] = (b[i] as number) * 0.6 + (body[i] as number) * 0.5 + (tick[i] ?? 0) * 0.3;
  return b;
}

function blip(f: number, decay = 0.07) {
  const b = sine(decay * 5, () => f);
  const h = sine(decay * 5, () => f * 2);
  for (let i = 0; i < b.length; i += 1) b[i] = (b[i] as number) + (h[i] as number) * 0.12;
  return env(b, 0.003, decay);
}

function pluck(f: number, seed: number) {
  const b = saw(0.5, () => f, (seed % 7) / 7);
  svf(b, (i) => 600 + 5200 * Math.exp(-i / SR / 0.06), 1.3, 'lp');
  return env(b, 0.002, 0.14);
}

function pad(freqs: number[], sec: number) {
  const b = buf(sec);
  freqs.forEach((f, i) => {
    for (const d of [-0.004, 0, 0.0045]) {
      const s = saw(sec, () => f * (1 + d), (i * 0.37 + d * 50) % 1);
      for (let k = 0; k < b.length; k += 1) b[k] = (b[k] as number) + (s[k] as number) / 3;
    }
  });
  svf(b, (i) => 700 + 500 * Math.min(1, i / SR / (sec * 0.6)), 0.8, 'lp');
  for (let k = 0; k < b.length; k += 1) {
    const t = k / SR;
    b[k] = (b[k] as number) * Math.min(1, t / 0.5) * Math.min(1, (sec - t) / 0.6);
  }
  return b;
}

function subNote(f: number, sec: number) {
  const b = sine(sec, () => f);
  for (let k = 0; k < b.length; k += 1) {
    const t = k / SR;
    b[k] = (b[k] as number) * Math.min(1, t / 0.006) * Math.min(1, (sec - t) / 0.03);
  }
  return b;
}

/* ------------------------------------------------------------------ arranjo */

const CHORDS = [
  { root: 73.42, notes: [146.83, 185, 220, 293.66] }, // Ré
  { root: 61.74, notes: [123.47, 146.83, 185, 246.94] }, // Si menor
  { root: 49.0, notes: [98, 123.47, 146.83, 196] }, // Sol
  { root: 55.0, notes: [110, 138.59, 164.81, 220] }, // Lá
];

export interface Cue {
  beat: number;
  what: string;
}

export function render(duracao: Duracao) {
  const all = spans(duracao, BPM, 60);
  const beats = totalBeats(duracao);
  const len = Math.round(T(beats) * SR);
  const fx = new Stereo(len); // impactos, ferro e interface
  const music = new Stereo(len); // pad, baixo e arpejo (com ducking do bumbo)
  const drums = new Stereo(len);
  const send = new Stereo(len); // reverb
  const cues: Cue[] = [];
  const impact = impactBeat(all);
  const span = (id: Span['id']) => all.find((s) => s.id === id);
  let seed = 1;
  const S = () => (seed += 1);
  const hit = (b: number, sig: Float32Array, gain: number, pan = 0, verb = 0) => {
    fx.add(T(b), sig, gain, pan);
    if (verb) send.add(T(b), sig, gain * verb, pan);
  };
  const cue = (beat: number, what: string) => cues.push({ beat, what });

  // Ato 1: drone e ferro cantando até o vácuo antes do impacto.
  const pull = span('puxada') as Span;
  const releaseBeat = pull.startBeat + pull.beats - FALL_S_FOR_AUDIO / BEAT;
  const darkEnd = releaseBeat + 0.05;
  hit(0, drone(T(darkEnd)), 0.15, 0, 0.12);
  hit(0, shimmer(T(darkEnd)), 0.035, 0, 0.6);

  for (const s of all) {
    const m = marksFor(s.id, s.beats);
    const at = (b: number) => s.startBeat + b;
    const words = m.words ?? [];
    switch (s.id) {
      case 'escuro': {
        // O refletor acende.
        hit(at(0), metal(52, 0.5, S()), 0.5, 0, 0.4);
        hit(at(0), thud(S()), 0.6);
        cue(at(0), 'refletor');
        for (let b = 0; b < s.beats; b += 2) hit(at(b), heart(), 1.35);
        hit(at(0.8), breath(T(1.9), true, S()), 0.22, -0.2);
        if (s.beats >= 8) hit(at(3.4), breath(T(1.7), false, S()), 0.26, 0.15);
        const pitch = [330, 247];
        words.forEach((w, i) => {
          hit(at(w), metal(pitch[i] ?? 247, 0.9, S()), 0.42, i ? 0.25 : -0.25, 0.5);
          cue(at(w), 'palavra');
        });
        break;
      }
      case 'carga': {
        hit(at(0), metal(73, 1.1, S()), 0.5, 0, 0.4);
        for (let b = 0; b < s.beats; b += 1) hit(at(b), heart(), 1.35);
        [294, 262, 220].forEach((f, i) => {
          const w = words[i] ?? 0;
          hit(at(w), metal(f, 0.8, S()), 0.4, -0.3 + i * 0.3, 0.45);
          cue(at(w), 'palavra');
        });
        hit(at(4.4), breath(T(1.6), true, S()), 0.24, -0.2);
        hit(at(6.2), breath(T(1.5), false, S()), 0.28, 0.2);
        break;
      }
      case 'puxada': {
        const n = s.beats;
        const { start, lock } = liftMarks(n);
        const release = releaseBeat - s.startBeat;
        // Coração acelera: tempos, depois colcheias, mais forte perto do topo.
        for (let b = 0; b < release - 0.2; b += b < lock - 1 ? 1 : 0.5) {
          hit(at(b), heart(), 1.2 + 0.5 * (b / n));
        }
        hit(at(0), metal(98, 0.9, S()), 0.45, 0, 0.35);
        // As anilhas saem do chão, a barra sobe com o fôlego preso e trava no quadril.
        hit(at(start), metal(180, 0.5, S()), 0.38, -0.5, 0.3);
        hit(at(start), metal(196, 0.5, S()), 0.36, 0.5, 0.3);
        cue(at(start), 'barra sai do chão');
        hit(at(start - 0.9), breath(T(0.9), true, S()), 0.3, 0);
        hit(at(start + 0.2), whoosh(T(lock - start), 90, 420, S(), 0.9), 0.22);
        hit(at(start + 0.3), breath(T(lock - start - 0.3), false, S(), 0.55), 0.2);
        hit(at(lock), metal(140, 0.6, S()), 0.4, 0, 0.3);
        hit(at(lock), breath(T(1.1), false, S(), 0.8), 0.32, 0.1);
        cue(at(lock), 'trava no quadril');
        hit(at(n - 3.5), riser(T(3.5 - (n - release)), S()), 0.32, 0, 0.3);
        words.forEach((w) => {
          hit(at(w), blip(1320, 0.03), 0.09, 0.3, 0.6);
          hit(at(w), metal(520, 0.25, S()), 0.18, -0.2, 0.4);
        });
        // A queda: as mãos com magnésio soltam a barra (estalo seco) e o assobio da descida.
        hit(at(release), env(biquad(noise(0.06, S()), 'bp', 2400, 0.8), 0.0004, 0.012), 0.5, 0, 0.3);
        hit(at(release), whoosh(T(n - release), 1800, 160, S(), 2.2), 0.32);
        cue(at(release), 'soltou');
        break;
      }
      case 'numero': {
        // O impacto e o anel do ferro virando o sino do app.
        const b0 = at(0);
        hit(b0, env(sine(1.6, (t) => 26 + 36 * Math.exp(-t / 0.18)), 0.002, 0.62), 1.7);
        hit(b0, thud(S()), 1.5);
        hit(b0, env(biquad(noise(0.08, S()), 'hp', 1800), 0.0003, 0.028), 0.75, 0, 0.6);
        hit(b0, metal(92, 1.9, S()), 0.95, -0.35, 0.7);
        hit(b0, metal(147, 1.4, S()), 0.8, 0.35, 0.7);
        const r = rng(S());
        for (let k = 0; k < 14; k += 1) {
          const dt = 0.05 + Math.abs(r()) * 0.6;
          hit(b0 + dt / BEAT, metal(700 + Math.abs(r()) * 1600, 0.05, S()), 0.07 * (1 - dt), r());
        }
        cue(b0, 'IMPACTO');
        const w = words.length ? words : [1, 1.5, 2];
        // O anel do ferro começa 0,15 s depois da pancada e chega ao sino no "20".
        hit(b0 + 0.15 / BEAT, morph(T(w[0] ?? 1) - 0.15, S()), 0.2, 0, 0.8);
        // "20" bate no sino do app; "kg" e "× 8" são toques digitais.
        // O sino do app sobe em 20 ms (rampa exponencial): começa um quadro antes para o pico
        // cair no quadro do "20".
        hit(at(w[0] ?? 1) - 0.016 / BEAT, chime(), 0.55, 0, 0.5);
        hit(at(w[0] ?? 1), kick(), 0.7);
        hit(at(w[1] ?? 1.5), blip(1760, 0.04), 0.16, -0.3, 0.4);
        hit(at(w[2] ?? 2), blip(1175, 0.06), 0.22, 0.3, 0.4);
        hit(at(w[2] ?? 2), kick(), 0.55);
        cue(at(w[0] ?? 1), '20');
        cue(at(w[2] ?? 2), '× 8');
        const phoneIn = m.phoneIn ?? 3;
        // A tela entra em um tempo exato e trava no tempo seguinte, junto com os números.
        hit(at(phoneIn), swish(T(1), 500, 2600, S()), 0.7, 0.4);
        cue(at(phoneIn), 'tela entra');
        // Os números caem nos campos: trava digital.
        hit(at(m.land ?? 4), tap(S()), 0.5);
        hit(at(m.land ?? 4), blip(1760, 0.05), 0.18, 0, 0.4);
        cue(at(m.land ?? 4), 'números nos campos');
        hit(at(m.tap ?? 6), tap(S()), 0.55);
        hit(at(m.tap ?? 6), blip(1175, 0.05), 0.2, -0.2, 0.3);
        hit(at(m.tap ?? 6) + 0.12 / BEAT, blip(1760, 0.06), 0.18, 0.2, 0.3);
        cue(at(m.tap ?? 6), 'Concluir série');
        break;
      }
      case 'hoje':
      case 'serie':
      case 'constancia':
      case 'recorde':
      case 'amigos': {
        // Troca de tela: uma tela empurra a outra.
        hit(at(0), swish(T(0.9), 900, 3200, S()), 0.22, 0.3);
        cue(at(0), 'troca de tela');
        if (s.id === 'hoje' || s.id === 'amigos') {
          const t = m.tap ?? 3;
          hit(at(t), tap(S()), 0.55);
          hit(at(t), blip(s.id === 'amigos' ? 1480 : 1175, 0.05), 0.2, 0, 0.3);
          if (s.id === 'amigos') hit(at(t) + 0.09 / BEAT, blip(1760, 0.06), 0.18, 0.2, 0.3);
          cue(at(t), s.id === 'hoje' ? 'Iniciar treino' : 'Boa');
        }
        if (s.id === 'serie') {
          const t = m.tap ?? 5;
          // A barra sobe ao fundo e o topo da subida aperta Série feita: o sino do app.
          hit(at(t - 2), whoosh(T(2), 120, 520, S(), 0.9), 0.14);
          hit(at(t), tap(S()), 0.5);
          hit(at(t), chime(), 0.6, 0, 0.5);
          hit(at(t), metal(196, 0.3, S()), 0.12, 0, 0.3);
          cue(at(t), 'Série feita');
        }
        if (s.id === 'constancia') {
          const t = m.reveal ?? 1;
          const swell = biquad(noise(0.5, S()), 'lp', 900);
          for (let i = 0; i < swell.length; i += 1) swell[i] = (swell[i] as number) * Math.sin((Math.PI * i) / swell.length) ** 2;
          hit(at(t) - 0.2 / BEAT, swell, 0.3);
          hit(at(t), blip(880, 0.08), 0.22, -0.2, 0.5);
          hit(at(t) + 0.117 / BEAT, blip(1175, 0.1), 0.22, 0.2, 0.5);
          cue(at(t), 'foguinho acende');
        }
        if (s.id === 'recorde') {
          const t = m.reveal ?? 1;
          CHIME.forEach((f, i) => hit(at(t + i * 0.25), blip(f, 0.12), 0.2, -0.3 + i * 0.2, 0.6));
          hit(at(t), metal(220, 0.7, S()), 0.2, 0, 0.5);
          hit(at(t), env(sine(0.6, (x) => 48 - 10 * x), 0.002, 0.25), 0.5);
          cue(at(t), 'recorde');
        }
        break;
      }
      case 'marca': {
        const reveal = m.reveal ?? 4.5;
        const locked = reveal - 1.5;
        hit(at(0), whoosh(T(locked), 160, 900, S(), 1), 0.2);
        hit(at(locked), metal(110, 1.2, S()), 0.5, 0, 0.6);
        hit(at(locked), thud(S()), 0.5);
        cue(at(locked), 'anilha trava');
        hit(at(reveal), morph(0.35, S()), 0.18, 0, 0.8);
        hit(at(reveal) + 0.25, chime(), 0.55, 0, 0.6);
        cue(at(reveal), 'vira a marca');
        (m.words ?? []).forEach((w) => {
          hit(at(w), kick(), 0.6);
          cue(at(w), 'Do ferro ao número');
        });
        break;
      }
      case 'instalar': {
        (m.steps ?? []).forEach((st, i) => {
          hit(at(st), tap(S()), 0.45, -0.2 + i * 0.2);
          hit(at(st), blip([880, 1175, 1480][i] ?? 1175, 0.05), 0.14, 0, 0.3);
          cue(at(st), `passo ${i + 1}`);
        });
        const r2 = m.reveal ?? 4;
        hit(at(r2), metal(1250, 0.18, S()), 0.22, 0.3, 0.4);
        hit(at(r2) + 0.06 / BEAT, chime(), 0.5, 0, 0.5);
        cue(at(r2), 'ícone na tela de início');
        break;
      }
      case 'fim': {
        hit(at(0), kick(), 0.85);
        hit(at(0), env(sine(2.5, () => 36.71), 0.004, 0.9), 0.55);
        hit(at(0.5), chime(), 0.45, 0, 0.7);
        cue(at(0), 'fim');
        break;
      }
    }
  }

  // Ato 2 em diante: groove na grade, a partir dos números caindo nos campos.
  const num = span('numero') as Span;
  const grooveStart = num.startBeat + (marksFor('numero', num.beats).land ?? 4);
  const marca = span('marca');
  const inst = span('instalar');
  const fim = span('fim');
  const end = beats;
  const kicks: number[] = [];
  for (let b = grooveStart; b < end; b += 1) {
    const inMarca = marca && b >= marca.startBeat && b < marca.startBeat + marca.beats;
    const inFim = fim && b >= fim.startBeat;
    const instTail = inst && b >= inst.startBeat + inst.beats - 2 && b < inst.startBeat + inst.beats;
    if (inFim || instTail) continue;
    if (inMarca && (b - (marca as Span).startBeat) % 2 !== 0) continue;
    kicks.push(b);
    drums.add(T(b), kick(), 0.5);
  }
  const uiEnd = (span('amigos') ?? span('recorde') ?? num).startBeat + ((span('amigos') ?? span('recorde') ?? num).beats);
  for (let b = grooveStart; b < uiEnd; b += 0.5) {
    const off = (b * 2) % 2 === 1;
    if (off) drums.add(T(b), hat(false, S()), 0.2, 0.25);
    const rel = Math.round(b - impact);
    if (!off && b >= (span('hoje')?.startBeat ?? grooveStart) && (rel % 4 === 1 || rel % 4 === 3)) {
      drums.add(T(b), snare(S()), 0.32, -0.1);
      send.add(T(b), snare(S()), 0.1);
    }
  }
  const amigos = span('amigos');
  if (amigos) for (let b = amigos.startBeat; b < amigos.startBeat + amigos.beats; b += 0.25) if ((b * 4) % 2 === 1) drums.add(T(b), hat(false, S()), 0.09, -0.3);
  if (inst) for (let b = inst.startBeat; b < inst.startBeat + inst.beats - 2; b += 1) drums.add(T(b + 0.5), hat(true, S()), 0.12, 0.2);

  // Harmonia: um acorde a cada 8 tempos desde o impacto; baixo em colcheias com o groove;
  // arpejo digital nas telas do app.
  for (let b = impact; b < end; b += 8) {
    const ci = Math.floor((b - impact) / 8) % 4;
    const c = CHORDS[ci] as (typeof CHORDS)[number];
    const dur = Math.min(8, end - b);
    const last = fim && b + dur > fim.startBeat;
    music.add(T(b), pad(c.notes, T(dur) + 0.5), 0.065, 0);
    send.add(T(b), pad(c.notes, T(dur) + 0.5), 0.03);
    if (last) break;
  }
  if (fim) {
    music.add(T(fim.startBeat), pad([146.83, 220, 293.66, 369.99], T(fim.beats)), 0.12);
    send.add(T(fim.startBeat), pad([146.83, 220, 293.66, 369.99], T(fim.beats)), 0.06);
  }
  for (let b = grooveStart; b < (fim?.startBeat ?? end); b += 0.5) {
    const ci = Math.floor((b - impact) / 8) % 4;
    const c = CHORDS[ci] as (typeof CHORDS)[number];
    const inMarca = marca && b >= marca.startBeat && b < marca.startBeat + marca.beats;
    if (inMarca && (b * 2) % 2 === 1) continue;
    music.add(T(b), subNote((b * 2) % 4 === 3 ? c.root * 2 : c.root, T(0.3)), 0.2);
  }
  const hoje = span('hoje');
  for (let b = hoje?.startBeat ?? grooveStart; b < uiEnd; b += 0.25) {
    const ci = Math.floor((b - impact) / 8) % 4;
    const c = CHORDS[ci] as (typeof CHORDS)[number];
    const step = Math.round(b * 4) % 4;
    const f = (c.notes[[3, 1, 2, 1][step] as number] as number) * 4;
    music.add(T(b), pluck(f, S()), 0.05, step % 2 ? 0.35 : -0.35);
    send.add(T(b), pluck(f, S()), 0.02);
  }

  // Ducking do bumbo no pad, no baixo e no arpejo.
  const duck = new Float32Array(len).fill(1);
  for (const k of kicks) {
    const s0 = Math.round(T(k) * SR);
    for (let i = 0; i < 0.3 * SR && s0 + i < len; i += 1) {
      const g = 1 - 0.55 * Math.exp(-i / SR / 0.09);
      duck[s0 + i] = Math.min(duck[s0 + i] as number, g);
    }
  }

  const out = new Stereo(len);
  fx.mixInto(out, 1);
  drums.mixInto(out, 1);
  music.mixInto(out, 1, duck);
  reverb(send, 0.86, 0.28).mixInto(out, 1);
  // Limpa o subgrave abaixo de 25 Hz.
  biquad(out.L, 'hp', 25, 0.7);
  biquad(out.R, 'hp', 25, 0.7);

  // -14 LUFS integrados, pico real abaixo de -1 dBTP: normaliza, limita e confere.
  let gain = 1;
  for (let pass = 0; pass < 4; pass += 1) {
    const now = lufs(out);
    gain = 10 ** ((-14 - now) / 20);
    for (let i = 0; i < len; i += 1) {
      out.L[i] = (out.L[i] as number) * gain;
      out.R[i] = (out.R[i] as number) * gain;
    }
    // Teto de -2,2 dBFS: o AAC do MP4 sobe o pico real em quase 1 dB.
    limit(out, 10 ** (-2.2 / 20));
    if (Math.abs(lufs(out) + 14) < 0.15) break;
  }
  return { out, cues, loud: lufs(out), peak: 20 * Math.log10(truePeak(out)) };
}

const which = process.argv.slice(2).map(Number) as Duracao[];
mkdirSync('public/audio', { recursive: true });
for (const d of which.length ? which : ([15, 30, 45] as Duracao[])) {
  const { out, cues, loud, peak } = render(d);
  writeFileSync(`public/audio/anilha-${d}.wav`, writeWav24(out));
  writeFileSync(
    `public/audio/anilha-${d}.cues.json`,
    JSON.stringify(cues.map((c) => ({ ...c, seg: +(c.beat * BEAT).toFixed(4), quadro: Math.round(c.beat * BEAT * 60) })), null, 1),
  );
  console.log(`anilha-${d}.wav  ${loud.toFixed(2)} LUFS  pico real ${peak.toFixed(2)} dBTP  ${cues.length} marcas`);
}
