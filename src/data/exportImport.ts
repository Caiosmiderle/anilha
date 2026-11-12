/**
 * Your data is yours: full JSON backup, CSV of sets and runs, and import of both.
 * Import merges by id, so importing the same file twice does not duplicate anything.
 */
import { CARDIO_KINDS } from '../engine/cardio';
import type { CardioKind } from '../engine/types';
import { normalizeText } from '../engine/format';
import type { ExerciseRow, SessionItemRow, SessionRow, SetRow } from '../engine/types';
import { effortLabel } from '../engine/taxonomy';
import { backendConfigured } from '../lib/env';
import { healthOn } from '../sync/consent';
import { syncedKey, syncPayload } from '../sync/analysisSync';
import { SYNCED_TABLES, type SyncedTable } from './db';
import { db, newId, saveMany, uid, type Change } from './store';

const SEP = ';';
const BOM = String.fromCharCode(0xfeff);

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: unknown[][]): string {
  return `${rows.map((r) => r.map(csvCell).join(SEP)).join('\n')}\n`;
}

export async function exportJson(email: string): Promise<Blob> {
  const d = db();
  const tables: Record<string, unknown[]> = {};
  for (const t of SYNCED_TABLES) {
    let rows = (await d.table(t).toArray()) as { builtin?: boolean; updated_at: number }[];
    // Untouched built-in exercises ship with the app; only your changes are exported.
    if (t === 'exercises') rows = rows.filter((r) => !r.builtin || r.updated_at > 0);
    tables[t] = rows;
  }
  // Workout analyses and ficha reviews (also kept on the server to follow the account).
  const analyses = (await d.meta.toArray())
    .filter((e) => syncedKey(e.key))
    .map((e) => ({ key: e.key, ...syncPayload(e.value as Record<string, unknown>) }));
  const payload = {
    app: 'anilha',
    version: 1,
    exported_at: new Date().toISOString(),
    account: { id: uid(), email },
    tables,
    analyses,
    server: await serverRecords(),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

/** What only the server keeps: consent history and messages. Null when offline. */
async function serverRecords(): Promise<{
  consents: unknown;
  messages: unknown;
  crunning: unknown;
} | null> {
  if (!backendConfigured() || !navigator.onLine) return null;
  try {
    const { rpc } = await import('../sync/client');
    const [consents, messages, crunning] = await Promise.all([
      rpc('consent_history'),
      rpc('my_tickets'),
      rpc('crunning_token_state'),
    ]);
    return { consents, messages, crunning };
  } catch {
    return null;
  }
}

export async function exportSetsCsv(): Promise<Blob> {
  const d = db();
  const sessions = new Map((await d.sessions.toArray()).map((s) => [s.id, s]));
  const items = new Map((await d.session_items.toArray()).map((i) => [i.id, i]));
  const exercises = new Map((await d.exercises.toArray()).map((e) => [e.id, e]));
  const sets = (await d.sets.toArray())
    .filter((s) => !s.deleted && s.completed_at != null)
    .sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0));
  const rows: unknown[][] = [
    [
      'data',
      'treino',
      'exercicio',
      'exercicio_planejado',
      'tipo',
      'carga_kg',
      'repeticoes',
      'segundos',
      'rir',
      'esforco',
      'nota',
    ],
  ];
  for (const s of sets) {
    const session = sessions.get(s.session_id);
    if (!session || session.deleted) continue;
    const item = items.get(s.item_id);
    rows.push([
      session.local_date,
      session.title,
      exercises.get(s.exercise_id)?.name ?? s.exercise_id,
      item?.original_exercise_id
        ? (exercises.get(item.original_exercise_id)?.name ?? item.original_exercise_id)
        : '',
      s.kind === 'warmup' ? 'aquecimento' : 'trabalho',
      s.load_kg,
      s.reps,
      s.seconds,
      s.rir,
      effortLabel(s.rir) ?? '',
      s.note ?? '',
    ]);
  }
  return new Blob([`${BOM}${csv(rows)}`], { type: 'text/csv;charset=utf-8' });
}

