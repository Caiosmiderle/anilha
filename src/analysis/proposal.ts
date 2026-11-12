import { executeTool, type Proposal } from '../agent/execute';
import { buildAgentContext } from '../agent/live';
import { EXERCISES } from '../engine/exercises';
import type {
  OnboardingParams,
  PlanRow,
  RoutineItemRow,
  RoutineRow,
  SessionItemRow,
  SessionRow,
} from '../engine/types';
import type { AnalysisAdjustment } from './contract';
import { validAdjustment } from './contract';

/** Local identifiers never enter the model context. */
export interface AnalysisBinding {
  session: SessionRow;
  items: SessionItemRow[];
  routine: RoutineRow | null;
  routineItems: RoutineItemRow[];
  routines?: RoutineRow[];
  allRoutineItems?: RoutineItemRow[];
  params: OnboardingParams | null;
  plan: PlanRow | null;
}
export function analysisProposal(
  a: AnalysisAdjustment | null,
  b: AnalysisBinding,
): Proposal | null {
  if (
    !a ||
    !validAdjustment(
      a,
      b.items.length,
      EXERCISES.map((e) => e.id),
    ) ||
    !b.routine ||
    !b.params ||
    b.routine.archived ||
    b.routine.deleted
  )
    return null;
  const sessionItem = b.items[a.slot];
  if (!sessionItem) return null;
  const exercise = sessionItem.original_exercise_id ?? sessionItem.exercise_id;
  // The existing tool addresses an exercise ID, so ambiguous duplicate rows are refused.
  if (b.routineItems.filter((i) => i.exercise_id === exercise).length !== 1) return null;
  if (
    a.operation === 'trocar' &&
    (a.replacement === exercise || b.routineItems.some((i) => i.exercise_id === a.replacement))
  )
    return null;
  const ctx = buildAgentContext({
    params: b.params,
    plan: b.plan,
    routines: b.routines ?? [b.routine],
    items: b.allRoutineItems ?? b.routineItems,
    health: false,
    returnMode: false,
  });
  return executeTool(
    'editar_ficha',
    {
      ficha_id: b.routine.id,
      mudancas: [
        {
          tipo: a.operation,
          exercicio_id: exercise,
          novo_exercicio_id: a.replacement,
          series: a.sets,
          repeticoes_min: a.min,
          repeticoes_max: a.max,
          descanso_segundos: null,
          posicao: null,
        },
      ],
      motivo: 'Análise do treino concluído',
    },
    ctx,
  ).proposal;
}
