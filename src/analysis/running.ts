import { diffDays, weekday } from '../engine/dates';
import type { LocalRow } from './context';

export interface RunningContext {
  done: {
    days_ago: number;
    type: string;
    km: number | null;
    moving_sec: number | null;
    effort: number | null;
  }[];
  planned: {
    days_ahead: number;
    weekday: number;
    type: string;
    km: number | null;
    status: string;
    important: boolean;
  }[];
}
const TYPES = ['leve', 'longo', 'intervalado'];
const STATUS = ['planejada', 'feita', 'perdida'];
const number = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
/** No source_type or name: both can contain arbitrary text. Day offsets use local dates. */
export function runningContext(
  tables: Record<string, LocalRow[]>,
  date: string,
  window: number,
): RunningContext {
  const ordered = (a: LocalRow, b: LocalRow) =>
    String(a.local_date).localeCompare(String(b.local_date)) ||
    String(a.id).localeCompare(String(b.id));
  return {
    done: (tables.runs ?? [])
      .filter(
        (r) =>
          !r.deleted &&
          (!r.activity || r.activity === 'corrida') &&
          TYPES.includes(String(r.run_type)) &&
          typeof r.local_date === 'string' &&
          diffDays(r.local_date, date) >= 0 &&
          diffDays(r.local_date, date) <= window,
      )
      .sort(ordered)
      .map((r) => ({
        days_ago: diffDays(String(r.local_date), date),
        type: String(r.run_type),
        km: number(r.distance_km, 1000),
        moving_sec: number(r.duration_sec, 604800),
        effort: number(r.rpe, 10),
      })),
    planned: (tables.external_plan_items ?? [])
      .filter(
        (r) =>
          !r.deleted &&
          r.source === 'crunning' &&
          r.kind === 'corrida' &&
          TYPES.includes(String(r.run_type)) &&
          STATUS.includes(String(r.status)) &&
          typeof r.local_date === 'string' &&
          diffDays(date, r.local_date) >= 0 &&
          diffDays(date, r.local_date) <= window,
      )
      .sort(ordered)
      .map((r) => ({
        days_ahead: diffDays(date, String(r.local_date)),
        weekday: weekday(String(r.local_date)),
        type: String(r.run_type),
        km: r.distance_m == null ? null : number(Number(r.distance_m) / 1000, 1000),
        status: String(r.status),
        important: r.important === true,
      })),
  };
}
export function validRunning(x: unknown, window: number): x is RunningContext {
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const exact = (v: Record<string, unknown>, keys: string[]) =>
    Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
  const int = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
  const nullable = (v: unknown, max: number) => v === null || number(v, max) !== null;
  return (
    obj(x) &&
    exact(x, ['done', 'planned']) &&
    Array.isArray(x.done) &&
    x.done.length <= 200 &&
    x.done.every(
      (r) =>
        obj(r) &&
        exact(r, ['days_ago', 'type', 'km', 'moving_sec', 'effort']) &&
        int(r.days_ago, window) &&
        TYPES.includes(String(r.type)) &&
        nullable(r.km, 1000) &&
        nullable(r.moving_sec, 604800) &&
        nullable(r.effort, 10),
    ) &&
    Array.isArray(x.planned) &&
    x.planned.length <= 200 &&
    x.planned.every(
      (r) =>
        obj(r) &&
        exact(r, ['days_ahead', 'weekday', 'type', 'km', 'status', 'important']) &&
        int(r.days_ahead, window) &&
        int(r.weekday, 6) &&
        TYPES.includes(String(r.type)) &&
        nullable(r.km, 1000) &&
        STATUS.includes(String(r.status)) &&
        typeof r.important === 'boolean',
    )
  );
}
export const RUNNING_PROMPT =
  'Considere as corridas agregadas em running: feitas antes e planejadas depois, inclusive hoje (offset zero). Depois de treino pesado de perna, o rendimento na corrida pode piorar por até 48 h (Doma, Deakin e Bentley, 2017, Sports Medicine 47:2187-2200; Doma e colegas, 2019, Sports Medicine - Open). A corrida anterior pode explicar desempenho abaixo. Corridas importantes são intocáveis. Proteja os treinos fortes de corrida com ajustes de séries, faixa ou exercício na ficha. Mudar dia não é operação permitida: comente somente no texto. Não invente fadiga, saúde ou causalidade individual. Se running estiver ausente em um cliente antigo, não presuma ausência de corridas.';
