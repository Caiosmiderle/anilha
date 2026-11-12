import { addDays, diffDays, weekStart } from './dates';
import { capitalizeFirst, fmtNum } from './format';
import {
  nextLongRun,
  onRaceDay,
  RACE_RULES,
  raceKm,
  raceLabel,
  raceSchedule,
  recentLongestRun,
  roundKm,
  safeLongRun,
  weeksBefore,
  weeksLeft,
  type RaceWeek,
} from './race';
import type { CardioKind, Level, Race, RunMark, RunType } from './types';

/**
 * What each run of the week asks, from the runner's own level. Sources in docs/CIENCIA.md:
 * - Paces anchored to a recent race or hard run with the Daniels and Gilbert equations
 *   (VDOT): oxygen cost of a speed and the share of VO2max held for a duration.
 * - Most of the running easy and one quality run a week: polarized and pyramidal
 *   distributions give similar gains to recreational runners (Oliveira and colleagues, 2024).
 * - Intervals of 2 to 5 min near VO2max add up minutes at the top (Buchheit and Laursen,
 *   2013); threshold blocks train holding a hard pace for long.
 * - No run more than 10 % above the longest of the previous 30 days (Frandsen and
 *   colleagues, 2025); final stretch with less volume and the same intensity (Wang and
 *   colleagues, 2023).
 * - Without a pace, the talk test: speaking in full sentences marks easy running (Foster
 *   and colleagues, 2008).
 */

