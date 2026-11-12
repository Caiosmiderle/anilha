import { describe, expect, it } from 'vitest';
import { adjustWorkout, describeChange, type PlannedItem } from '../adjust';
import { EXERCISES_BY_ID } from '../exercises';
import { orderByGroup } from '../focus';
import { EXAMPLE_PARAMS } from '../fixtures/exampleWeek';
import { exercisesForMinutes, generatePlan, layoutWeek, volumeGroupOf } from '../generator';
import { splitHasLegs } from '../taxonomy';
import type { ExerciseDef, OnboardingParams, VolumeGroup } from '../types';

const BASE: OnboardingParams = {
  first_name: 'Ana',
  goal: 'hipertrofia',
  gym_days: 3,
  run_days: 2,
  force_gym_days: false,
  minutes: 60,
  equipment: ['halteres', 'barra', 'polia', 'maquina', 'peso_corporal', 'kettlebell', 'barra_fixa'],
  level: 'intermediario',
  spare_joints: [],
  returning: true,
  time: '06:00',
};

function weeklyVolume(plan: ReturnType<typeof generatePlan>): Map<VolumeGroup, number> {
  const v = new Map<VolumeGroup, number>();
  for (const day of plan.days) {
    if (day.kind !== 'gym') continue;
    const r = plan.routines.find((x) => x.split_key === day.split_key);
    for (const it of r?.items ?? []) {
      const e = EXERCISES_BY_ID.get(it.exercise_id);
      if (!e) continue;
      const g = volumeGroupOf(e);
      v.set(g, (v.get(g) ?? 0) + it.sets);
    }
  }
  return v;
}

function legsBeforeRun(plan: ReturnType<typeof generatePlan>): boolean {
  return plan.days.some(
    (d) =>
      d.kind === 'gym' &&
      splitHasLegs(d.split_key) &&
      plan.days[(d.weekday + 1) % 7]?.kind === 'run',
  );
}

describe('gerador de plano', () => {
  it('15. 3 academia + 2 corridas, 60 min, academia completa, modo retorno', () => {
    const plan = generatePlan(BASE);
    expect(plan.gym_per_week).toBe(3);
    expect(plan.run_per_week).toBe(2);
    expect(plan.days.filter((d) => d.kind === 'run')).toHaveLength(2);
    expect(legsBeforeRun(plan)).toBe(false);
    expect(plan.volume_cap).toBe(10);
    for (const [, sets] of weeklyVolume(plan)) expect(sets).toBeLessThanOrEqual(10);
    expect(plan.routines.map((r) => r.split_key)).toEqual([
      'costas_biceps',
      'peito_triceps',
      'perna',
    ]);
    expect(plan.reasons[0]).toBe(
      '3 dias de academia, então a divisão de sempre: costas e bíceps, peito e tríceps e perna.',
    );
    expect(plan.reasons.some((r) => r.startsWith('Modo retorno'))).toBe(true);
    // Never invents an initial load: items carry targets only.
    for (const r of plan.routines) {
      for (const it of r.items) {
        expect(it).not.toHaveProperty('load_kg');
        expect(it.target_min).toBeLessThanOrEqual(it.target_max);
      }
      // One muscle at a time, the multi-joint lift of each muscle before its isolation.
      const exs = r.items.map((i) => EXERCISES_BY_ID.get(i.exercise_id) as ExerciseDef);
      expect(exs[0]?.compound).toBe(true);
      expect(orderByGroup(exs, (e) => e).map((e) => e.id)).toEqual(exs.map((e) => e.id));
    }
  });

  it('o plano de exemplo põe perna longe da véspera de corrida e o longão no fim de semana', () => {
    const plan = generatePlan(EXAMPLE_PARAMS);
    expect(legsBeforeRun(plan)).toBe(false);
    const longRun = plan.days.find((d) => d.run_type === 'longo');
    expect(longRun && longRun.weekday >= 5).toBe(true);
  });

  it('nunca põe perna na véspera de corrida, em qualquer combinação', () => {
    for (let gym = 1; gym <= 4; gym += 1) {
      for (let run = 0; run + gym <= 7 && run <= 3; run += 1) {
        const plan = generatePlan({ ...BASE, gym_days: gym, run_days: run });
        expect(legsBeforeRun(plan)).toBe(false);
        expect(plan.days.filter((d) => d.kind === 'gym')).toHaveLength(gym);
      }
    }
  });

  it('divisão sai dos dias: 2 corpo inteiro, 4 superior e inferior, 5 sugere 4', () => {
    expect(generatePlan({ ...BASE, gym_days: 2 }).routines.map((r) => r.split_key)).toEqual([
      'corpo_inteiro_a',
      'corpo_inteiro_b',
    ]);
    expect(
      generatePlan({ ...BASE, gym_days: 4, run_days: 2 }).routines.map((r) => r.split_key),
    ).toEqual(['superior_a', 'inferior_a', 'superior_b', 'inferior_b']);
    const five = generatePlan({ ...BASE, gym_days: 5, run_days: 2 });
    expect(five.gym_per_week).toBe(4);
    expect(five.suggested_gym_days).toBe(4);
    expect(five.reasons[0]).toMatch(/Sugiro 4/);
    const forced = generatePlan({ ...BASE, gym_days: 5, run_days: 2, force_gym_days: true });
    expect(forced.gym_per_week).toBe(5);
  });

  it('volume intermediário respeita 10 a 16 séries e modo retorno vale sobre tudo', () => {
    const inter = generatePlan({
      ...BASE,
      returning: false,
      minutes: 90,
      gym_days: 4,
      run_days: 1,
    });
    for (const [, sets] of weeklyVolume(inter)) expect(sets).toBeLessThanOrEqual(16);
    const ret = generatePlan({
      ...BASE,
      returning: true,
      level: 'avancado',
      minutes: 90,
      gym_days: 4,
    });
    for (const [, sets] of weeklyVolume(ret)) expect(sets).toBeLessThanOrEqual(10);
  });

  it('tempo define a quantidade de exercícios', () => {
    expect(exercisesForMinutes(45)).toBe(5);
    expect(exercisesForMinutes(30)).toBe(3);
    expect(exercisesForMinutes(60)).toBe(6);
    const short = generatePlan({ ...BASE, minutes: 45, returning: false });
    for (const r of short.routines) expect(r.items.length).toBeLessThanOrEqual(5);
  });

  it('filtra por equipamento e por articulação a poupar', () => {
    const home = generatePlan({ ...BASE, equipment: ['halteres', 'peso_corporal'] });
    for (const r of home.routines) {
      for (const it of r.items) {
        expect(['halteres', 'peso_corporal']).toContain(
          EXERCISES_BY_ID.get(it.exercise_id)?.equipment,
        );
      }
    }
    const knee = generatePlan({ ...BASE, spare_joints: ['joelho'] });
    for (const r of knee.routines) {
      for (const it of r.items) {
        expect(EXERCISES_BY_ID.get(it.exercise_id)?.joints).not.toContain('joelho');
      }
    }
    expect(knee.reasons.some((r) => r.includes('o joelho'))).toBe(true);
  });

  it('layout impossível sem violar a regra cai para o melhor possível', () => {
    expect(layoutWeek(['perna'], 6, true)).toBeNull();
    expect(layoutWeek(['perna'], 6, false)).not.toBeNull();
  });
});

