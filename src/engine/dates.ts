/** Calendar helpers on local 'YYYY-MM-DD' strings. Weeks start on Monday. */

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toLocalDate(input: number | Date = Date.now()): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Data inválida: ${day}`);
  return [y, m, d];
}

/** Days since epoch, ignoring time zones and DST. */
function ordinal(day: string): number {
  const [y, m, d] = parts(day);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromOrdinal(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(day: string, n: number): string {
  return fromOrdinal(ordinal(day) + n);
}

/** b minus a, in whole days. */
export function diffDays(a: string, b: string): number {
  return ordinal(b) - ordinal(a);
}

/** 0 = segunda ... 6 = domingo */
export function weekday(day: string): number {
  // 1970-01-01 was a Thursday (weekday 3 with Monday = 0).
  return (((ordinal(day) + 3) % 7) + 7) % 7;
}

export function weekStart(day: string): string {
  return addDays(day, -weekday(day));
}

export function weekEnd(day: string): string {
  return addDays(weekStart(day), 6);
}

export function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = parts(day);
  return fromOrdinal(ordinal(day)) === `${y}-${pad(m)}-${pad(d)}`;
}

export const WEEKDAY_NAMES = [
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
  'domingo',
] as const;

export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

/** 'na segunda', 'no sábado' */
export function onWeekday(d: number): string {
  return `${d >= 5 ? 'no' : 'na'} ${WEEKDAY_NAMES[d]}`;
}

/** 'a segunda', 'o sábado' */
export function theWeekday(d: number): string {
  return `${d >= 5 ? 'o' : 'a'} ${WEEKDAY_NAMES[d]}`;
}
export const WEEKDAY_LETTER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;

/** '18/10' */
export function formatDDMM(day: string): string {
  const [, m, d] = parts(day);
  return `${pad(d)}/${pad(m)}`;
}

/** 'domingo, 18/10' */
export function formatLongDay(day: string): string {
  return `${WEEKDAY_NAMES[weekday(day)]}, ${formatDDMM(day)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "2026-10": the month a local day belongs to. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The month before or after, as "YYYY-MM". */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * The weeks of a month, Monday first, as local days; days outside the month are null. Always
 * whole weeks, so the grid keeps its shape.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const days: (string | null)[] = Array(weekday(first)).fill(null);
  for (let d = first; monthOf(d) === month; d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
