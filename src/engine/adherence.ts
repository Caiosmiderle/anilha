import { addDays, inRange, weekday, weekEnd, weekStart } from './dates';
import { fmtLoad, fmtNum, joinPt, plural } from './format';
import type { RecordEvent, RunMilestone } from './records';
import { deviationText, planForDay, type OverrideSummary } from './recommend';
import type { PlanRow } from './types';

export interface WeekInput {
  /** Any day inside the week. */
  day: string;
  today: string;
  plan: Pick<PlanRow, 'gym_per_week' | 'run_per_week' | 'days'> | null;
  gymDates: string[];
  runDates: string[];
}

export type WeekStatus = 'cumprida' | 'parcial' | 'desvio' | 'em_andamento' | 'sem_plano';

export interface WeekReport {
  week_start: string;
  week_end: string;
  planned_gym: number;
  planned_run: number;
  done_gym: number;
  done_run: number;
  rest_days: number;
  planned_rest_days: number;
  status: WeekStatus;
  /** Capped at 100%: extra sessions never push it higher. */
  pct: number;
  excess_gym: number;
  excess_run: number;
  missing_gym: number;
  missing_run: number;
  finished: boolean;
  text: string;
}

/** Share of the plan done, each kind capped at what was planned. */
export function adherencePct(
  planned: { gym: number; run: number },
  done: { gym: number; run: number },
): number {
  const total = planned.gym + planned.run;
  if (total <= 0) return 0;
  return (Math.min(done.gym, planned.gym) + Math.min(done.run, planned.run)) / total;
}

export function weekReport(input: WeekInput): WeekReport {
  const from = weekStart(input.day);
  const to = weekEnd(input.day);
  const gym = input.gymDates.filter((d) => inRange(d, from, to));
  const run = input.runDates.filter((d) => inRange(d, from, to));
  const plannedGym = input.plan?.gym_per_week ?? 0;
  const plannedRun = input.plan?.run_per_week ?? 0;
  const finished = input.today > to;
  const elapsedEnd = finished ? to : input.today;
  const trainingDays = new Set([...gym, ...run]);
  let elapsed = 0;
  for (let d = from; d <= elapsedEnd; d = addDays(d, 1)) elapsed += 1;
  const restDays = Math.max(0, elapsed - trainingDays.size);
  const plannedRest = input.plan ? input.plan.days.filter((d) => d.kind === 'rest').length : 0;

  const excessGym = Math.max(0, gym.length - plannedGym);
  const excessRun = Math.max(0, run.length - plannedRun);
  const missingGym = Math.max(0, plannedGym - gym.length);
  const missingRun = Math.max(0, plannedRun - run.length);
  const pct = adherencePct(
    { gym: plannedGym, run: plannedRun },
    { gym: gym.length, run: run.length },
  );

  let status: WeekStatus;
  if (!input.plan) status = 'sem_plano';
  else if (excessGym > 0 || excessRun > 0) status = 'desvio';
  else if (missingGym === 0 && missingRun === 0) status = 'cumprida';
  else status = finished ? 'parcial' : 'em_andamento';

  const counts = `${gym.length} de ${plannedGym} na academia${plannedRun ? `, ${run.length} de ${plannedRun} ${plural(plannedRun, 'corrida', 'corridas')}` : ''}`;
  let text: string;
  switch (status) {
    case 'cumprida':
      text = `Plano cumprido: ${counts}, com ${restDays} ${plural(restDays, 'dia', 'dias')} de descanso.`;
      break;
    case 'desvio':
      text = deviationText({
        week_start: from,
        planned_gym: plannedGym,
        planned_run: plannedRun,
        done_gym: gym.length,
        done_run: run.length,
      });
      if (missingGym || missingRun) {
        const miss: string[] = [];
        if (missingGym) miss.push(`${missingGym} de academia`);
        if (missingRun) miss.push(`${missingRun} ${plural(missingRun, 'corrida', 'corridas')}`);
        text += ` Faltou: ${joinPt(miss)}.`;
      }
      break;
    case 'parcial':
      text = `Semana parcial: ${counts}.`;
      break;
    case 'em_andamento':
      text = `Até agora: ${counts}.`;
      break;
    default:
      text = `${gym.length} ${plural(gym.length, 'treino', 'treinos')} de academia e ${run.length} ${plural(run.length, 'corrida', 'corridas')}.`;
  }

  return {
    week_start: from,
    week_end: to,
    planned_gym: plannedGym,
    planned_run: plannedRun,
    done_gym: gym.length,
    done_run: run.length,
    rest_days: restDays,
    planned_rest_days: plannedRest,
    status,
    pct,
    excess_gym: excessGym,
    excess_run: excessRun,
    missing_gym: missingGym,
    missing_run: missingRun,
    finished,
    text,
  };
}

