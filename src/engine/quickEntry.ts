import { fmtLoad, fmtNum, joinPt, normalizeText, plural, unitToKg } from './format';
import { effortLabel } from './taxonomy';
import type { ExerciseDef, Measure, SetKind } from './types';

export interface ParsedSet {
  kind: SetKind;
  load_kg: number | null;
  reps: number | null;
  seconds: number | null;
  rir: number | null;
}

export interface QuickEntryResult {
  ok: boolean;
  text: string;
  exercise_id: string | null;
  exercise_name: string | null;
  sets: ParsedSet[];
  unknown: string[];
  preview: string;
}

export interface QuickEntryContext {
  /** Exercise of the card where the text was typed. */
  current?: Pick<ExerciseDef, 'id' | 'name' | 'measure'> | null;
  /** Exercises to match names against, session items first. */
  candidates?: Pick<ExerciseDef, 'id' | 'name' | 'measure'>[];
}

/** Effort words, longest first. Values are RIR. */
const EFFORT_WORDS: [string, number][] = [
  ['muita dificuldade', 0],
  ['muito pesado', 0],
  ['no limite', 0],
  ['ate a falha', 0],
  ['limite', 0],
  ['falha', 0],
  ['dificil', 1],
  ['pesado', 1],
  ['puxado', 1],
  ['tranquilo', 3],
  ['facil', 3],
  ['leve', 3],
  ['ok', 2],
  ['normal', 2],
  ['bom', 2],
];

const WARMUP_WORDS = new Set(['aquecimento', 'aquec', 'aq', 'warmup']);
const FILLER = new Set([
  'de',
  'com',
  'e',
  'x',
  'series',
  'serie',
  'reps',
  'rep',
  'repeticoes',
  'na',
  'no',
  'a',
]);

interface Token {
  raw: string;
  norm: string;
}

function tokenize(text: string): Token[] {
  const prepared = normalizeText(text)
    // decimal comma between digits
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[;|/]/g, ' ')
    .replace(/,/g, ' ')
    // split '3x15' into '3x 15', '6kg' stays, '15x3' handled below
    .replace(/(\d+)\s*x\s*(\d)/g, '$1x $2');
  return prepared
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ raw: t, norm: t }));
}

