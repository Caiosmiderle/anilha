import * as THREE from 'three';

/**
 * Texturas do mundo físico, desenhadas no próprio render com semente fixa: ferro fundido em
 * areia, letras fundidas e concreto riscado. Nenhuma imagem de fora.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruído de valor em várias oitavas, numa grade que fecha nas bordas (textura repetível). */
function valueNoise(size: number, seed: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  const rand = rng(seed);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    const cells = 4 << o;
    const grid = Array.from({ length: cells * cells }, () => rand());
    const at = (x: number, y: number) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)] as number;
    for (let y = 0; y < size; y += 1) {
      const gy = (y / size) * cells;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x += 1) {
        const gx = (x / size) * cells;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[y * size + x] = (out[y * size + x] as number) + (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] as number) / total;
  return out;
}

function canvasOf(size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(c: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface FaceTextures {
  map: THREE.Texture;
  bump: THREE.Texture;
  rough: THREE.Texture;
}

/**
 * A face da anilha em projeção plana (u e v de -R a R): grão de fundição, anéis de torno no
 * aro e "20 KG" fundido em cima e embaixo, na fonte do sistema, a mesma do Harbor. É esse
 * número que vira o "20" do campo Carga.
 */
export function plateFace(base: string, light: string, fontFamily: string): FaceTextures {
  const size = 1024;
  const grain = valueNoise(size, 7, 6);
  const fine = valueNoise(size, 19, 7);
  const bump = canvasOf(size);
  const map = canvasOf(size);
  const rough = canvasOf(size);
  const bctx = bump.getContext('2d') as CanvasRenderingContext2D;
  const mctx = map.getContext('2d') as CanvasRenderingContext2D;
  const rctx = rough.getContext('2d') as CanvasRenderingContext2D;

  const bImg = bctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const x = (i % size) / size - 0.5;
    const y = Math.floor(i / size) / size - 0.5;
    const r = Math.hypot(x, y) * 2;
    // Anéis de torno só no aro externo; grão de areia no resto.
    const lathe = r > 0.86 ? 0.5 + 0.5 * Math.sin(r * 900) : 0.5;
    const g = (grain[i] as number) * 0.6 + (fine[i] as number) * 0.4;
    const h = Math.max(0, Math.min(255, (r > 0.86 ? lathe * 0.35 + g * 0.15 + 0.25 : g * 0.55 + 0.1) * 255));
    bImg.data[i * 4] = h;
    bImg.data[i * 4 + 1] = h;
    bImg.data[i * 4 + 2] = h;
    bImg.data[i * 4 + 3] = 255;
    const ro = Math.max(0, Math.min(255, (r > 0.86 ? 0.38 : 0.62 + g * 0.3) * 255));
    rImg.data[i * 4] = ro;
    rImg.data[i * 4 + 1] = ro;
    rImg.data[i * 4 + 2] = ro;
    rImg.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(bImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  // Letras fundidas: claras no relevo, um pouco mais lisas na rugosidade.
  const letters = (ctx: CanvasRenderingContext2D, fill: string) => {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = fill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${size * 0.13}px ${fontFamily}`;
    ctx.fillText('20 KG', 0, -size * 0.3);
    ctx.rotate(Math.PI);
    ctx.fillText('20 KG', 0, -size * 0.3);
    ctx.restore();
  };
  bctx.filter = 'blur(2px)';
  letters(bctx, '#ffffff');
  bctx.filter = 'none';
  letters(rctx, '#5a5a5a');

  // Cor: o ferro do token com manchas do mesmo grão, e o relevo levemente polido.
  mctx.fillStyle = base;
  mctx.fillRect(0, 0, size, size);
  const mImg = mctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i += 1) {
    const k = 0.82 + (grain[i] as number) * 0.36;
    mImg.data[i * 4] = Math.min(255, (mImg.data[i * 4] as number) * k);
    mImg.data[i * 4 + 1] = Math.min(255, (mImg.data[i * 4 + 1] as number) * k);
    mImg.data[i * 4 + 2] = Math.min(255, (mImg.data[i * 4 + 2] as number) * k);
  }
  mctx.putImageData(mImg, 0, 0);
  mctx.globalAlpha = 0.18;
  letters(mctx, light);
  mctx.globalAlpha = 1;

  return { map: toTexture(map, true), bump: toTexture(bump, false), rough: toTexture(rough, false) };
}

/** Concreto: manchas largas, poros finos e riscos de anilha arrastada. Repete no chão. */
export function concrete(seed: number): { bump: THREE.Texture; rough: THREE.Texture; map: THREE.Texture } {
  const size = 1024;
  const broad = valueNoise(size, seed, 4);
  const pores = valueNoise(size, seed + 3, 8);
  const rand = rng(seed + 11);
  const make = (fn: (i: number) => number) => {
    const c = canvasOf(size);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i += 1) {
      const v = Math.max(0, Math.min(255, fn(i) * 255));
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { c, ctx };
  };
  const b = make((i) => (pores[i] as number) * 0.7 + (broad[i] as number) * 0.3);
  const r = make((i) => 0.7 + (broad[i] as number) * 0.25);
  const m = make((i) => 0.84 + (broad[i] as number) * 0.22 + ((pores[i] as number) - 0.5) * 0.08);
  // Riscos: arcos curtos, mais lisos e um pouco mais claros.
  // Riscos desligados: no estúdio claro pareciam traços desenhados.
  for (let k = 0; k < 0; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 40 + rand() * 160;
    const ang = rand() * Math.PI;
    for (const { ctx, col, w } of [
      { ctx: b.ctx, col: 'rgba(0,0,0,0.16)', w: 1 },
      { ctx: r.ctx, col: 'rgba(0,0,0,0.12)', w: 2 },
      { ctx: m.ctx, col: 'rgba(255,255,255,0.025)', w: 1.5 },
    ]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(ang) * len * 0.5 + rand() * 20,
        y + Math.sin(ang) * len * 0.5 + rand() * 20,
        x + Math.cos(ang) * len,
        y + Math.sin(ang) * len,
      );
      ctx.stroke();
    }
  }
  const wrap = (t: THREE.Texture) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    return t;
  };
  return {
    bump: wrap(toTexture(b.c, false)),
    rough: wrap(toTexture(r.c, false)),
    map: wrap(toTexture(m.c, false)),
  };
}

/** Recartilhado da barra: listras finas em diagonal. */
export function knurl(): THREE.Texture {
  const c = canvasOf(256);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  for (let i = -256; i < 512; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const t = toTexture(c, false);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 40);
  return t;
}

export interface PaintedTextures {
  map: THREE.Texture;
  bump: THREE.Texture;
  rough: THREE.Texture;
  metal: THREE.Texture;
}

/**
 * Anilha de ferro pintada, vista de frente (u e v de -R a R): tinta acetinada com leve
 * martelado, "20 KG" em relevo com o topo das letras gasto até o metal, como nas anilhas
 * de academia. A fonte é a do sistema, a mesma do Harbor: é esse "20" que vira o número.
 */
export function paintedPlate(paint: string, bare: string, fontFamily: string): PaintedTextures {
  const size = 2048;
  const hammer = valueNoise(512, 31, 5);
  const grain = valueNoise(512, 47, 7);
  const sample = (a: Float32Array, x: number, y: number) =>
    a[(Math.floor((y / size) * 512) % 512) * 512 + (Math.floor((x / size) * 512) % 512)] as number;

  const letters = (ctx: CanvasRenderingContext2D, fill: string, blur = 0) => {
    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : 'none';
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = fill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${size * 0.12}px ${fontFamily}`;
    ctx.fillText('20 KG', 0, -size * 0.3);
    ctx.rotate(Math.PI);
    ctx.fillText('20 KG', 0, -size * 0.3);
    ctx.restore();
  };

  // Relevo: martelado bem leve e as letras.
  const bump = canvasOf(size);
  const b = bump.getContext('2d') as CanvasRenderingContext2D;
  const bi = b.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = 0.18 + sample(hammer, x, y) * 0.08 + sample(grain, x, y) * 0.04;
      const i = (y * size + x) * 4;
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = v * 255;
      bi.data[i + 3] = 255;
    }
  }
  b.putImageData(bi, 0, 0);
  letters(b, '#ffffff', 3);

  // Cor: tinta do token, com variação mínima; topo das letras no metal gasto.
  const map = canvasOf(size);
  const m = map.getContext('2d') as CanvasRenderingContext2D;
  m.fillStyle = paint;
  m.fillRect(0, 0, size, size);
  const mi = m.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const k = 0.94 + sample(hammer, x, y) * 0.12;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const i = ((y + dy) * size + x + dx) * 4;
        mi.data[i] = Math.min(255, (mi.data[i] as number) * k);
        mi.data[i + 1] = Math.min(255, (mi.data[i + 1] as number) * k);
        mi.data[i + 2] = Math.min(255, (mi.data[i + 2] as number) * k);
      }
    }
  }
  m.putImageData(mi, 0, 0);
  letters(m, bare, 1);

  // Rugosidade: tinta acetinada; metal gasto mais liso.
  const rough = canvasOf(size);
  const r = rough.getContext('2d') as CanvasRenderingContext2D;
  r.fillStyle = '#8c8c8c';
  r.fillRect(0, 0, size, size);
  letters(r, '#5a5a5a', 1);

  // Metal: só o topo das letras.
  const metal = canvasOf(size);
  const t = metal.getContext('2d') as CanvasRenderingContext2D;
  t.fillStyle = '#1a1a1a';
  t.fillRect(0, 0, size, size);
  letters(t, '#e6e6e6', 1);

  return {
    map: toTexture(map, true),
    bump: toTexture(bump, false),
    rough: toTexture(rough, false),
    metal: toTexture(metal, false),
  };
}