/** Consecutive finished weeks that followed the plan, ending at the last finished week. */
export function weeksInARow(
  today: string,
  plans: Pick<PlanRow, 'gym_per_week' | 'run_per_week' | 'days' | 'active_from' | 'updated_at'>[],
  gymDates: string[],
  runDates: string[],
): number {
  let n = 0;
  let day = addDays(weekStart(today), -1);
  // Current week counts too if it is already fulfilled with nothing extra.
  const current = weekReport({
    day: today,
    today,
    plan: planForDay(plans, today),
    gymDates,
    runDates,
  });
  if (current.status === 'cumprida') n += 1;
  for (let guard = 0; guard < 520; guard += 1) {
    const plan = planForDay(plans, day);
    if (!plan) break;
    const r = weekReport({ day, today, plan, gymDates, runDates });
    if (r.status !== 'cumprida') break;
    n += 1;
    day = addDays(weekStart(day), -1);
  }
  return n;
}

/** From this many days on, Hoje shows the streak next to the greeting. */
export const STREAK_MIN_DAYS = 5;

export interface DayStreak {
  /** Days in a row that followed the plan. */
  days: number;
  /** Today is a training day still without a workout: it does not count yet. */
  todayPending: boolean;
}

/**
 * Days in a row following the plan, up to today. A day counts when there was a workout, a
 * run or other cardio, or when it was a rest day of the plan. A training day turned into
 * rest ("Hoje é descanso") pauses: it keeps the streak without adding to it, so marking rest
 * every day never grows it. A training day of the plan that passed with nothing logged ends
 * it; today, still open, never does. Nothing before the first plan counts.
 */
export function dayStreak(input: {
  today: string;
  plans: Pick<PlanRow, 'days' | 'active_from' | 'updated_at'>[];
  /** Days with a finished workout, a run or other cardio. */
  activeDates: string[];
  overrides: Pick<OverrideSummary, 'local_date' | 'action'>[];
}): DayStreak {
  const active = new Set(input.activeDates);
  const rested = new Set(
    input.overrides.filter((o) => o.action === 'rest').map((o) => o.local_date),
  );
  let first: string | null = null;
  for (const p of input.plans) if (first === null || p.active_from < first) first = p.active_from;
  let days = 0;
  let todayPending = false;
  for (
    let d = input.today, guard = 0;
    first !== null && d >= first && guard < 800;
    d = addDays(d, -1), guard += 1
  ) {
    if (active.has(d)) days += 1;
    else if (!rested.has(d)) {
      const plan = planForDay(input.plans, d);
      const kind = plan?.days.find((x) => x.weekday === weekday(d))?.kind ?? 'rest';
      if (kind === 'rest') days += 1;
      else if (d === input.today) todayPending = true;
      else break;
    }
  }
  return { days, todayPending };
}

export type RecognitionKind = 'semana' | 'sequencia' | 'recorde' | 'corrida';

export interface Recognition {
  kind: RecognitionKind;
  title: string;
  value: string;
  detail: string;
  pastel: 'butter' | 'mint' | 'sky' | 'peach' | 'lime' | 'lavender' | 'pink' | 'neutral';
}