export async function exportRunsCsv(): Promise<Blob> {
  const runs = (await db().runs.toArray())
    .filter((r) => !r.deleted)
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
  const rows: unknown[][] = [
    ['data', 'distancia_km', 'tempo_segundos', 'tipo', 'esforco_1a10', 'nota', 'atividade'],
  ];
  for (const r of runs)
    rows.push([
      r.local_date,
      r.distance_km ?? '',
      r.duration_sec,
      r.run_type,
      r.rpe,
      r.note ?? '',
      r.activity ?? 'corrida',
    ]);
  return new Blob([`${BOM}${csv(rows)}`], { type: 'text/csv;charset=utf-8' });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text: string): string[][] {
  const clean = text.startsWith(BOM) ? text.slice(1) : text;
  const sep = clean.split('\n')[0]?.includes(';') ? ';' : ',';
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i] as string;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) out.push(row);
  return out;
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ImportResult {
  kind: 'json' | 'series' | 'corridas';
  rows: number;
}

export async function importFile(file: File): Promise<ImportResult> {
  if (file.size > 20_000_000) throw new Error('Arquivo grande demais');
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('{'))
    return importJson(text);
  return importCsv(text);
}

async function importJson(text: string): Promise<ImportResult> {
  const data = JSON.parse(text) as { app?: string; tables?: Record<string, unknown[]> };
  if (data.app !== 'anilha' || !data.tables) throw new Error('Arquivo não é do Anilha');
  // Without health consent, a backup brings everything except health data.
  const health = healthOn();
  const changes: Change[] = [];
  for (const t of SYNCED_TABLES) {
    if (t === 'external_plan_items') continue; // Integration snapshots are read only.
    const rows = data.tables[t];
    if (!Array.isArray(rows)) continue;
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
        continue;
      const row = { ...(raw as Record<string, unknown>) };
      delete row.user_id;
      delete row.server_seq;
      if (t === 'profiles') row.id = uid();
      if (!health) {
        if (t === 'body_logs' || t === 'pain_reports') continue;
        if (t === 'day_overrides' && row.action === 'spare_joint') continue;
        if (t === 'session_items') row.pain_joint = null;
        if (t === 'profiles' && row.onboarding && typeof row.onboarding === 'object')
          row.onboarding = { ...(row.onboarding as Record<string, unknown>), spare_joints: [] };
      }
      changes.push({ table: t as SyncedTable, row } as unknown as Change);
    }
  }
  for (let i = 0; i < changes.length; i += 500) await saveMany(changes.slice(i, i + 500));
  return { kind: 'json', rows: changes.length };
}