describe('ajuste do dia', () => {
  const item = (id: string): PlannedItem => ({
    exercise_id: id,
    sets: 3,
    target_min: 8,
    target_max: 12,
    rest_sec: 90,
    warmup_sets: 0,
  });

  it('16. "tenho só 30 min" num treino de 5 exercícios fica com os compostos principais, na ordem', () => {
    const items = [
      item('supino-reto-barra'),
      item('crucifixo-maquina'),
      item('supino-inclinado-halteres'),
      item('triceps-polia'),
      item('paralelas'),
    ];
    const r = adjustWorkout(items, { type: 'time', minutes: 30 });
    expect(r.items.map((i) => i.exercise_id)).toEqual([
      'supino-reto-barra',
      'supino-inclinado-halteres',
      'paralelas',
    ]);
    expect(r.changes).toEqual([
      { type: 'removed', exercise_id: 'crucifixo-maquina' },
      { type: 'removed', exercise_id: 'triceps-polia' },
    ]);
    expect(r.summary).toMatch(/^30 min: ficam os 3 principais, na mesma ordem/);
  });

  it('com menos compostos que o tempo permite, completa com isolados na ordem', () => {
    const items = [
      item('desenvolvimento-halteres-sentado'),
      item('elevacao-lateral'),
      item('encolhimento-halteres'),
      item('crucifixo-inverso'),
      item('elevacao-pernas-cadeira'),
    ];
    const r = adjustWorkout(items, { type: 'time', minutes: 30 });
    expect(r.items.map((i) => i.exercise_id)).toEqual([
      'desenvolvimento-halteres-sentado',
      'elevacao-lateral',
      'encolhimento-halteres',
    ]);
  });

  it('sem certo equipamento troca por equivalente e diz o que mudou', () => {
    const r = adjustWorkout([item('supino-reto-barra'), item('triceps-polia')], {
      type: 'no_equipment',
      equipment: 'barra',
    });
    expect(r.items[0]?.exercise_id).toBe('supino-reto-halteres');
    expect(describeChange(r.changes[0] as never)).toBe(
      'Supino reto com barra vira Supino reto com halteres',
    );
  });

  it('poupar articulação troca ou corta', () => {
    const r = adjustWorkout([item('agachamento-livre'), item('cadeira-extensora'), item('stiff')], {
      type: 'spare_joint',
      joint: 'joelho',
    });
    for (const it of r.items) {
      expect(EXERCISES_BY_ID.get(it.exercise_id)?.joints).not.toContain('joelho');
    }
    expect(r.changes.length).toBeGreaterThan(0);
  });

  it('focar em um grupo monta o treino com aquele grupo', () => {
    const r = adjustWorkout(
      [item('supino-reto-barra'), item('rosca-direta'), item('triceps-polia')],
      {
        type: 'focus',
        group: 'costas',
      },
    );
    expect(
      r.items.every((i) => EXERCISES_BY_ID.get(i.exercise_id)?.primary_group === 'costas'),
    ).toBe(true);
    expect(r.items.length).toBeGreaterThanOrEqual(3);
  });
});
