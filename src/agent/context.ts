import { EXERCISES_BY_ID } from '../engine/exercises';
import { focusesOf, volumeLabel } from '../engine/generator';
import type { OnboardingParams, VolumeGroup } from '../engine/types';

/** A ficha as the agent sees it: its id, name and exercises. */
export interface ContextFicha {
  id: string;
  name: string;
  items: {
    exercise_id: string;
    sets: number;
    target_min: number;
    target_max: number;
    rest_sec: number;
  }[];
  /** Times the ficha comes in a week; 1 when each ficha has its own day. */
  per_week?: number;
}

export interface AgentContext {
  params: OnboardingParams;
  fichas: ContextFicha[];
  volume: Partial<Record<VolumeGroup, number>>;
  /** Health data allowed: only then do pains and joints to spare go to the model. */
  health: boolean;
  returnMode: boolean;
}

const GOAL: Record<OnboardingParams['goal'], string> = {
  hipertrofia: 'ganhar massa',
  emagrecimento: 'emagrecer',
  condicionamento: 'condicionamento',
  saude: 'saúde geral',
  forca: 'força',
  corrida: 'correr provas',
};

/** The first message of every conversation: who the person is and what they train today. */
export function contextText(c: AgentContext): string {
  const p = c.params;
  const lines = [
    `Pessoa: ${p.first_name}. Objetivo: ${GOAL[p.goal]}. Nível: ${p.level}. ${p.gym_days} dias de academia por semana, ${p.minutes} min por treino.`,
    `Foco: ${focusesOf(p).join(', ') || 'equilibrado'}. Divisão: ${p.split_style ?? 'automática'}${p.fichas ? `, ${p.fichas} fichas` : ''}.`,
    p.gender && p.gender !== 'nao_informar' ? `Gênero informado: ${p.gender}.` : null,
    `Modo retorno: ${c.returnMode ? 'ligado' : 'desligado'}. Dados de saúde: ${c.health ? 'permitidos' : 'não permitidos'}.`,
    c.health && p.spare_joints.length
      ? `Articulações a poupar: ${p.spare_joints.join(', ')}.`
      : null,
    '',
    'Fichas em uso:',
    ...c.fichas.map(
      (f) =>
        `- ficha_id ${f.id}, "${f.name}": ` +
        f.items
          .map(
            (i) =>
              `${i.exercise_id} (${EXERCISES_BY_ID.get(i.exercise_id)?.name ?? i.exercise_id}) ${i.sets}x${i.target_min}-${i.target_max}, descanso ${i.rest_sec} s`,
          )
          .join('; '),
    ),
    '',
    `Séries por semana no plano: ${Object.entries(c.volume)
      .map(([g, n]) => `${volumeLabel(g as VolumeGroup).toLowerCase()} ${n}`)
      .join(', ')}.`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}
