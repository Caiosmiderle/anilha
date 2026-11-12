import type { Unit } from './types';

/** Brazilian number formatting: decimal comma, at most `max` decimals. */
export function fmtNum(value: number, max = 1): string {
  const factor = 10 ** max;
  const rounded = Math.round(value * factor) / factor;
  const [int, dec] = String(Math.abs(rounded)).split('.');
  const sign = rounded < 0 ? '-' : '';
  return dec ? `${sign}${int},${dec}` : `${sign}${int}`;
}

export const LB_PER_KG = 2.2046226218;

export function kgToUnit(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function unitToKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

/** Rounds a value shown in `unit` to a sensible precision (0,5). */
export function roundLoad(value: number): number {
  return Math.round(value * 2) / 2;
}

/** '12,5 kg' */
export function fmtLoad(kg: number, unit: Unit = 'kg'): string {
  return `${fmtNum(roundLoad(kgToUnit(kg, unit)))} ${unit}`;
}

/** 'h:mm:ss' or 'm:ss' */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** '2h21', '45 min', '30 s' */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Pace in seconds per km. */
export function paceSecPerKm(distanceKm: number, durationSec: number): number | null {
  if (!(distanceKm > 0) || !(durationSec > 0)) return null;
  return durationSec / distanceKm;
}

/** '6:41 /km' */
export function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '';
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
}

/** 'a, b e c' */
export function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

const COUNT_WORDS = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete'];

/** 'duas vezes' */
export function timesPt(n: number): string {
  const word = COUNT_WORDS[n] ?? String(n);
  return n === 1 ? 'uma vez' : `${word} vezes`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Removes accents and lowercases, for tolerant matching. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", then dd/mm. */
export function fmtAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  const date = new Date(t);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** First and last name, as the person typed them, in one line. */
export function fullName(p: { first_name: string; last_name?: string | undefined }): string {
  return [p.first_name, p.last_name ?? '']
    .map((x) => x.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
}

/** A name typed in one field: the first word, then the rest as the last name. */
export function splitName(name: string): { first_name: string; last_name: string } {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return { first_name: first, last_name: rest.join(' ') };
}
