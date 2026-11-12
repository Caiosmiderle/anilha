import type { ShareCardData } from './shareCard';

/** The size of a story: shared as is to Instagram and WhatsApp. */
export const CARD_W = 1080;
export const CARD_H = 1920;

const FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const X = 72;
const INNER = CARD_W - X * 2;
const BRAND = '#0099ff';
const BRAND_DARK = '#006bb3';
const INK = '#16171a';
const MUTED = '#62636a';
const LINE = '#e9e9ec';
const BUTTER = '#fde88a';

/** Draws the card of a finished workout on a canvas of the size of a story. */
export function drawShareCard(card: ShareCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sem canvas');

  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#0087e1');
  bg.addColorStop(1, '#004f86');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Brand.
  drawMark(ctx, X, 110, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 58px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Anilha', X + 92 + 26, 110 + 48);
  ctx.textBaseline = 'alphabetic';

  // "Ficha A: Peito e tríceps" reads as a line above and the name.
  const m = /^(Ficha [A-Z]): (.+)$/.exec(card.title);
  const kicker = m ? `${card.date} · ${m[1]}` : card.date;
  ctx.font = `800 92px ${FONT}`;
  const title = wrap(ctx, m ? (m[2] as string) : card.title, INNER, 2);

  // Measure first: records take their room, the exercises get what is left, and the
  // whole block sits a little above the middle.
  const top = 110 + 92 + 96;
  const bottom = CARD_H - 104 - 96;
  const headH = 46 + 26 + title.length * 104 + 64;
  const statsH = 220;
  const gap = 40;
  const records = card.records.slice(0, 3);
  const recordsH = records.length ? 118 + records.length * 54 : 0;
  const rowH = 92;
  const pad = 40;
  const fixedH = headH + statsH + (recordsH ? gap + recordsH : 0);
  const maxRows = Math.max(1, Math.floor((bottom - top - fixedH - gap - pad * 2) / rowH));
  let shown = card.exercises;
  let more = card.more;
  if (shown.length + (more ? 1 : 0) > maxRows) {
    const keep = Math.max(1, maxRows - 1);
    more += shown.length - keep;
    shown = shown.slice(0, keep);
  }
  const rows = shown.length + (more ? 1 : 0);
  const listH = shown.length ? pad * 2 + rows * rowH : 0;
  const contentH = fixedH + (listH ? gap + listH : 0);
  let y = top + Math.max(0, (bottom - top - contentH) * 0.4);

  // Date and title.
  y += 46;
  ctx.font = `500 46px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText(kicker, X, y);
  y += 26;
  ctx.font = `800 92px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  for (const line of title) {
    y += 104;
    ctx.fillText(line, X, y);
  }
  y += 64;

  // Numbers.
  const stats = [
    card.duration ? { value: card.duration, label: 'de treino' } : null,
    { value: String(card.workSets), label: card.workSets === 1 ? 'série' : 'séries' },
    card.volume ? { value: card.volume, label: 'levantados' } : null,
  ].filter((s): s is { value: string; label: string } => s !== null);
  panel(ctx, X, y, INNER, statsH, '#ffffff');
  const col = INNER / stats.length;
  stats.forEach((s, i) => {
    const cx = X + col * i + col / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `800 ${fit(ctx, s.value, col - 72, 72, 800)}px ${FONT}`;
    ctx.fillText(s.value, cx, y + 112);
    ctx.fillStyle = MUTED;
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(s.label, cx, y + 166);
    if (i > 0) {
      ctx.fillStyle = LINE;
      ctx.fillRect(X + col * i, y + 48, 2, statsH - 96);
    }
  });
  ctx.textAlign = 'left';
  y += statsH;

  if (listH) {
    y += gap;
    panel(ctx, X, y, INNER, listH, '#ffffff');
    shown.forEach((e, i) => {
      const rowTop = y + pad + i * rowH;
      const base = rowTop + rowH / 2 + 14;
      ctx.font = `700 40px ${FONT}`;
      ctx.fillStyle = BRAND_DARK;
      const bestW = ctx.measureText(e.best).width;
      ctx.textAlign = 'right';
      ctx.fillText(e.best, X + INNER - 48, base);
      ctx.textAlign = 'left';
      ctx.font = `500 40px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText(ellipsize(ctx, e.name, INNER - 96 - bestW - 32), X + 48, base);
      if (i < rows - 1) {
        ctx.fillStyle = LINE;
        ctx.fillRect(X + 48, rowTop + rowH - 1, INNER - 96, 2);
      }
    });
    if (more) {
      ctx.font = `500 36px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(
        `e mais ${more} ${more === 1 ? 'exercício' : 'exercícios'}`,
        X + 48,
        y + pad + shown.length * rowH + rowH / 2 + 12,
      );
    }
    y += listH;
  }

  if (recordsH) {
    y += gap;
    panel(ctx, X, y, INNER, recordsH, BUTTER);
    ctx.fillStyle = INK;
    ctx.font = `800 46px ${FONT}`;
    const n = card.records.length;
    ctx.fillText(`${n} ${n === 1 ? 'recorde' : 'recordes'} neste treino`, X + 48, y + 84);
    ctx.font = `500 36px ${FONT}`;
    records.forEach((r, i) => {
      ctx.fillText(ellipsize(ctx, r, INNER - 96), X + 48, y + 84 + 62 + i * 54);
    });
  }

  ctx.font = `600 38px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.textAlign = 'center';
  ctx.fillText('Registrado no Anilha', CARD_W / 2, CARD_H - 84);
  ctx.textAlign = 'left';
  return canvas;
}

/** PNG of the canvas, for sharing or saving. */
export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Sem imagem'))), 'image/png');
  });
}

/** The logo inverted: white tile, blue ring and dot. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  roundRect(ctx, x, y, size, size, (9 * size) / 32);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  drawRing(ctx, x + size / 2, y + size / 2, (9.5 * size) / 32, BRAND);
}

/** The ring of the logo, open at the top left, with its dot: radius of the ring. */
function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = (3 / 9.5) * r;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, (7 * Math.PI) / 6);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(cx, cy, (3.2 / 9.5) * r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  roundRect(ctx, x, y, w, h, 44);
  ctx.fillStyle = color;
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Words into lines that fit; past the last line, the text ends in an ellipsis. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out.map((l) => ellipsize(ctx, l, max));
  const kept = out.slice(0, lines);
  kept[lines - 1] = ellipsize(ctx, `${kept[lines - 1]} ${out.slice(lines).join(' ')}`, max);
  return kept;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s.trimEnd()}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** The largest font size up to `size` that fits `text` in `max`. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  size: number,
  weight: number,
): number {
  let s = size;
  for (; s > 32; s -= 4) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= max) break;
  }
  return s;
}
