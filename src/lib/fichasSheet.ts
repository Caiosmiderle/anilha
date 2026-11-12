import { routineOrigin } from '../engine/routines';
import type { ExerciseRow, RoutineItemRow, RoutineRow } from '../engine/types';
import { xlsxBlob, type Cell, type SheetSpec } from './xlsx';

/**
 * The fichas as a spreadsheet: one tab per ficha with exercise, sets, reps, rest, warm-up and
 * notes, and four empty "Semana" columns to write the load of each workout, on paper or in
 * the sheet. Lazy-loaded: only who exports pays for it.
 */

export const WEEK_COLUMNS = 4;

export interface FichaForSheet {
  routine: Pick<RoutineRow, 'name'>;
  items: Pick<
    RoutineItemRow,
    | 'position'
    | 'exercise_id'
    | 'sets'
    | 'target_min'
    | 'target_max'
    | 'rest_sec'
    | 'warmup_sets'
    | 'note'
    | 'superset'
  >[];
}

type ExerciseInfo = Pick<ExerciseRow, 'name' | 'measure'>;

export const SHEET_HEADER = [
  '#',
  'Exercício',
  'Séries',
  'Repetições',
  'Descanso',
  'Aquecimento',
  'Observação',
  ...Array.from({ length: WEEK_COLUMNS }, (_, i) => `Semana ${i + 1}`),
];

function brDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

function rest(sec: number): string {
  if (sec < 60 || sec % 30 !== 0) return `${sec} s`;
  const min = Math.floor(sec / 60);
  return sec % 60 ? `${min} min 30 s` : `${min} min`;
}

export function fichaSheet(
  ficha: FichaForSheet,
  exercises: Map<string, ExerciseInfo>,
  today: string,
): SheetSpec {
  const items = [...ficha.items].sort((a, b) => a.position - b.position);
  const nameOf = (id: string) => exercises.get(id)?.name ?? id;
  const rows: SheetSpec['rows'] = [
    { cells: [ficha.routine.name], style: 'title' },
    {
      cells: [
        `Exportado do Anilha em ${brDate(today)}. Nas colunas Semana, anote a carga e as repetições de cada treino.`,
      ],
      style: 'muted',
    },
    { cells: [] },
    { cells: SHEET_HEADER, style: 'header' },
  ];
  items.forEach((it, i) => {
    const time = exercises.get(it.exercise_id)?.measure === 'time';
    const range =
      it.target_min === it.target_max ? `${it.target_min}` : `${it.target_min} a ${it.target_max}`;
    const partner = it.superset
      ? items.find((o) => o !== it && o.superset === it.superset)
      : undefined;
    const notes = [
      partner
        ? `Bi-set com ${nameOf(partner.exercise_id)}: alterne as séries, descanso depois do par`
        : null,
      it.note?.trim() || null,
    ].filter(Boolean);
    const cells: Cell[] = [
      i + 1,
      nameOf(it.exercise_id),
      it.sets,
      time ? `${range} s` : range,
      rest(it.rest_sec),
      it.warmup_sets ? `${it.warmup_sets} ${it.warmup_sets === 1 ? 'série' : 'séries'}` : null,
      notes.join('. ') || null,
      ...Array.from({ length: WEEK_COLUMNS }, () => null),
    ];
    rows.push({ cells, style: 'body' });
  });
  return {
    name: ficha.routine.name,
    rows,
    widths: [4, 32, 8, 12, 11, 13, 34, ...Array.from({ length: WEEK_COLUMNS }, () => 13)],
    freezeRows: 4,
  };
}

/** Treinos em uso com exercícios, os do plano primeiro: uma aba para cada. */
export function fichasFor(
  routines: RoutineRow[],
  items: (FichaForSheet['items'][number] & { routine_id: string })[],
): FichaForSheet[] {
  const plan = (r: RoutineRow) => (routineOrigin(r) === 'plano' ? 0 : 1);
  return [...routines]
    .filter((r) => !r.archived && !r.deleted)
    .sort((a, b) => plan(a) - plan(b) || a.position - b.position)
    .map((routine) => ({ routine, items: items.filter((i) => i.routine_id === routine.id) }))
    .filter((f) => f.items.length > 0);
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function fichasFileName(fichas: FichaForSheet[], today: string): string {
  const one = fichas.length === 1 ? fichas[0] : undefined;
  return one ? `anilha-${slug(one.routine.name) || 'ficha'}.xlsx` : `anilha-fichas-${today}.xlsx`;
}

export function fichasXlsx(
  fichas: FichaForSheet[],
  exercises: Map<string, ExerciseInfo>,
  today: string,
): Blob {
  return xlsxBlob(
    fichas.map((f) => fichaSheet(f, exercises, today)),
    `${today}T00:00:00Z`,
  );
}
