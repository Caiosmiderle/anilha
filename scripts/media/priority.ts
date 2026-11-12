/**
 * The exercises that show up most in generated plans, for curating videos by hand first.
 * Plans for every mix of goal, focus, days, place and level (all weighed the same), each
 * exercise counted by how many times a week it is done.
 *
 *   npx tsx scripts/media/priority.ts [quantos]
 */
import { EXERCISES_BY_ID } from '../../src/engine/exercises';
import { generatePlan, splitFocus, suggestedSplit } from '../../src/engine/generator';
import { ALL_EQUIPMENT } from '../../src/engine/taxonomy';
import type {
  Equipment,
  Goal,
  Level,
  OnboardingParams,
  TrainingFocus,
} from '../../src/engine/types';

const GOALS: Goal[] = [
  'hipertrofia',
  'emagrecimento',
  'condicionamento',
  'saude',
  'forca',
  'corrida',
];
const FOCI: TrainingFocus[][] = [
  ['equilibrado'],
  ['pernas'],
  ['costas_ombros'],
  ['peito_bracos'],
  ['abdomen'],
];
const PLACES: Equipment[][] = [
  [...ALL_EQUIPMENT],
  ['halteres', 'polia', 'peso_corporal', 'barra_fixa'],
  ['halteres', 'peso_corporal'],
];
const LEVELS: Level[] = ['iniciante', 'intermediario', 'avancado'];

const count = new Map<string, number>();
let plans = 0;
for (const goal of GOALS)
  for (const focus of FOCI)
    for (const gym_days of [2, 3, 4, 5])
      for (const equipment of PLACES)
        for (const level of LEVELS) {
          const p: OnboardingParams = {
            first_name: 'x',
            goal,
            gym_days,
            run_days: goal === 'corrida' ? 2 : 0,
            force_gym_days: false,
            minutes: 60,
            equipment,
            level,
            spare_joints: [],
            returning: false,
            time: '07:00',
            focus,
          };
          const s = suggestedSplit(gym_days, splitFocus(p));
          const plan = generatePlan({ ...p, split_style: s.style, fichas: s.fichas });
          plans += 1;
          const perWeek = new Map<string, number>();
          const rotation = plan.rules.rotation;
          if (rotation) for (const k of rotation) perWeek.set(k, gym_days / rotation.length);
          else
            for (const d of plan.days)
              if (d.kind === 'gym' && d.split_key)
                perWeek.set(d.split_key, (perWeek.get(d.split_key) ?? 0) + 1);
          for (const r of plan.routines)
            for (const it of r.items)
              count.set(
                it.exercise_id,
                (count.get(it.exercise_id) ?? 0) + (perWeek.get(r.split_key) ?? 1),
              );
        }

const total = [...count.values()].reduce((a, b) => a + b, 0);
const n = Number(process.argv[2] ?? 40);
const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
let acc = 0;
console.log(`${plans} planos gerados.\n`);
console.log('| # | Exercício | id | Parte das séries | Acumulado |');
console.log('| --- | --- | --- | --- | --- |');
top.forEach(([id, c], i) => {
  acc += c;
  const pct = (x: number) => `${((x / total) * 100).toFixed(1).replace('.', ',')}%`;
  console.log(
    `| ${i + 1} | ${EXERCISES_BY_ID.get(id)?.name ?? id} | \`${id}\` | ${pct(c)} | ${pct(acc)} |`,
  );
});
