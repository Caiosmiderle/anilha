import { addDays, diffDays, inRange, weekday, weekEnd, weekStart, WEEKDAY_NAMES } from './dates';
import { capitalizeFirst, joinPt, plural, timesPt } from './format';
import {
  fichaLetter,
  fichaName,
  MUSCLE_LABEL,
  RUN_TYPE_LABEL,
  SPLITS,
  splitHasLegs,
  splitLabel,
} from './taxonomy';
import { cardioLegLoad, cardioTitle, countedCardio } from './cardio';
import type {
  CardioKind,
  ExternalPlanItemRow,
  Muscle,
  OverrideAction,
  PlanDay,
  PlanRow,
  RunType,
  SplitKey,
} from './types';

/** A finished gym session, reduced to what the recommender needs. */
export interface SessionSummary {
  id: string;
  local_date: string;
  split_key: SplitKey | null;
  title: string;
  /** Primary muscles worked, from executed exercises or the split defaults. */
  muscles: Muscle[];
  /** Executed exercises, to name them in alerts. */
  exercises: { name: string; muscles: Muscle[] }[];
}

export interface RunSummary {
  id: string;
  local_date: string;
  distance_km: number | null;
  duration_sec?: number;
  rpe: number | null;
  run_type: RunType;
  activity?: CardioKind | null;
}

export interface OverrideSummary {
  local_date: string;
  action: OverrideAction;
  value: string | null;
}

export type AlertKind = 'volume' | 'repeat' | 'streak' | 'overlap' | 'run_legs' | 'legs_before_run';

export interface Alert {
  kind: AlertKind;
  text: string;
}

export interface WeekCounts {
  week_start: string;
  planned_gym: number;
  planned_run: number;
  done_gym: number;
  done_run: number;
}

export type DayKind = 'gym' | 'run' | 'rest' | 'light';

export interface DayRecommendation {
  kind: DayKind;
  split_key: SplitKey | null;
  run_type: RunType | null;
  headline: string;
  reason: string;
  alerts: Alert[];
  today_done: boolean;
  planned_today: PlanDay | null;
  week: WeekCounts;
  excess: boolean;
}

export interface RecommendInput {
  today: string;
  plan: PlanRow | null;
  sessions: SessionSummary[];
  runs: RunSummary[];
  overrides?: OverrideSummary[];
  externalPlans?: ExternalPlanItemRow[];
}

/** Plan that governs the week containing `day`: the latest one active by the end of that week. */
export function planForDay<P extends Pick<PlanRow, 'active_from' | 'updated_at'>>(
  plans: P[],
  day: string,
): P | null {
  const end = weekEnd(day);
  let best: P | null = null;
  for (const p of plans) {
    if (p.active_from > end) continue;
    if (
      !best ||
      p.active_from > best.active_from ||
      (p.active_from === best.active_from && p.updated_at > best.updated_at)
    ) {
      best = p;
    }
  }
  return best;
}

export function planDayFor(plan: PlanRow | null, day: string): PlanDay | null {
  if (!plan) return null;
  return plan.days.find((d) => d.weekday === weekday(day)) ?? null;
}

export function weekCounts(
  day: string,
  plan: Pick<PlanRow, 'gym_per_week' | 'run_per_week'> | null,
  sessions: Pick<SessionSummary, 'local_date'>[],
  runs: Pick<RunSummary, 'local_date'>[],
): WeekCounts {
  const from = weekStart(day);
  const to = weekEnd(day);
  return {
    week_start: from,
    planned_gym: plan?.gym_per_week ?? 0,
    planned_run: plan?.run_per_week ?? 0,
    done_gym: sessions.filter((s) => inRange(s.local_date, from, to)).length,
    done_run: runs.filter((r) => inRange(r.local_date, from, to)).length,
  };
}

/** Leg load of a run or other cardio, weighted by perceived effort (1 to 10). */
export function runLegLoad(
  run: Pick<RunSummary, 'distance_km' | 'rpe' | 'activity' | 'duration_sec'>,
): number {
  return cardioLegLoad(run);
}

const HEAVY_RUN_LOAD = 8;