/** Oxygen cost (ml/kg/min) of running at `v` m/min. */
const vo2At = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** Share of VO2max that can be held for `t` minutes. */
const shareFor = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
/** Speed (m/min) whose oxygen cost is `vo2`. */
function speedFor(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** VDOT of a performance: 5 km in 19:57 is about 50. */
export function vdotOf(km: number, seconds: number): number {
  const t = seconds / 60;
  return vo2At((km * 1000) / t) / shareFor(t);
}

/** Seconds per km at a share of the VDOT. */
export function paceAt(vdot: number, share: number): number {
  return 60000 / speedFor(vdot * share);
}

/** Race time the VDOT predicts for a distance, in seconds. */
export function predictSeconds(vdot: number, km: number): number {
  let lo = km * 120;
  let hi = km * 1200;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (vdotOf(km, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export interface PaceZones {
  /** Fast and slow end of easy running, s/km. */
  easy: [number, number];
  /** About the pace held for an hour. */
  threshold: number;
  /** Near VO2max: about the pace held for 10 to 12 minutes. */
  interval: number;
}

export function paceZones(vdot: number): PaceZones {
  return {
    easy: [paceAt(vdot, 0.7), paceAt(vdot, 0.62)],
    threshold: paceAt(vdot, 0.88),
    interval: paceAt(vdot, 0.975),
  };
}

/** '5:07/km' */
export function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`;
}

/** '52:30', '1:52:30' */
export function fmtRaceTime(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** '25:30' or '1:52:30' into seconds; null when it does not read as a time. */
export function parseRaceTime(text: string): number | null {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const [, h, min, sec] = m;
  if (Number(sec) >= 60 || (h && Number(min) >= 60)) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(sec);
}

/** A time that makes sense for the distance: from elite to a walk (VDOT 20 to 85). */
export function markError(km: number, seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return 'Escreva o tempo como 25:30 ou 1:52:30';
  const v = vdotOf(km, seconds);
  if (v > 85) return 'Rápido demais para essa distância. Confira o tempo';
  if (v < 20) return 'Devagar demais para contar como prova ou teste. Confira o tempo';
  return null;
}

type RunHistory = {
  local_date: string;
  distance_km: number | null;
  duration_sec?: number;
  rpe?: number | null;
  run_type?: RunType;
  activity?: CardioKind | null;
};

export interface Fitness {
  vdot: number;
  /** A mark the person typed, or a hard continuous run of the history. */
  source: 'marca' | 'treino';
  km: number;
  seconds: number;
  date: string;
}

/**
 * Current level: the best of a recent mark (up to 4 months) and the hard continuous runs of
 * the last 8 weeks (effort 8 or more, 3 km or longer, not intervals: their average pace
 * mixes the recoveries in). Null without either: the runs go by effort.
 */
export function runFitness(
  mark: RunMark | null | undefined,
  runs: RunHistory[],
  today: string,
): Fitness | null {
  const options: Fitness[] = [];
  if (mark && mark.date <= today && mark.date >= addDays(today, -120)) {
    options.push({
      vdot: vdotOf(mark.distance_km, mark.seconds),
      source: 'marca',
      km: mark.distance_km,
      seconds: mark.seconds,
      date: mark.date,
    });
  }
  for (const r of runs) {
    if ((r.activity ?? 'corrida') !== 'corrida' || r.distance_km == null || !r.duration_sec)
      continue;
    if (r.local_date > today || r.local_date < addDays(today, -56)) continue;
    if ((r.rpe ?? 0) < 8 || r.distance_km < 3 || r.run_type === 'intervalado') continue;
    if (r.duration_sec < 600 || r.duration_sec > 6 * 3600) continue;
    options.push({
      vdot: vdotOf(r.distance_km, r.duration_sec),
      source: 'treino',
      km: r.distance_km,
      seconds: r.duration_sec,
      date: r.local_date,
    });
  }
  const valid = options.filter((o) => o.vdot >= 20 && o.vdot <= 85);
  return valid.reduce<Fitness | null>((best, o) => (!best || o.vdot > best.vdot ? o : best), null);
}

export type SessionKind =
  'leve' | 'longo' | 'intervalado' | 'limiar' | 'fartlek' | 'abertura' | 'prova';

export interface RunStep {
  label: string;
  detail: string;
}

export interface RunSession {
  kind: SessionKind;
  /** 'Hoje: intervalado, 5 x 3 min' */
  headline: string;
  steps: RunStep[];
  /** Why this run, and where the race stands. */
  why: string;
  /** Planned distance, when there is one. */
  km: number | null;
}

export interface SessionInput {
  type: RunType;
  today: string;
  level: Level;
  returning: boolean;
  race?: Race | null;
  fitness: Fitness | null;
  runs: RunHistory[];
}

const EFFORT = {
  easy: 'esforço 3 a 4 de 10, dá para conversar em frases inteiras',
  threshold: 'esforço 6 a 7 de 10, só frases curtas',
  interval: 'esforço 8 a 9 de 10, poucas palavras',
  race: 'o ritmo da prova',
};

const VO2_LADDER: [number, number, number][] = [
  // reps, minutes, recovery minutes
  [6, 2, 2],
  [5, 3, 2],
  [6, 3, 2],
  [5, 4, 2.5],
  [4, 5, 3],
];
const THRESHOLD_LADDER: [number, number, number][] = [
  [3, 8, 2],
  [4, 8, 2],
  [3, 10, 2],
  [3, 12, 2],
  [2, 15, 3],
];
const FARTLEK_LADDER: [number, number, number][] = [
  [6, 1, 2],
  [8, 1, 2],
  [6, 2, 2],
  [5, 3, 2],
];
/** Minutes of an easy run by level. */
const EASY_MIN: Record<Level, number> = { iniciante: 30, intermediario: 40, avancado: 50 };
/** Long run without a race: by time when there is no history, and a ceiling to hold at. */
const LONG_MIN: Record<Level, number> = { iniciante: 40, intermediario: 60, avancado: 75 };
const LONG_CEILING: Record<Level, number> = { iniciante: 8, intermediario: 12, avancado: 16 };

/** Week of a 4-week cycle without a race: the fourth is lighter. */
function cycleWeek(today: string): number {
  return Math.floor(diffDays('2026-01-05', weekStart(today)) / 7) % 4;
}

function minutes(n: number): string {
  return `${fmtNum(n)} min`;
}

/**
 * The run of the day for a plan run type: what to do, at what pace (or effort), and why.
 * The plan says the type; the level, the history and the race say the rest.
 */
export function runSession(input: SessionInput): RunSession {
  const { type, today, level, returning, race, fitness, runs } = input;
  const zones = fitness ? paceZones(fitness.vdot) : null;
  const easyText = zones
    ? `leve, ${fmtPace(zones.easy[0])} a ${fmtPace(zones.easy[1])} (${EFFORT.easy})`
    : `leve, ${EFFORT.easy}`;
  const longest = recentLongestRun(runs, today);
  const cap = safeLongRun(longest);

  const ahead = race && race.date >= today ? race : null;
  const raceWeeks = ahead
    ? raceSchedule(ahead, today, recentLongestRun(runs, ahead.from ?? today))
    : [];
  const week: RaceWeek | null = raceWeeks[0] ?? null;
  const racePace =
    ahead && fitness
      ? predictSeconds(fitness.vdot, raceKm(ahead.distance_km)) / raceKm(ahead.distance_km)
      : null;
  const left = ahead
    ? ` ${capitalizeFirst(weeksLeft(weeksBefore(ahead, today)))} para a prova de ${raceLabel(ahead.distance_km)}.`
    : '';

  // Race day and race week.
  if (ahead && ahead.date === today) {
    const steps: RunStep[] = racePace
      ? [
          {
            label: 'Primeiros 2 km',
            detail: `uns 5 s/km mais devagar que ${fmtPace(racePace)}`,
          },
          { label: 'Depois', detail: `${fmtPace(racePace)}, e acelere no fim se sobrar` },
        ]
      : [{ label: raceLabel(ahead.distance_km), detail: 'comece contido e acelere no fim' }];
    return {
      kind: 'prova',
      headline: `Hoje: prova de ${ahead.distance_km} km`,
      steps,
      why: 'Boa prova! Largar rápido demais é o que mais faz quebrar na segunda metade.',
      km: ahead.distance_km,
    };
  }
  if (week?.kind === 'race' && ahead) {
    const when = `A prova de ${raceLabel(ahead.distance_km)} é ${onRaceDay(ahead.date)}.`;
    if (type === 'intervalado')
      return {
        kind: 'abertura',
        headline: 'Hoje: leve com 4 tiros curtos',
        steps: [
          { label: '15 min', detail: easyText },
          {
            label: '4 x 1 min',
            detail: `${racePace ? fmtPace(racePace) : EFFORT.race}, com 2 min leve entre`,
          },
          { label: '5 min', detail: 'leve' },
        ],
        why: `Semana da prova: pouco volume e um toque de ritmo para chegar solto. ${when}`,
        km: null,
      };
    return {
      kind: 'leve',
      headline: 'Hoje: corrida leve de 25 min',
      steps: [{ label: minutes(25), detail: easyText }],
      why: `Semana da prova: corridas leves e curtas. ${when}`,
      km: null,
    };
  }

  const taper = week?.kind === 'taper';
  const cutback = week ? week.kind === 'cutback' : cycleWeek(today) === 3;

  if (type === 'longo') {
    let km: number | null;
    let why: string;
    if (week) {
      km = week.long_km;
      why = {
        base: 'Sem pressa: firmar a base antes de o longão subir.',
        build: 'O longão sobe até 10 % por semana: mais que isso aumenta o risco de lesão.',
        cutback: 'Semana mais leve, para o corpo absorver o treino. Na próxima, volta a subir.',
        peak: 'O maior longão do ciclo. Depois vem a reta final, com menos volume.',
        taper: 'Reta final: menos volume e a mesma intensidade, para chegar descansado.',
        race: '',
      }[week.kind];
    } else if (longest != null) {
      const ceiling = LONG_CEILING[level];
      km = longest >= ceiling ? roundKm(longest) : Math.min(ceiling, nextLongRun(longest));
      if (cutback) km = roundKm(km * 0.75);
      why = cutback
        ? 'Semana mais leve, a cada 4: o corpo absorve o treino.'
        : longest >= ceiling
          ? 'Longão mantido: já é uma boa base para quem não treina para uma prova.'
          : 'O longão sobe até 10 % sobre o maior dos últimos 30 dias, o limite seguro.';
    } else {
      km = null;
      why = 'Sem corridas registradas nos últimos 30 dias: o longão vai por tempo, sempre leve.';
    }
    if (km != null && cap != null && km > cap) {
      why = `O ciclo pede ${fmtNum(km)} km, mas seu maior longão dos últimos 30 dias foi de ${fmtNum(longest ?? 0)} km. Ir além de 10 % a mais aumenta o risco de lesão.`;
      km = cap;
    } else if (
      km != null &&
      week &&
      longest == null &&
      week.long_km > RACE_RULES[ahead?.distance_km ?? 5].start
    ) {
      why +=
        ' Sem corridas registradas nos últimos 30 dias: se não vem correndo essa distância, faça menos.';
    }
    if (km == null) {
      const min = LONG_MIN[level] - (returning ? 15 : 0);
      return {
        kind: 'longo',
        headline: `Hoje: longão de ${min} min`,
        steps: [{ label: minutes(min), detail: easyText }],
        why: why + left,
        km: null,
      };
    }
    // Half and marathon: in the last weeks of the climb, the end of the long run at race pace.
    const specific =
      ahead &&
      racePace &&
      (ahead.distance_km === 21 || ahead.distance_km === 42) &&
      (week?.kind === 'build' || week?.kind === 'peak') &&
      weeksBefore(ahead, today) <= RACE_RULES[ahead.distance_km].taper.length + 6;
    const finish = specific ? Math.max(2, Math.round(km * 0.25)) : 0;
    const steps: RunStep[] = finish
      ? [
          { label: `${fmtNum(km - finish)} km`, detail: easyText },
          {
            label: `${fmtNum(finish)} km finais`,
            detail: `no ritmo da prova, ${fmtPace(racePace as number)}`,
          },
        ]
      : [{ label: `${fmtNum(km)} km`, detail: easyText }];
    return {
      kind: 'longo',
      headline: `Hoje: longão de ${fmtNum(km)} km`,
      steps,
      why:
        (finish ? `${why} O final no ritmo da prova ensina o corpo a segurá-lo cansado.` : why) +
        left,
      km,
    };
  }

  if (type === 'intervalado') {
    const done = runs.filter(
      (r) =>
        r.run_type === 'intervalado' && r.local_date < today && r.local_date >= addDays(today, -42),
    ).length;
    const easyLevel = returning || level === 'iniciante';
    const distance = ahead?.distance_km ?? null;
    const kind: SessionKind = easyLevel
      ? 'fartlek'
      : distance === 21 || distance === 42
        ? 'limiar'
        : distance === 5
          ? 'intervalado'
          : Math.floor(diffDays('2026-01-05', weekStart(today)) / 7) % 2 === 0
            ? 'intervalado'
            : 'limiar';
    const ladder =
      kind === 'fartlek' ? FARTLEK_LADDER : kind === 'limiar' ? THRESHOLD_LADDER : VO2_LADDER;
    const step = Math.max(0, Math.min(ladder.length - 1, done - (cutback ? 1 : 0)));
    const [baseReps, dur, rest] = ladder[step] as [number, number, number];
    // Final stretch: fewer repeats, same pace (Wang and colleagues, 2023).
    const reps = taper ? Math.max(2, Math.ceil(baseReps * 0.6)) : baseReps;
    const pace =
      kind === 'fartlek'
        ? 'esforço 7 a 8 de 10, forte mas controlado'
        : kind === 'limiar'
          ? zones
            ? `${fmtPace(zones.threshold)} (${EFFORT.threshold})`
            : EFFORT.threshold
          : zones
            ? `${fmtPace(zones.interval)} (${EFFORT.interval})`
            : EFFORT.interval;
    const label = { fartlek: 'Fartlek', limiar: 'Limiar', intervalado: 'Intervalado' }[
      kind as 'fartlek' | 'limiar' | 'intervalado'
    ];
    const why = {
      fartlek:
        'Trechos fortes curtos e muito trote entre: o corpo aprende a acelerar sem o desgaste de um intervalado.',
      limiar:
        'Blocos no limiar, o ritmo que daria para segurar por cerca de 1 hora: treinam manter ritmo forte por muito tempo, o que mais pesa em provas longas.',
      intervalado:
        'Tiros de 2 a 5 min perto do VO2máx somam vários minutos no limite de cima, o estímulo que mais sobe o condicionamento.',
    }[kind as 'fartlek' | 'limiar' | 'intervalado'];
    return {
      kind,
      headline: `Hoje: ${label.toLowerCase()}, ${reps} x ${minutes(dur)}`,
      steps: [
        { label: 'Aquecimento', detail: `${minutes(easyLevel ? 10 : 15)} leve` },
        {
          label: `${reps} x ${minutes(dur)}`,
          detail: `${pace}, com ${minutes(rest)} de trote entre`,
        },
        { label: 'Desaquecimento', detail: `${minutes(10)} leve` },
      ],
      why:
        (taper ? 'Reta final: menos repetições, o mesmo ritmo. ' : '') +
        why +
        (cutback && !taper ? ' Semana mais leve: um degrau abaixo.' : '') +
        left,
      km: null,
    };
  }

  // Easy run: most of the running of the week.
  let min = EASY_MIN[level] - (returning ? 10 : 0);
  if (taper) min = Math.round(min * 0.65);
  else if (cutback) min = Math.round(min * 0.8);
  if (zones && cap != null) {
    const mid = (zones.easy[0] + zones.easy[1]) / 2;
    const most = Math.floor((cap * mid) / 60 / 5) * 5;
    if (most >= 20) min = Math.min(min, most);
  }
  return {
    kind: 'leve',
    headline: `Hoje: corrida leve de ${min} min`,
    steps: [{ label: minutes(min), detail: easyText }],
    why:
      (taper
        ? 'Reta final: corridas mais curtas, para chegar descansado. '
        : cutback
          ? 'Semana mais leve. '
          : '') +
      'Leve de verdade: é a maior parte da semana e constrói a base com pouco desgaste.' +
      left,
    km: null,
  };
}
