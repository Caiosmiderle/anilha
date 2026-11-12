/**
 * Blocos de síntese offline: osciladores, filtros, reverb, medição de loudness (ITU-R
 * BS.1770-4) e gravação de WAV. Sem dependência: tudo em Float32Array.
 */

export const SR = 48000;

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export class Stereo {
  L: Float32Array;
  R: Float32Array;
  constructor(public length: number) {
    this.L = new Float32Array(length);
    this.R = new Float32Array(length);
  }
  /** Soma um sinal mono a partir do segundo `t`, com ganho e pan (-1 a 1, potência constante). */
  add(t: number, sig: Float32Array, gain = 1, pan = 0) {
    const start = Math.round(t * SR);
    const th = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(th) * gain * Math.SQRT2;
    const gr = Math.sin(th) * gain * Math.SQRT2;
    for (let i = 0; i < sig.length; i += 1) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= this.length) break;
      const v = sig[i] as number;
      this.L[j] = (this.L[j] as number) + v * gl;
      this.R[j] = (this.R[j] as number) + v * gr;
    }
  }
  addStereo(t: number, l: Float32Array, r: Float32Array, gain = 1) {
    const start = Math.round(t * SR);
    for (let i = 0; i < l.length; i += 1) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= this.length) break;
      this.L[j] = (this.L[j] as number) + (l[i] as number) * gain;
      this.R[j] = (this.R[j] as number) + (r[i] as number) * gain;
    }
  }
  mixInto(dst: Stereo, gain = 1, env?: Float32Array) {
    for (let i = 0; i < this.length; i += 1) {
      const g = gain * (env ? (env[i] as number) : 1);
      dst.L[i] = (dst.L[i] as number) + (this.L[i] as number) * g;
      dst.R[i] = (dst.R[i] as number) + (this.R[i] as number) * g;
    }
  }
}

export const buf = (sec: number) => new Float32Array(Math.max(1, Math.round(sec * SR)));

/** Biquad (RBJ). Processa no lugar. */
export function biquad(x: Float32Array, type: 'lp' | 'hp' | 'bp' | 'hs' | 'peak', f: number, q = 0.707, gainDb = 0) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (type === 'lp') {
    b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === 'hp') {
    b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === 'bp') {
    b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === 'peak') {
    b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
  } else {
    const sq = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cw + sq); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - sq);
    a0 = A + 1 - (A - 1) * cw + sq; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - sq;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const xi = x[i] as number;
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** Filtro de estado variável com corte que muda por amostra (varredura). */
export function svf(x: Float32Array, cutoff: (i: number) => number, q: number, mode: 'lp' | 'bp' | 'hp') {
  let low = 0, band = 0;
  const damp = 1 / q;
  for (let i = 0; i < x.length; i += 1) {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff(i), SR * 0.2)) / SR);
    const xi = x[i] as number;
    low += f * band;
    const high = xi - low - damp * band;
    band += f * high;
    x[i] = mode === 'lp' ? low : mode === 'bp' ? band : high;
  }
  return x;
}

export function noise(sec: number, seed: number) {
  const r = rng(seed);
  const b = buf(sec);
  for (let i = 0; i < b.length; i += 1) b[i] = r();
  return b;
}

/** Envelope exponencial com ataque linear curto. */
export function env(b: Float32Array, attack: number, decay: number) {
  for (let i = 0; i < b.length; i += 1) {
    const t = i / SR;
    const a = t < attack ? t / attack : 1;
    b[i] = (b[i] as number) * a * Math.exp(-Math.max(0, t - attack) / decay);
  }
  return b;
}

/** Serra com polyBLEP (sem serrilhado) e frequência por amostra. */
export function saw(sec: number, freq: (t: number) => number, phase0 = 0) {
  const b = buf(sec);
  let ph = phase0;
  for (let i = 0; i < b.length; i += 1) {
    const dt = freq(i / SR) / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    let v = 2 * ph - 1;
    if (ph < dt) {
      const t = ph / dt;
      v -= t + t - t * t - 1;
    } else if (ph > 1 - dt) {
      const t = (ph - 1) / dt;
      v -= t * t + t + t + 1;
    }
    b[i] = v;
  }
  return b;
}

export function sine(sec: number, freq: (t: number) => number, phase0 = 0) {
  const b = buf(sec);
  let ph = phase0;
  for (let i = 0; i < b.length; i += 1) {
    ph += (2 * Math.PI * freq(i / SR)) / SR;
    b[i] = Math.sin(ph);
  }
  return b;
}