function plannedCount(plan: PlanRow | null, split: SplitKey): number {
  if (!plan) return 1;
  const rotation = plan.rules.rotation;
  if (rotation?.length) {
    // A ficha comes back every rotation.length gym days.
    return rotation.includes(split)
      ? Math.max(1, Math.ceil(plan.gym_per_week / rotation.length))
      : 1;
  }
  const n = plan.days.filter((d) => d.kind === 'gym' && d.split_key === split).length;
  return Math.max(1, n);
}

/** Consecutive training days ending on `day`. */
function streakEndingOn(day: string, trainingDays: Set<string>): number {
  let n = 0;
  let d = day;
  while (trainingDays.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/**
 * Fatigue alerts over the last 7 days. Always suggestions, never blocks.
 */
export function fatigueAlerts(input: {
  today: string;
  plan: PlanRow | null;
  sessions: SessionSummary[];
  runs: RunSummary[];
}): Alert[] {
  const { today, plan } = input;
  const from = addDays(today, -6);
  const recent = input.sessions
    .filter((s) => inRange(s.local_date, from, today))
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
  const alerts: Alert[] = [];

  const limit = plan ? plan.gym_per_week : 4;
  if (recent.length > limit) {
    alerts.push({
      kind: 'volume',
      text: plan
        ? `${recent.length} treinos em 7 dias, o plano é ${limit} de academia.`
        : `${recent.length} treinos em 7 dias.`,
    });
  }

  const bySplit = new Map<SplitKey, string[]>();
  for (const s of recent) {
    if (!s.split_key || s.split_key === 'livre') continue;
    const list = bySplit.get(s.split_key) ?? [];
    list.push(s.local_date);
    bySplit.set(s.split_key, list);
  }
  for (const [split, days] of bySplit) {
    if (days.length > plannedCount(plan, split)) {
      const span = diffDays(days[0] as string, days[days.length - 1] as string) + 1;
      alerts.push({
        kind: 'repeat',
        text: `${splitLabel(split)} ${timesPt(days.length)} em ${span} dias.`,
      });
    }
  }

  const trainingDays = new Set<string>([
    ...input.sessions.map((s) => s.local_date),
    ...input.runs.map((r) => r.local_date),
  ]);
  const streakFrom = trainingDays.has(today) ? today : addDays(today, -1);
  const streak = streakEndingOn(streakFrom, trainingDays);
  if (streak >= 4) {
    alerts.push({ kind: 'streak', text: `${streak} dias seguidos de treino.` });
  }

  return alerts;
}

/** Muscles from yesterday that a candidate split would hit again. */
export function overlapAlert(
  today: string,
  sessions: SessionSummary[],
  candidate: SplitKey,
): Alert | null {
  const yesterday = addDays(today, -1);
  const prev = sessions.filter((s) => s.local_date === yesterday);
  if (prev.length === 0) return null;
  const target = new Set(SPLITS[candidate].muscles);
  for (const s of prev) {
    if (s.split_key === candidate) continue;
    for (const e of s.exercises) {
      const hit = e.muscles.find((m) => target.has(m));
      if (hit) {
        return {
          kind: 'overlap',
          text: `${capitalizeFirst(MUSCLE_LABEL[hit])} já trabalhou ontem (${e.name.toLowerCase()}). Alivie ou pule hoje.`,
        };
      }
    }
    if (s.exercises.length === 0) {
      const hit = s.muscles.find((m) => target.has(m));
      if (hit) {
        return {
          kind: 'overlap',
          text: `${capitalizeFirst(MUSCLE_LABEL[hit])} já trabalhou ontem. Alivie hoje.`,
        };
      }
    }
  }
  return null;
}

function heavyRunYesterday(today: string, runs: RunSummary[]): RunSummary | null {
  const yesterday = addDays(today, -1);
  const twoAgo = addDays(today, -2);
  const y = runs.filter((r) => r.local_date === yesterday);
  const yLoad = y.reduce((acc, r) => acc + runLegLoad(r), 0);
  const twoLoad = runs
    .filter((r) => r.local_date === twoAgo)
    .reduce((acc, r) => acc + runLegLoad(r), 0);
  if (yLoad >= HEAVY_RUN_LOAD || yLoad + twoLoad * 0.5 >= HEAVY_RUN_LOAD * 1.5) {
    return y[0] ?? null;
  }
  return null;
}

function daysSinceSplit(today: string, sessions: SessionSummary[], split: SplitKey): number {
  let last: string | null = null;
  for (const s of sessions) {
    if (s.split_key === split && s.local_date <= today && (!last || s.local_date > last)) {
      last = s.local_date;
    }
  }
  return last ? diffDays(last, today) : Number.POSITIVE_INFINITY;
}

/** The last ficha of the rotation that was done, by date. */
export function lastFicha(
  rotation: SplitKey[],
  sessions: Pick<SessionSummary, 'local_date' | 'split_key'>[],
): { index: number; local_date: string } | null {
  let last: { index: number; local_date: string } | null = null;
  for (const s of sessions) {
    const index = s.split_key ? rotation.indexOf(s.split_key) : -1;
    if (index < 0) continue;
    if (!last || s.local_date >= last.local_date) last = { index, local_date: s.local_date };
  }
  return last;
}

/** The rotation starting at the ficha after the last one done: next first. */
export function rotationQueue(
  rotation: SplitKey[],
  sessions: Pick<SessionSummary, 'local_date' | 'split_key'>[],
): SplitKey[] {
  const last = lastFicha(rotation, sessions);
  const start = last ? (last.index + 1) % rotation.length : 0;
  return rotation.map((_, i) => rotation[(start + i) % rotation.length] as SplitKey);
}

/** "ficha B, costas e bíceps" in a rotation, "costas e bíceps" otherwise. */
function dayName(rotation: SplitKey[] | null, split: SplitKey): string {
  const letter = fichaLetter(rotation, split);
  const label = splitLabel(split).toLowerCase();
  return letter ? `ficha ${letter}, ${label}` : label;
}

function remainingSplits(plan: PlanRow, weekSessions: SessionSummary[]): SplitKey[] {
  const planned = plan.days
    .filter((d) => d.kind === 'gym' && d.split_key)
    .sort((a, b) => a.weekday - b.weekday)
    .map((d) => d.split_key as SplitKey);
  const done = weekSessions.map((s) => s.split_key);
  const left: SplitKey[] = [];
  const pool = [...done];
  for (const split of planned) {
    const i = pool.indexOf(split);
    if (i >= 0) pool.splice(i, 1);
    else left.push(split);
  }
  return left;
}

function runTypeForToday(plan: PlanRow | null, today: string, doneRuns: number): RunType {
  const pd = planDayFor(plan, today);
  if (pd?.kind === 'run' && pd.run_type) return pd.run_type;
  const planned = (plan?.days ?? [])
    .filter((d) => d.kind === 'run')
    .sort((a, b) => a.weekday - b.weekday)
    .map((d) => d.run_type ?? 'leve');
  return planned[doneRuns] ?? 'leve';
}

function faltam(n: number, what: string): string {
  return `${n === 1 ? 'Falta' : 'Faltam'} ${n} ${what}`;
}

/**
 * What to do today. The weekly plan rules; history adjusts.
 * Excess is a deviation, the same as missing a session.
 */
export function recommendDay(input: RecommendInput): DayRecommendation {
  const { today, plan } = input;
  const sessions = input.sessions.filter((s) => s.local_date <= today);
  const runs = input.runs.filter((r) => r.local_date <= today);
  // Week and "done today" count runs and the cardio that fills a cardio day; fatigue
  // counts everything.
  const counted = countedCardio(runs, () => plan?.run_per_week ?? 0);
  const overrides = input.overrides ?? [];
  const week = weekCounts(today, plan, sessions, counted);
  const plannedToday = planDayFor(plan, today);
  const tomorrow = addDays(today, 1);
  const overrideToday = overrides.find((o) => o.local_date === today) ?? null;
  const overrideTomorrow = overrides.find((o) => o.local_date === tomorrow) ?? null;
  const externalRun = input.externalPlans?.find(
    (p) =>
      !p.deleted &&
      p.source === 'crunning' &&
      p.kind === 'corrida' &&
      p.local_date === tomorrow &&
      p.status === 'planejada' &&
      p.important,
  );
  const tomorrowRun =
    !!externalRun ||
    overrideTomorrow?.action === 'run' ||
    (planDayFor(plan, tomorrow)?.kind === 'run' && overrideTomorrow?.action !== 'rest');
  const noLegsBeforeRun = plan?.rules.no_legs_before_run ?? true;

  const alerts = fatigueAlerts({ today, plan, sessions, runs });
  const loadAlerts = alerts.filter((a) => a.kind !== 'overlap');
  const heavy = alerts.some((a) => a.kind === 'volume' || a.kind === 'streak');
  const excess = plan
    ? week.done_gym > plan.gym_per_week || week.done_run > plan.run_per_week
    : false;
  const todayDone =
    sessions.some((s) => s.local_date === today) || counted.some((r) => r.local_date === today);

  const result = (
    kind: DayKind,
    headline: string,
    reason: string,
    extra: Partial<DayRecommendation> = {},
  ): DayRecommendation => ({
    kind,
    split_key: null,
    run_type: null,
    headline,
    reason,
    alerts,
    today_done: todayDone,
    planned_today: plannedToday,
    week,
    excess,
    ...extra,
  });

  const alertLine = loadAlerts.map((a) => a.text).join(' ');

  if (todayDone) {
    return result(
      'rest',
      'Treino de hoje feito',
      heavy ? `${alertLine} Agora é descanso.` : 'Agora é recuperar. Amanhã tem mais.',
    );
  }

  if (overrideToday?.action === 'rest') {
    return result('rest', 'Hoje: descanso', 'Você marcou hoje como descanso.');
  }

  if (overrideToday?.action === 'run') {
    const type = runTypeForToday(plan, today, week.done_run);
    return result('run', `Hoje: corrida ${RUN_TYPE_LABEL[type]}`, 'Treino trocado por corrida.', {
      run_type: type,
    });
  }

  if (!plan) return recommendWithoutPlan(input, alerts, week, todayDone, heavy);

  const remainingGym = Math.max(0, plan.gym_per_week - week.done_gym);
  const remainingRun = Math.max(0, plan.run_per_week - week.done_run);

  if (remainingGym === 0 && remainingRun === 0) {
    const reason = excess
      ? `${deviationText(week)} Hoje é descanso.`
      : 'Plano da semana cumprido. Hoje é descanso, e descanso também conta.';
    return result('rest', 'Hoje: descanso', reason);
  }

  if (heavy) {
    return result(
      'light',
      'Hoje: descanso ou algo leve',
      `${alertLine} Hoje descanso ou algo leve.`,
    );
  }

  if (remainingGym === 0) {
    if (remainingRun > 0 && plannedToday?.kind !== 'gym') {
      const type = runTypeForToday(plan, today, week.done_run);
      return result(
        'run',
        `Hoje: corrida ${RUN_TYPE_LABEL[type]}`,
        `Academia da semana feita. ${faltam(remainingRun, plural(remainingRun, 'corrida', 'corridas'))}.`,
        { run_type: type },
      );
    }
    if (remainingRun > 0) {
      const type = runTypeForToday(plan, today, week.done_run);
      return result(
        'run',
        `Hoje: corrida ${RUN_TYPE_LABEL[type]}`,
        `Os ${plan.gym_per_week} de academia da semana já foram. Se for treinar, que seja a corrida.`,
        { run_type: type },
      );
    }
    return result(
      'rest',
      'Hoje: descanso',
      `Os ${plan.gym_per_week} de academia da semana já foram. Mais academia seria desvio.`,
    );
  }

  if (plannedToday?.kind === 'run' && remainingRun > 0) {
    const type = plannedToday.run_type ?? 'leve';
    return result(
      'run',
      `Hoje: corrida ${RUN_TYPE_LABEL[type]}`,
      `Corrida ${RUN_TYPE_LABEL[type]} no seu plano, às ${plannedToday.time}.`,
      { run_type: type },
    );
  }

  // Gym candidates: the rotation from the next ficha, or what the plan still owes this week.
  const rotation = plan.rules.rotation?.length ? plan.rules.rotation : null;
  const from = weekStart(today);
  const weekSessions = sessions.filter((s) => inRange(s.local_date, from, today));
  let candidates = rotation
    ? rotationQueue(rotation, sessions)
    : remainingSplits(plan, weekSessions);
  if (candidates.length === 0) {
    candidates = [
      ...new Set(
        plan.days
          .filter((d) => d.kind === 'gym' && d.split_key)
          .map((d) => d.split_key as SplitKey),
      ),
    ];
  }

  const legsBlockedByRun = tomorrowRun && noLegsBeforeRun;
  const heavyRun = heavyRunYesterday(today, runs);
  const blockedReasons: string[] = [];
  let filtered = candidates.filter((split) => {
    if (legsBlockedByRun && splitHasLegs(split)) {
      const reason = externalRun
        ? `Corrida planejada no CRUNNING: ${externalRun.name ?? 'corrida importante'}, amanhã (${tomorrow}). Sugiro deixar perna para outro dia. Confirme ao iniciar ou escolha outro treino.`
        : 'Corrida amanhã cedo, então perna fica para outro dia.';
      blockedReasons.push(reason);
      if (externalRun && !alerts.some((a) => a.kind === 'legs_before_run'))
        alerts.push({ kind: 'legs_before_run', text: reason });
      return false;
    }
    if (daysSinceSplit(today, sessions, split) <= 2) return false;
    return true;
  });
  if (heavyRun) {
    const withoutLegs = filtered.filter((s) => !splitHasLegs(s));
    if (withoutLegs.length < filtered.length) {
      blockedReasons.push(
        `${cardioTitle({ ...heavyRun, duration_sec: heavyRun.duration_sec ?? 0 })} feita ontem (${heavyRun.local_date}) pesa nas pernas, então perna fica para depois.`,
      );
      alerts.push({
        kind: 'run_legs',
        text: `${cardioTitle({ ...heavyRun, duration_sec: heavyRun.duration_sec ?? 0 })} ontem pesa nas pernas.`,
      });
    }
    filtered = withoutLegs;
  }

  const slotsLeft = plan.days.filter((d) => d.kind === 'gym' && d.weekday > weekday(today)).length;

  let chosen: SplitKey | null = null;
  let reason = '';
  const nextUp = candidates[0] ?? null;
  if (rotation && plannedToday?.kind === 'gym' && filtered.length > 0 && nextUp) {
    chosen = filtered[0] as SplitKey;
    const last = lastFicha(rotation, sessions);
    if (chosen === nextUp) {
      const after = last
        ? `, depois da ficha ${fichaLetter(rotation, rotation[last.index])} ${
            last.local_date === addDays(today, -1)
              ? 'de ontem'
              : `${weekday(last.local_date) >= 5 ? 'do' : 'da'} ${WEEKDAY_NAMES[weekday(last.local_date)]}`
          }`
        : '';
      reason = `${capitalizeFirst(fichaName(rotation, chosen))} é a próxima do rodízio${after}. ${faltam(remainingGym, 'de academia nesta semana')}.`;
    } else {
      const why =
        blockedReasons[0] ?? `${capitalizeFirst(dayName(rotation, nextUp))} treinou há pouco.`;
      reason = `${why} Hoje vai a ficha ${fichaLetter(rotation, chosen)}, e a ${fichaLetter(rotation, nextUp)} fica para o próximo treino.`;
    }
  } else if (
    !rotation &&
    plannedToday?.kind === 'gym' &&
    plannedToday.split_key &&
    filtered.includes(plannedToday.split_key)
  ) {
    chosen = plannedToday.split_key;
    reason = `Dia de ${splitLabel(chosen).toLowerCase()} no seu plano. ${faltam(remainingGym, 'de academia nesta semana')}.`;
  } else if (plannedToday?.kind !== 'gym' && remainingGym <= slotsLeft) {
    const why =
      plannedToday?.kind === 'run'
        ? 'As corridas da semana já foram. Hoje é descanso.'
        : 'Descanso planejado. Ele conta como cumprido.';
    return result('rest', 'Hoje: descanso', why);
  } else if (filtered.length > 0) {
    chosen = rotation
      ? (filtered[0] as SplitKey)
      : ([...filtered].sort(
          (a, b) => daysSinceSplit(today, sessions, b) - daysSinceSplit(today, sessions, a),
        )[0] as SplitKey);
    const since = daysSinceSplit(today, sessions, chosen);
    const parts: string[] = [];
    if (blockedReasons[0]) parts.push(blockedReasons[0]);
    else if (plannedToday?.kind !== 'gym') {
      parts.push(
        `${faltam(remainingGym, 'de academia')} e a semana tem ${slotsLeft} ${plural(slotsLeft, 'dia', 'dias')} de academia pela frente.`,
      );
    } else if (!rotation && plannedToday.split_key && plannedToday.split_key !== chosen) {
      parts.push(`${splitLabel(plannedToday.split_key)} já foi feito nesta semana.`);
    }
    if (rotation)
      parts.push(`${capitalizeFirst(fichaName(rotation, chosen))} é a próxima do rodízio.`);
    else
      parts.push(
        Number.isFinite(since)
          ? `${splitLabel(chosen)} está há ${since} dias parado.`
          : `${splitLabel(chosen)} ainda não entrou nesta semana.`,
      );
    reason = parts.join(' ');
  }

  if (!chosen) {
    const why = blockedReasons[0] ?? 'Os grupos que faltam treinaram há pouco.';
    return result('light', 'Hoje: descanso ou algo leve', `${why} Hoje descanso ou algo leve.`);
  }

  const overlap = overlapAlert(today, sessions, chosen);
  if (overlap) alerts.push(overlap);
  return result('gym', `Hoje: ${dayName(rotation, chosen)}`, reason, { split_key: chosen });
}

function recommendWithoutPlan(
  input: RecommendInput,
  alerts: Alert[],
  week: WeekCounts,
  todayDone: boolean,
  heavy: boolean,
): DayRecommendation {
  const { today } = input;
  const base = {
    run_type: null,
    alerts,
    today_done: todayDone,
    planned_today: null,
    week,
    excess: false,
  };
  if (heavy) {
    return {
      ...base,
      kind: 'light',
      split_key: null,
      headline: 'Hoje: descanso ou algo leve',
      reason: `${alerts.map((a) => a.text).join(' ')} Hoje descanso ou algo leve.`,
    };
  }
  const usual = [
    ...new Set(
      input.sessions
        .filter(
          (s) => s.split_key && s.split_key !== 'livre' && diffDays(s.local_date, today) <= 28,
        )
        .map((s) => s.split_key as SplitKey),
    ),
  ];
  const options = usual.filter((s) => daysSinceSplit(today, input.sessions, s) > 2);
  const chosen = options.sort(
    (a, b) => daysSinceSplit(today, input.sessions, b) - daysSinceSplit(today, input.sessions, a),
  )[0];
  if (!chosen) {
    return {
      ...base,
      kind: 'gym',
      split_key: null,
      headline: 'Hoje: treino livre',
      reason: 'Sem plano ainda. Monte o seu em Plano para eu sugerir o treino do dia.',
    };
  }
  return {
    ...base,
    kind: 'gym',
    split_key: chosen,
    headline: `Hoje: ${splitLabel(chosen).toLowerCase()}`,
    reason: `${splitLabel(chosen)} é o que está há mais tempo parado.`,
  };
}

export function deviationText(week: WeekCounts): string {
  const parts: string[] = [];
  if (week.done_gym > week.planned_gym) {
    parts.push(`${week.done_gym} de academia num plano de ${week.planned_gym}`);
  }
  if (week.done_run > week.planned_run) {
    parts.push(`${week.done_run} corridas num plano de ${week.planned_run}`);
  }
  if (parts.length === 0) return '';
  return `${capitalizeFirst(joinPt(parts))}. Excesso conta como desvio.`;
}

export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? '';
}
