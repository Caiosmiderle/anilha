import { addDays, weekStart } from './dates';
import { fmtNum } from './format';
import type { BodyLogRow, Goal } from './types';

/**
 * Body weight and waist. A single weighing swings with water and food, so the trend is
 * read from weekly averages. To gain muscle, the reference is about 0.25% to 0.5% of
 * body weight per week (Iraki et al. 2019, natural bodybuilders off-season); faster
 * tends to be more fat. Other goals get the trend without a target.
 */
export interface WeekAverage {
  week: string;
  weight_kg: number | null;
  waist_cm: number | null;
  count: number;
}

export interface BodyTrend {
  latest: { local_date: string; weight_kg: number | null; waist_cm: number | null } | null;
  weeks: WeekAverage[];
  /** % of body weight per week, from the oldest to the newest of the last 4 weekly averages. */
  rate_pct_week: number | null;
  /** Waist change over the same span, in cm. */
  waist_change_cm: number | null;
  advice: string | null;
}

export const GAIN_TARGET: [number, number] = [0.25, 0.5];
/**
 * Weight loss per week that keeps lean mass, in % of body weight: 0.5 to 1 (Helms 2014,
 * Garthe 2011). Faster costs more muscle.
 */
export const LOSS_TARGET: [number, number] = [0.5, 1];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function weeklyAverages(
  logs: Pick<BodyLogRow, 'local_date' | 'weight_kg' | 'waist_cm' | 'deleted'>[],
): WeekAverage[] {
  const by = new Map<string, { w: number[]; c: number[] }>();
  for (const l of logs) {
    if (l.deleted) continue;
    const wk = weekStart(l.local_date);
    const e = by.get(wk) ?? { w: [], c: [] };
    if (l.weight_kg != null) e.w.push(Number(l.weight_kg));
    if (l.waist_cm != null) e.c.push(Number(l.waist_cm));
    by.set(wk, e);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, e]) => ({
      week,
      weight_kg: avg(e.w),
      waist_cm: avg(e.c),
      count: e.w.length + e.c.length,
    }));
}

export function bodyTrend(
  logs: Pick<BodyLogRow, 'local_date' | 'weight_kg' | 'waist_cm' | 'deleted'>[],
  goal: Goal | null | undefined,
  today: string,
): BodyTrend {
  const live = logs.filter((l) => !l.deleted && l.local_date <= today);
  const sorted = [...live].sort((a, b) => b.local_date.localeCompare(a.local_date));
  const latest = sorted[0]
    ? {
        local_date: sorted[0].local_date,
        weight_kg: sorted[0].weight_kg,
        waist_cm: sorted[0].waist_cm,
      }
    : null;
  const weeks = weeklyAverages(live);
  // Last 4 weeks with a weight (within the last 6 weeks, so an old entry does not count).
  const from = weekStart(addDays(today, -42));
  const recent = weeks.filter((w) => w.week >= from);
  const withWeight = recent.filter((w) => w.weight_kg != null);
  let rate: number | null = null;
  if (withWeight.length >= 2) {
    const span = withWeight.slice(-4);
    const first = span[0] as WeekAverage;
    const last = span[span.length - 1] as WeekAverage;
    const nWeeks = Math.round(
      (new Date(`${last.week}T12:00:00`).getTime() - new Date(`${first.week}T12:00:00`).getTime()) /
        (7 * 86_400_000),
    );
    if (nWeeks >= 1 && first.weight_kg)
      rate = (((last.weight_kg as number) - first.weight_kg) / first.weight_kg / nWeeks) * 100;
  }
  const withWaist = recent.filter((w) => w.waist_cm != null).slice(-4);
  const waistChange =
    withWaist.length >= 2
      ? (withWaist[withWaist.length - 1]?.waist_cm as number) - (withWaist[0]?.waist_cm as number)
      : null;

  let advice: string | null = null;
  if (rate == null) {
    advice = latest
      ? 'Com duas semanas de pesagens dá para ver o ritmo. Pese de manhã, no mesmo horário.'
      : null;
  } else if (goal === 'hipertrofia') {
    const [lo, hi] = GAIN_TARGET;
    if (rate < lo * 0.5)
      advice = `Peso quase parado. Para ganhar massa, a referência é subir de ${fmtNum(lo)}% a ${fmtNum(hi)}% por semana: um pouco mais de comida ajuda.`;
    else if (rate > hi * 1.5)
      advice = `Subindo rápido: acima de ${fmtNum(hi)}% por semana costuma vir mais gordura que músculo.`;
    else advice = 'No ritmo de quem está ganhando massa.';
    if (waistChange != null && waistChange >= 2 && rate > 0)
      advice += ' A cintura subiu 2 cm ou mais: vale segurar um pouco.';
  } else if (goal === 'emagrecimento') {
    const [lo, hi] = LOSS_TARGET;
    if (rate > -lo * 0.5)
      advice = `Peso quase parado. Para emagrecer sem perder músculo, a referência é cair de ${fmtNum(lo)}% a ${fmtNum(hi)}% por semana.`;
    else if (rate < -hi * 1.5)
      advice = `Caindo rápido: acima de ${fmtNum(hi)}% por semana aumenta a perda de músculo. Vale comer um pouco mais.`;
    else advice = 'No ritmo de quem emagrece mantendo o músculo.';
    if (waistChange != null && waistChange <= -1 && rate > -lo * 0.5)
      advice += ' A cintura caiu: o corpo está mudando mesmo com o peso parado.';
  }
  return {
    latest,
    weeks,
    rate_pct_week: rate == null ? null : Math.round(rate * 100) / 100,
    waist_change_cm: waistChange == null ? null : Math.round(waistChange * 10) / 10,
    advice,
  };
}