async function importCsv(text: string): Promise<ImportResult> {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => normalizeText(h));
  const col = (name: string) => header.indexOf(name);
  if (col('distancia_km') >= 0) {
    const changes: Change[] = [];
    for (const r of rows.slice(1)) {
      const day = r[col('data')]?.trim() ?? '';
      const km = num(r[col('distancia_km')]);
      const sec = num(r[col('tempo_segundos')]);
      const given = (col('atividade') >= 0 ? r[col('atividade')] : '')?.trim() ?? '';
      const activity = (CARDIO_KINDS as string[]).includes(given)
        ? (given as CardioKind)
        : 'corrida';
      // A run needs its distance; other cardio may come without one.
      if (!DAY.test(day) || !sec || (!km && activity === 'corrida')) continue;
      const type = (r[col('tipo')] ?? 'leve').trim();
      changes.push({
        table: 'runs',
        row: {
          id: `import-run-${day}-${km ?? 0}-${sec}`,
          deleted: false,
          local_date: day,
          distance_km: km || null,
          activity: activity === 'corrida' ? null : activity,
          duration_sec: Math.round(sec),
          run_type: type === 'longo' || type === 'intervalado' ? type : 'leve',
          rpe: num(r[col('esforco_1a10')]),
          note: r[col('nota')]?.trim() || null,
          source: 'import',
          external_id: null,
        },
      });
    }
    await saveMany(changes);
    return { kind: 'corridas', rows: changes.length };
  }
  if (col('exercicio') < 0 || col('data') < 0) throw new Error('Cabeçalho não reconhecido');

  const d = db();
  const exercises = (await d.exercises.toArray()).filter((e) => !e.deleted);
  const byName = new Map(exercises.map((e) => [normalizeText(e.name), e]));
  const changes: Change[] = [];
  const sessions = new Map<string, Omit<SessionRow, 'user_id' | 'updated_at'>>();
  const items = new Map<string, Omit<SessionItemRow, 'user_id' | 'updated_at'>>();
  const position = new Map<string, number>();
  const newExercises: Omit<ExerciseRow, 'user_id' | 'updated_at'>[] = [];
  let count = 0;
  for (const r of rows.slice(1)) {
    const day = r[col('data')]?.trim() ?? '';
    const name = r[col('exercicio')]?.trim() ?? '';
    if (!DAY.test(day) || !name) continue;
    const title = r[col('treino')]?.trim() || 'Treino importado';
    const sKey = `${day}|${title}`;
    let session = sessions.get(sKey);
    if (!session) {
      const [y, m, dd] = day.split('-').map(Number) as [number, number, number];
      const start = new Date(y, m - 1, dd, 6).getTime();
      session = {
        id: `import-${normalizeText(sKey).replace(/[^a-z0-9]+/g, '-')}`.slice(0, 64),
        deleted: false,
        local_date: day,
        started_at: start,
        ended_at: start + 3_600_000,
        status: 'done',
        split_key: null,
        title: title.slice(0, 80),
        routine_id: null,
        source: 'import',
        note: null,
        detail: 'full',
        rest_started_at: null,
        rest_duration_sec: null,
        adjustments: [],
      };
      sessions.set(sKey, session);
    }
    let ex = byName.get(normalizeText(name));
    if (!ex) {
      const created: Omit<ExerciseRow, 'user_id' | 'updated_at'> = {
        id: `custom-${newId()}`,
        deleted: false,
        name: name.slice(0, 80),
        primary_group: 'core',
        secondary_groups: [],
        muscles: ['abdomen'],
        secondary_muscles: [],
        equipment: 'peso_corporal',
        measure:
          num(r[col('segundos')]) != null && num(r[col('repeticoes')]) == null
            ? 'time'
            : 'weight_reps',
        increment_kg: 2,
        joints: [],
        compound: false,
        bodyweight: false,
        pattern: 'core_flexao',
        progression_hint: null,
        note: 'Criado ao importar. Ajuste o grupo.',
        builtin: false,
        archived: false,
      };
      newExercises.push(created);
      ex = created as ExerciseRow;
      byName.set(normalizeText(name), ex);
    }
    const iKey = `${sKey}|${ex.id}`;
    let item = items.get(iKey);
    if (!item) {
      const pos = position.get(sKey) ?? 0;
      position.set(sKey, pos + 1);
      item = {
        id: `${session.id}-${ex.id}`.slice(0, 80),
        deleted: false,
        session_id: session.id,
        position: pos,
        exercise_id: ex.id,
        original_exercise_id: null,
        substitution_reason: null,
        status: 'done',
        skip_reason: null,
        planned_sets: 0,
        target_min: 8,
        target_max: 12,
        rest_sec: 90,
        warmup_sets: 0,
        note: null,
        pain_joint: null,
        added: false,
      };
      items.set(iKey, item);
    }
    item.planned_sets += 1;
    const kind: SetRow['kind'] =
      normalizeText(r[col('tipo')] ?? '') === 'aquecimento' ? 'warmup' : 'work';
    const setPos = item.planned_sets - 1;
    changes.push({
      table: 'sets',
      row: {
        id: `${item.id}-${setPos}`.slice(0, 100),
        deleted: false,
        session_id: session.id,
        item_id: item.id,
        exercise_id: ex.id,
        position: setPos,
        kind,
        load_kg: num(r[col('carga_kg')]),
        reps: num(r[col('repeticoes')]),
        seconds: num(r[col('segundos')]),
        rir: kind === 'warmup' ? null : num(r[col('rir')]),
        note: r[col('nota')]?.trim() || null,
        completed_at: session.started_at + setPos * 120_000,
      },
    });
    count += 1;
  }
  const all: Change[] = [
    ...newExercises.map((row) => ({ table: 'exercises' as const, row })),
    ...[...sessions.values()].map((row) => ({ table: 'sessions' as const, row })),
    ...[...items.values()].map((row) => ({
      table: 'session_items' as const,
      row: { ...row, planned_sets: Math.min(12, row.planned_sets) },
    })),
    ...changes,
  ];
  for (let i = 0; i < all.length; i += 500) await saveMany(all.slice(i, i + 500));
  return { kind: 'series', rows: count };
}
