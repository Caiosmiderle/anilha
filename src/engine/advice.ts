import { addDays, diffDays, formatDDMM } from './dates';
import { capitalizeFirst } from './format';
import { EXERCISES } from './exercises';
import { isAvailable, rankSubstitutes } from './substitute';
import { JOINT_LABEL, MUSCLE_LABEL } from './taxonomy';
import type { Equipment, ExerciseDef, Joint } from './types';

export const PAIN_WINDOW_DAYS = 14;

export interface PainReport {
  local_date: string;
  exercise_id: string;
  joint: Joint;
}

export interface PainAdvice {
  joint: Joint;
  reported_on: string;
  source_exercise_id: string;
  alternatives: ExerciseDef[];
  action: 'trocar' | 'cortar';
  text: string;
}

function jointWithArticle(j: Joint): string {
  return j === 'lombar' ? 'na lombar' : `no ${JOINT_LABEL[j]}`;
}

/**
 * When a joint hurt recently, exercises that load it get a suggestion to swap
 * (same movement, no load on that joint) or cut.
 */
export function painAdvice(input: {
  exercise: ExerciseDef;
  reports: PainReport[];
  today: string;
  library?: ExerciseDef[];
  available?: Equipment[];
  excludeIds?: string[];
}): PainAdvice | null {
  const { exercise, today } = input;
  const recent = input.reports
    .filter((r) => {
      const age = diffDays(r.local_date, today);
      return age >= 0 && age <= PAIN_WINDOW_DAYS && exercise.joints.includes(r.joint);
    })
    .sort((a, b) => b.local_date.localeCompare(a.local_date));
  const report = recent[0];
  if (!report) return null;
  const sourceName =
    (input.library ?? []).find((e) => e.id === report.exercise_id)?.name ??
    (report.exercise_id === exercise.id ? exercise.name : null);
  const opts = {
    library: input.library,
    available: input.available,
    spareJoints: [report.joint],
    excludeIds: input.excludeIds,
  };
  let alternatives = rankSubstitutes(exercise, opts).filter(
    (e) => e.primary_group === exercise.primary_group,
  );
  if (alternatives.length === 0) {
    // Same group and same kind of movement, without that joint.
    alternatives = (input.library ?? EXERCISES).filter(
      (e) =>
        e.id !== exercise.id &&
        e.primary_group === exercise.primary_group &&
        e.compound === exercise.compound &&
        isAvailable(e, opts),
    );
  }
  alternatives = alternatives.slice(0, 3);
  const when = `Dor ${jointWithArticle(report.joint)} marcada em ${formatDDMM(report.local_date)}${sourceName ? ` no ${sourceName.toLowerCase()}` : ''}.`;
  if (alternatives.length > 0) {
    return {
      joint: report.joint,
      reported_on: report.local_date,
      source_exercise_id: report.exercise_id,
      alternatives,
      action: 'trocar',
      text: `${when} Troque por ${(alternatives[0] as ExerciseDef).name.toLowerCase()} ou corte hoje.`,
    };
  }
  return {
    joint: report.joint,
    reported_on: report.local_date,
    source_exercise_id: report.exercise_id,
    alternatives: [],
    action: 'cortar',
    text: `${when} Este também carrega ${report.joint === 'lombar' ? 'a lombar' : `o ${JOINT_LABEL[report.joint]}`}: melhor cortar hoje.`,
  };
}

export interface RecentExercise {
  local_date: string;
  exercise: Pick<ExerciseDef, 'id' | 'name' | 'muscles'>;
}

/**
 * Same main muscle trained yesterday: suggest skipping or going lighter.
 * Example: reverse fly on Saturday, reverse fly planned on Sunday.
 */
export function yesterdayOverlap(input: {
  exercise: Pick<ExerciseDef, 'id' | 'muscles'>;
  today: string;
  recent: RecentExercise[];
}): string | null {
  const yesterday = addDays(input.today, -1);
  const main = input.exercise.muscles[0];
  if (!main) return null;
  const hit = input.recent.find(
    (r) => r.local_date === yesterday && r.exercise.muscles.includes(main),
  );
  if (!hit) return null;
  const same = hit.exercise.id === input.exercise.id;
  return same
    ? `Feito ontem. Pule hoje ou faça leve.`
    : `${capitalizeFirst(MUSCLE_LABEL[main])} já trabalhou ontem no ${hit.exercise.name.toLowerCase()}. Pule ou alivie.`;
}
