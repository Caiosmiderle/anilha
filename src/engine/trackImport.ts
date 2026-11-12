/**
 * Runs exported from a watch or Strava: GPX (points with time) and TCX (laps with
 * distance and time). Pure parsing with no DOM, so it runs in tests and workers.
 * FIT, the binary Garmin format, is not read.
 */
import type { CardioKind } from './types';

export interface ImportedTrack {
  format: 'gpx' | 'tcx';
  start: string;
  local_date: string;
  distance_km: number;
  duration_sec: number;
  /** The sport of the file, when it is one the app logs. */
  activity: CardioKind | null;
  /** A sport the app does not log, to warn before saving. */
  other_sport: string | null;
}

/** Sport names in TCX (Running, Biking) and GPX <type> (running, cycling, swimming). */
export function sportToActivity(sport: string | null): CardioKind | null {
  if (!sport) return null;
  const s = sport.toLowerCase();
  if (/run/.test(s)) return 'corrida';
  if (/bik|cycl|ride/.test(s)) return 'bike';
  if (/walk|hik/.test(s)) return 'caminhada';
  if (/swim/.test(s)) return 'natacao';
  if (/row/.test(s)) return 'remo';
  if (/ellip/.test(s)) return 'eliptico';
  return null;
}

export type TrackResult = { ok: true; track: ImportedTrack } | { ok: false; error: string };

const EARTH_M = 6_371_000;

function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** yyyy-mm-dd of an instant in the device's time zone. */
export function localDateOf(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`).exec(tag);
  return m ? (m[1] as string) : null;
}

function inner(block: string, tag: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`).exec(block);
  return m ? (m[1] as string).trim() : null;
}

/** Moving time: stretches slower than 0.5 m/s (a stop at a light, a pause) do not count. */
const MIN_SPEED = 0.5;

function parseGpx(xml: string): TrackResult {
  const points: { at: number; pos: [number, number] }[] = [];
  const re = /<(?:\w+:)?trkpt\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?trkpt>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const lat = Number(attr(m[1] as string, 'lat'));
    const lon = Number(attr(m[1] as string, 'lon'));
    const time = inner(m[2] as string, 'time');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !time) continue;
    const at = Date.parse(time);
    if (Number.isFinite(at)) points.push({ at, pos: [lat, lon] });
  }
  if (points.length < 2) return { ok: false, error: 'O arquivo não tem pontos com horário.' };
  points.sort((a, b) => a.at - b.at);
  let meters = 0;
  let moving = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as (typeof points)[number];
    const b = points[i] as (typeof points)[number];
    const d = haversine(a.pos, b.pos);
    const dt = (b.at - a.at) / 1000;
    meters += d;
    if (dt > 0 && d / dt >= MIN_SPEED) moving += dt;
  }
  const first = points[0] as (typeof points)[number];
  return finish('gpx', new Date(first.at).toISOString(), meters, moving, null);
}

function parseTcx(xml: string): TrackResult {
  const activity = /<(?:\w+:)?Activity\b([^>]*)>/.exec(xml);
  const sport = activity ? attr(activity[1] as string, 'Sport') : null;
  const laps = xml.match(/<(?:\w+:)?Lap\b[\s\S]*?<\/(?:\w+:)?Lap>/g) ?? [];
  let meters = 0;
  let seconds = 0;
  let start: string | null = null;
  for (const lap of laps) {
    const head = /<(?:\w+:)?Lap\b([^>]*)>/.exec(lap);
    start ??= head ? attr(head[1] as string, 'StartTime') : null;
    // Lap totals only: track points carry their own running DistanceMeters.
    const totals = lap.replace(/<(?:\w+:)?Track\b[\s\S]*?<\/(?:\w+:)?Track>/g, '');
    meters += Number(inner(totals, 'DistanceMeters') ?? 0);
    seconds += Number(inner(totals, 'TotalTimeSeconds') ?? 0);
  }
  start ??= inner(xml, 'Id');
  if (!laps.length || !start)
    return { ok: false, error: 'O arquivo não tem voltas com tempo e distância.' };
  return finish('tcx', new Date(start).toISOString(), meters, seconds, sport);
}

function finish(
  format: 'gpx' | 'tcx',
  start: string,
  meters: number,
  seconds: number,
  sport: string | null,
): TrackResult {
  const activity = sportToActivity(sport);
  const other = sport && !activity && !/^other$/i.test(sport) ? sport : null;
  const distance_km = Math.round((meters / 1000) * 100) / 100;
  const duration_sec = Math.round(seconds);
  if (!(distance_km > 0) || duration_sec <= 0)
    return { ok: false, error: 'Distância ou tempo zerados no arquivo.' };
  if (distance_km > 300) return { ok: false, error: 'Distância grande demais.' };
  return {
    ok: true,
    track: {
      format,
      start,
      local_date: localDateOf(start),
      distance_km,
      duration_sec,
      activity,
      other_sport: other,
    },
  };
}

export function parseTrack(text: string, fileName = ''): TrackResult {
  const head = text.slice(0, 2000);
  if (/\.tcx$/i.test(fileName) || /<TrainingCenterDatabase/i.test(head)) return parseTcx(text);
  if (/\.gpx$/i.test(fileName) || /<gpx\b/i.test(head)) return parseGpx(text);
  if (/\.fit$/i.test(fileName))
    return { ok: false, error: 'Arquivo .fit ainda não é lido. Exporte em .gpx ou .tcx.' };
  return { ok: false, error: 'Arquivo não reconhecido. Use .gpx ou .tcx.' };
}