/** Recognition for a week. Excess is never congratulated. */
export function weekRecognitions(report: WeekReport, streak: number): Recognition[] {
  const out: Recognition[] = [];
  if (report.status === 'cumprida') {
    out.push({
      kind: 'semana',
      title: report.finished ? 'Semana cumprida' : 'Plano da semana cumprido',
      value: `${report.done_gym + report.done_run} de ${report.planned_gym + report.planned_run}`,
      detail: report.finished
        ? `${report.rest_days} ${plural(report.rest_days, 'dia', 'dias')} de descanso, como planejado.`
        : 'O resto da semana é descanso, e conta.',
      pastel: 'butter',
    });
    if (streak >= 2) {
      out.push({
        kind: 'sequencia',
        title: 'Semanas seguidas no plano',
        value: String(streak),
        detail: 'Constância sem passar do plano.',
        pastel: 'butter',
      });
    }
  }
  return out;
}

export interface SummaryInput {
  report: WeekReport;
  records: (RecordEvent & { exercise_name: string })[];
  runMilestones: RunMilestone[];
  nextWeekPlan: Pick<PlanRow, 'gym_per_week' | 'run_per_week'> | null;
  returnMode: boolean;
}

export interface WeeklySummary {
  title: string;
  done: string;
  evolved: string[];
  focus: string;
}

/** Sunday-evening summary: done against plan, what improved, next week's focus. */
export function weeklySummary(input: SummaryInput): WeeklySummary {
  const { report } = input;
  const evolved = [
    ...input.records.map((r) =>
      r.kind === 'carga'
        ? `${r.exercise_name}: ${fmtLoad(r.value)} (antes ${fmtLoad(r.previous)})`
        : r.kind === 'e1rm'
          ? `${r.exercise_name}: força estimada subiu para ${fmtLoad(r.value)}`
          : r.kind === 'tempo'
            ? `${r.exercise_name}: ${r.value} s (antes ${r.previous} s)`
            : `${r.exercise_name}: ${r.value} repetições (antes ${r.previous})`,
    ),
    ...input.runMilestones.map((m) => `${m.label}: ${fmtNum(m.value)} km`),
  ];

  let focus: string;
  const next = input.nextWeekPlan;
  const nextText = next
    ? `${next.gym_per_week} de academia${next.run_per_week ? ` e ${next.run_per_week} ${plural(next.run_per_week, 'corrida', 'corridas')}` : ''}`
    : 'o plano';
  if (report.status === 'desvio' && report.excess_gym > 0) {
    focus = `Segurar ${nextText}. Os dias de descanso fazem parte do treino.`;
  } else if (report.missing_run > 0 && report.missing_gym === 0) {
    focus = `Encaixar as corridas: ${nextText}.`;
  } else if (report.missing_gym > 0) {
    focus = `Fechar ${nextText}, sem compensar com dias extras.`;
  } else {
    focus = `Repetir a dose: ${nextText}.`;
  }
  if (input.returnMode) focus += ' Ainda em modo retorno: esforço com 2 a 3 repetições na reserva.';

  return {
    title: 'Resumo da semana',
    done: report.text,
    evolved,
    focus,
  };
}

export interface RankMember {
  id: string;
  name: string;
  planned_gym: number;
  planned_run: number;
  done_gym: number;
  done_run: number;
}

export interface RankRow extends RankMember {
  pct: number;
  position: number;
}

/** Group ranking by share of the plan done, capped at 100%. Ties share a position. */
export function rankGroup(members: RankMember[]): RankRow[] {
  const rows = members.map((m) => ({
    ...m,
    pct: adherencePct(
      { gym: m.planned_gym, run: m.planned_run },
      { gym: m.done_gym, run: m.done_run },
    ),
  }));
  rows.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, 'pt-BR'));
  let position = 0;
  let lastPct: number | null = null;
  return rows.map((r, i) => {
    if (lastPct === null || Math.abs(r.pct - lastPct) > 1e-9) {
      position = i + 1;
      lastPct = r.pct;
    }
    return { ...r, position };
  });
}

export function fmtPct(pct: number): string {
  return `${Math.round(pct * 100)}%`;
}
