import { EXERCISES_BY_ID } from './exercises';
import { joinPt } from './format';
import { FOCUS_GROUPS, focusesOf, volumeGroupOf, volumeLabel, volumeRange } from './generator';
import type { OnboardingParams, VolumeGroup } from './types';

/**
 * Risks of a change the person asks for, from the same rules the generator follows (each
 * with its source in docs/CIENCIA.md). The app shows them and the person decides: a risk
 * never blocks a change.
 */
export interface Risk {
  text: string;
  source: string;
}

export interface WeeklyFicha {
  items: { exercise_id: string; sets: number }[];
  /** How many times the ficha comes in a week (a rotation can make it fractional). */
  per_week: number;
}

/** Work sets a week per volume group, counted as the generator counts them. */
export function weeklyVolume(fichas: WeeklyFicha[]): Map<VolumeGroup, number> {
  const out = new Map<VolumeGroup, number>();
  for (const f of fichas) {
    for (const it of f.items) {
      const e = EXERCISES_BY_ID.get(it.exercise_id);
      if (!e) continue;
      const g = volumeGroupOf(e);
      out.set(g, (out.get(g) ?? 0) + it.sets * f.per_week);
    }
  }
  return out;
}

/** The generator's weekly ceiling for a group: the level's range, +2 for women, +4 in focus. */
export function weeklyCap(p: OnboardingParams, g: VolumeGroup): number {
  const [, cap] = volumeRange(p.level, p.returning, p.goal, p.age_range);
  const focus = new Set(focusesOf(p).flatMap((f) => FOCUS_GROUPS[f]));
  return cap + (p.gender === 'feminino' ? 2 : 0) + (focus.has(g) ? 4 : 0);
}

export const VOLUME_SOURCE =
  'Volume semanal por grupo: mais séries rendem mais, com retorno cada vez menor (Schoenfeld, Ogborn e Krieger, 2017; Pelland e colegas); o teto de cada nível é escolha do app.';

/** Groups the change pushes past the weekly ceiling. */
export function volumeRisks(
  before: Map<VolumeGroup, number>,
  after: Map<VolumeGroup, number>,
  p: OnboardingParams,
): Risk[] {
  const out: Risk[] = [];
  for (const [g, n] of after) {
    const cap = weeklyCap(p, g);
    const was = before.get(g) ?? 0;
    if (n > cap && n > was) {
      out.push({
        text: `${volumeLabel(g)}: ${fmt(n)} séries por semana, acima de ${cap}, o teto que o app usa para o seu nível. Acima disso a recuperação costuma não acompanhar e o ganho para de crescer.`,
        source: VOLUME_SOURCE,
      });
    }
  }
  return out;
}

/**
 * Weekly sets that still hold a muscle: young adults kept size and strength for 32 weeks
 * on a ninth of their training, 1 set per exercise once a week, with the load kept; from 60
 * on the muscle shrank on that, and about 2 sessions of 2 to 3 sets are needed.
 */
export function maintenanceFloor(p: OnboardingParams): number {
  return p.age_range === '60+' ? 6 : 3;
}

export const MAINTENANCE_SOURCE =
  'Manter custa bem menos que ganhar, desde que a carga continue boa (Bickel, Cross e Bamman, 2011; Spiering e colegas, 2021); depois dos 60 é preciso mais.';

/**
 * Groups the change takes below what grows them: at maintenance, or below even that. One
 * note for all the groups in each case, not one per group.
 */
export function maintenanceRisks(
  before: Map<VolumeGroup, number>,
  after: Map<VolumeGroup, number>,
  p: OnboardingParams,
): Risk[] {
  const [grow] = volumeRange(p.level, p.returning, p.goal, p.age_range);
  const floor = maintenanceFloor(p);
  const older = p.age_range === '60+';
  const below: [VolumeGroup, number][] = [];
  const holding: [VolumeGroup, number][] = [];
  for (const [g, was] of before) {
    const n = after.get(g) ?? 0;
    if (n >= was || n >= grow) continue;
    if (n < floor) below.push([g, n]);
    else if (!older) holding.push([g, n]);
  }
  const out: Risk[] = [];
  if (below.length) {
    out.push({
      text: older
        ? `${groupsText(below)} por semana. Depois dos 60, manter o músculo pede uns 2 treinos com 2 a 3 séries por exercício; com menos, ele tende a diminuir.`
        : `${groupsText(below)} por semana, abaixo até do que costuma manter o músculo. Com tão pouco, ele pode diminuir.`,
      source: MAINTENANCE_SOURCE,
    });
  }
  if (holding.length) {
    out.push({
      text: `${groupsText(holding)} por semana, no nível de manter, não de ganhar (para ganhar, o app usa ${grow} ou mais). Até uns 60 anos, isso costuma bastar para não perder enquanto outro grupo é prioridade.`,
      source: MAINTENANCE_SOURCE,
    });
  }
  return out;
}

/** "Peito: 4 séries" or "Peito, ombros e bíceps: 4 a 8 séries". */
function groupsText(list: [VolumeGroup, number][]): string {
  const names = list.map(([g], i) => (i ? volumeLabel(g).toLowerCase() : volumeLabel(g)));
  const values = list.map(([, n]) => n);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return `${joinPt(names)}: ${lo === hi ? fmt(lo) : `${fmt(lo)} a ${fmt(hi)}`} séries`;
}

/** Every risk of going from one week to the other. */
export function weekRisks(
  before: Map<VolumeGroup, number>,
  after: Map<VolumeGroup, number>,
  p: OnboardingParams,
): Risk[] {
  return [...volumeRisks(before, after, p), ...maintenanceRisks(before, after, p)];
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