function matchExercise(
  words: string[],
  ctx: QuickEntryContext,
): Pick<ExerciseDef, 'id' | 'name' | 'measure'> | null {
  if (words.length === 0) return null;
  const query = words.join(' ');
  const pool = [...(ctx.current ? [ctx.current] : []), ...(ctx.candidates ?? [])];
  const scored = pool
    .map((e, index) => {
      const name = normalizeText(e.name);
      const all = words.every((w) => name.includes(w));
      const starts = name.startsWith(query);
      return { e, index, score: (all ? 2 : 0) + (starts ? 1 : 0) + (name === query ? 2 : 0) };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.e ?? null;
}

/**
 * Deterministic parser for how people already talk: "6kg 15 15 15 pesado",
 * "prancha 40s 3x", "12,5 kg 3x10", "4kg 2x15 aquecimento".
 */
export function parseQuickEntry(text: string, ctx: QuickEntryContext = {}): QuickEntryResult {
  const tokens = tokenize(text);
  const unknown: string[] = [];
  const nameWords: string[] = [];
  let load: number | null = null;
  let count: number | null = null;
  let kind: SetKind = 'work';
  const values: { reps: number | null; seconds: number | null; rir: number | null }[] = [];
  let pendingRir: number | null = null;
  let explicitRirNext = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = (tokens[i] as Token).norm;
    const next = tokens[i + 1]?.norm;

    if (explicitRirNext) {
      explicitRirNext = false;
      const n = Number(t);
      if (Number.isInteger(n) && n >= 0 && n <= 5) {
        if (values.length) (values[values.length - 1] as { rir: number | null }).rir = n;
        else pendingRir = n;
        continue;
      }
      unknown.push(t);
      continue;
    }

    // effort phrases (two words first)
    const two = next ? `${t} ${next}` : '';
    const twoEffort = EFFORT_WORDS.find(([w]) => w === two);
    const oneEffort = EFFORT_WORDS.find(([w]) => w === t);
    if (twoEffort || oneEffort) {
      const rir = (twoEffort ?? oneEffort)?.[1] ?? null;
      if (twoEffort) i += 1;
      if (values.length) (values[values.length - 1] as { rir: number | null }).rir = rir;
      else pendingRir = rir;
      continue;
    }
    if (t === 'rir') {
      explicitRirNext = true;
      continue;
    }
    const rirInline = /^rir(\d)$/.exec(t);
    if (rirInline) {
      const n = Number(rirInline[1]);
      if (values.length) (values[values.length - 1] as { rir: number | null }).rir = n;
      else pendingRir = n;
      continue;
    }
    if (WARMUP_WORDS.has(t)) {
      kind = 'warmup';
      continue;
    }

    let m = /^(\d+(?:\.\d+)?)(kg|kgs|quilos?)$/.exec(t);
    if (m || (/^\d+(?:\.\d+)?$/.test(t) && (next === 'kg' || next === 'kgs'))) {
      load = Number(m ? m[1] : t);
      if (!m) i += 1;
      continue;
    }
    m = /^(\d+(?:\.\d+)?)(lb|lbs|libras?)$/.exec(t);
    if (m || (/^\d+(?:\.\d+)?$/.test(t) && (next === 'lb' || next === 'lbs'))) {
      load = unitToKg(Number(m ? m[1] : t), 'lb');
      if (!m) i += 1;
      continue;
    }
    m = /^(\d+)(s|seg|segs|segundos?)$/.exec(t);
    if (m || (/^\d+$/.test(t) && (next === 's' || next === 'seg' || next === 'segundos'))) {
      values.push({ reps: null, seconds: Number(m ? m[1] : t), rir: null });
      if (!m) i += 1;
      continue;
    }
    m = /^(\d+)x$/.exec(t) ?? /^x(\d+)$/.exec(t);
    if (m) {
      count = Number(m[1]);
      continue;
    }
    if (/^\d+$/.test(t)) {
      values.push({ reps: Number(t), seconds: null, rir: null });
      continue;
    }
    if (FILLER.has(t)) continue;
    if (/^[a-z]+$/.test(t) && values.length === 0 && load === null && count === null) {
      nameWords.push(t);
      continue;
    }
    unknown.push(t);
  }

  const matched = matchExercise(nameWords, ctx);
  if (nameWords.length && !matched) unknown.unshift(...nameWords);
  const exercise = matched ?? ctx.current ?? null;
  const measure: Measure = exercise?.measure ?? 'weight_reps';

  if (pendingRir != null && values.length) {
    (values[values.length - 1] as { rir: number | null }).rir ??= pendingRir;
  }

  // A plain number for a timed exercise is seconds.
  if (measure === 'time') {
    for (const v of values) {
      if (v.seconds == null && v.reps != null) {
        v.seconds = v.reps;
        v.reps = null;
      }
    }
  }

  let expanded = values;
  if (count != null) {
    if (values.length === 1) {
      const only = values[0] as (typeof values)[number];
      expanded = Array.from({ length: count }, (_, i) => ({
        ...only,
        rir: i === count - 1 ? only.rir : null,
      }));
    } else if (values.length === 0) {
      unknown.push(`${count}x`);
    } else if (values.length !== count) {
      unknown.push(`${count}x`);
    }
  }

  const invalid = expanded.some(
    (v) =>
      (v.reps != null && (v.reps < 1 || v.reps > 200)) ||
      (v.seconds != null && (v.seconds < 1 || v.seconds > 3600)),
  );
  if (load != null && (load < 0 || load > 1000)) unknown.push('carga');
  if (invalid) unknown.push('valores');

  const sets: ParsedSet[] = expanded.map((v) => ({
    kind,
    load_kg: load,
    reps: v.reps,
    seconds: v.seconds,
    rir: kind === 'warmup' ? null : v.rir,
  }));

  const ok = sets.length > 0 && unknown.length === 0 && sets.length <= 20;
  return {
    ok,
    text,
    exercise_id: exercise?.id ?? null,
    exercise_name: exercise?.name ?? null,
    sets,
    unknown,
    preview: ok ? previewText(sets, exercise?.name ?? null) : '',
  };
}

function previewText(sets: ParsedSet[], name: string | null): string {
  const first = sets[0] as ParsedSet;
  const n = sets.length;
  const kindWord =
    first.kind === 'warmup'
      ? plural(n, 'série de aquecimento', 'séries de aquecimento')
      : plural(n, 'série de trabalho', 'séries de trabalho');
  const vals = sets.map((s) => (s.seconds != null ? `${s.seconds} s` : fmtNum(s.reps ?? 0)));
  const same = vals.every((v) => v === vals[0]);
  const valText = same ? `${vals[0]}` : joinPt(vals);
  const loadText = first.load_kg != null ? `${fmtLoad(first.load_kg)} × ` : '';
  const last = sets[n - 1] as ParsedSet;
  const effort = effortLabel(last.rir);
  const prefix = name ? `${name}: ` : '';
  return `${prefix}${n} ${kindWord}, ${loadText}${valText}${effort ? `. Última: ${effort.toLowerCase()}` : ''}.`;
}