/** Reverb de sala: 8 pentes paralelos e 4 passa-tudo por canal (Freeverb). */
export function reverb(src: Stereo, size = 0.84, damp = 0.3): Stereo {
  const out = new Stereo(src.length);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round((d * SR) / 44100));
  const alls = [556, 441, 341, 225].map((d) => Math.round((d * SR) / 44100));
  for (const [ch, spread] of [
    ['L', 0],
    ['R', 23],
  ] as const) {
    const x = src[ch];
    const y = out[ch];
    for (const d0 of combs) {
      const d = d0 + spread;
      const line = new Float32Array(d);
      let idx = 0;
      let store = 0;
      for (let i = 0; i < x.length; i += 1) {
        const o = line[idx] as number;
        store = o * (1 - damp) + store * damp;
        line[idx] = (x[i] as number) * 0.015 + store * size;
        idx = (idx + 1) % d;
        y[i] = (y[i] as number) + o;
      }
    }
    for (const d0 of alls) {
      const d = d0 + spread;
      const line = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < y.length; i += 1) {
        const bo = line[idx] as number;
        const v = y[i] as number;
        line[idx] = v + bo * 0.5;
        y[i] = bo - v;
        idx = (idx + 1) % d;
      }
    }
  }
  return out;
}

/** Loudness integrado (LUFS) pela BS.1770-4: ponderação K, blocos de 400 ms, dois gates. */
export function lufs(s: Stereo): number {
  const k = (x: Float32Array) => {
    const y = Float32Array.from(x);
    biquad(y, 'hs', 1681.974450955533, 0.7071752369554196, 3.999843853973347);
    biquad(y, 'hp', 38.13547087602444, 0.5003270373238773);
    return y;
  };
  const l = k(s.L);
  const r = k(s.R);
  const block = Math.round(0.4 * SR);
  const hop = Math.round(0.1 * SR);
  const z: number[] = [];
  for (let start = 0; start + block <= s.length; start += hop) {
    let sl = 0, sr = 0;
    for (let i = start; i < start + block; i += 1) {
      sl += (l[i] as number) ** 2;
      sr += (r[i] as number) ** 2;
    }
    z.push(sl / block + sr / block);
  }
  const L = (m: number) => -0.691 + 10 * Math.log10(m);
  const abs = z.filter((m) => L(m) > -70);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = L(mean(abs)) - 10;
  return L(mean(abs.filter((m) => L(m) > rel)));
}

/** Pico real aproximado: interpolação de 4x entre amostras. */
export function truePeak(s: Stereo): number {
  let p = 0;
  for (const x of [s.L, s.R]) {
    for (let i = 1; i < x.length - 2; i += 1) {
      const a = x[i - 1] as number, b = x[i] as number, c = x[i + 1] as number, d = x[i + 2] as number;
      for (const t of [0, 0.25, 0.5, 0.75]) {
        // Catmull-Rom
        const v = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
        if (Math.abs(v) > p) p = Math.abs(v);
      }
    }
  }
  return p;
}

/** Limitador com antecipação de 5 ms e soltura de 80 ms. */
export function limit(s: Stereo, ceiling: number) {
  const look = Math.round(0.005 * SR);
  const rel = Math.exp(-1 / (0.08 * SR));
  const n = s.length;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = Math.max(Math.abs(s.L[i] as number), Math.abs(s.R[i] as number));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // Mínimo à frente (antecipação) e soltura suave.
  const g = new Float32Array(n);
  let cur = 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    let m = 1;
    for (let k = 0; k < look && i + k < n; k += 1) m = Math.min(m, need[i + k] as number);
    g[i] = m;
  }
  for (let i = 0; i < n; i += 1) {
    const target = g[i] as number;
    cur = target < cur ? target : target + (cur - target) * rel;
    s.L[i] = (s.L[i] as number) * cur;
    s.R[i] = (s.R[i] as number) * cur;
  }
}

export function writeWav24(s: Stereo): Buffer {
  const n = s.length;
  const data = Buffer.alloc(n * 2 * 3);
  let o = 0;
  for (let i = 0; i < n; i += 1) {
    for (const x of [s.L, s.R]) {
      const v = Math.max(-1, Math.min(1, x[i] as number));
      const q = Math.round(v * 8388607);
      data.writeIntLE(q, o, 3);
      o += 3;
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 6, 28);
  h.writeUInt16LE(6, 32);
  h.writeUInt16LE(24, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
