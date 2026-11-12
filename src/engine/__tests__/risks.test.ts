import { describe, expect, it } from 'vitest';
import { maintenanceFloor, maintenanceRisks, volumeRisks, weeklyCap, weeklyVolume } from '../risks';
import type { OnboardingParams } from '../types';

const p: OnboardingParams = {
  first_name: 'Ana',
  goal: 'hipertrofia',
  gym_days: 4,
  run_days: 0,
  force_gym_days: false,
  minutes: 60,
  equipment: ['halteres', 'barra', 'polia', 'maquina', 'peso_corporal'],
  level: 'intermediario',
  spare_joints: [],
  returning: false,
  time: '18:00',
};

describe('riscos de volume: o mesmo teto do gerador', () => {
  it('teto: faixa do nível, mais 2 para quem informa feminino, mais 4 nos grupos do foco', () => {
    expect(weeklyCap(p, 'biceps')).toBe(16);
    expect(weeklyCap({ ...p, gender: 'feminino' }, 'biceps')).toBe(18);
    expect(weeklyCap({ ...p, gender: 'feminino', focus: ['pernas'] }, 'quadriceps')).toBe(22);
    expect(weeklyCap({ ...p, level: 'iniciante' }, 'peito')).toBe(10);
  });

  it('volume: séries de trabalho por grupo, contando quantas vezes a ficha vem na semana', () => {
    const v = weeklyVolume([
      { items: [{ exercise_id: 'rosca-direta', sets: 3 }], per_week: 2 },
      { items: [{ exercise_id: 'rosca-martelo', sets: 3 }], per_week: 1 },
    ]);
    expect(v.get('biceps')).toBe(9);
  });

  it('avisa só o grupo que a mudança leva acima do teto', () => {
    const before = weeklyVolume([
      { items: [{ exercise_id: 'rosca-direta', sets: 3 }], per_week: 2 },
    ]);
    const after = weeklyVolume([
      { items: [{ exercise_id: 'rosca-direta', sets: 10 }], per_week: 2 },
    ]);
    const risks = volumeRisks(before, after, p);
    expect(risks).toHaveLength(1);
    expect(risks[0]?.text).toMatch(/^Bíceps: 20 séries por semana, acima de 16/);
    expect(risks[0]?.source).toMatch(/Schoenfeld/);
    expect(volumeRisks(before, before, p)).toEqual([]);
  });
});

describe('riscos de manutenção: quando um grupo cai para o nível de manter', () => {
  const before = new Map([['peito', 9] as const]);

  it('até 60 anos: abaixo da faixa de ganhar e acima de 3 séries é nível de manter', () => {
    const risks = maintenanceRisks(before, new Map([['peito', 4] as const]), p);
    expect(risks).toHaveLength(1);
    expect(risks[0]?.text).toMatch(/^Peito: 4 séries por semana, no nível de manter/);
    expect(risks[0]?.source).toMatch(/Bickel/);
  });

  it('até 60 anos: abaixo de 3 séries, nem manter costuma dar', () => {
    const risks = maintenanceRisks(before, new Map([['peito', 2] as const]), p);
    expect(risks[0]?.text).toMatch(/abaixo até do que costuma manter/);
  });

  it('60 ou mais: abaixo de 6 séries avisa; entre 6 e a faixa de ganhar não', () => {
    const older = { ...p, age_range: '60+' as const };
    expect(maintenanceRisks(before, new Map([['peito', 3] as const]), older)[0]?.text).toMatch(
      /Depois dos 60/,
    );
    expect(maintenanceRisks(before, new Map([['peito', 6] as const]), older)).toEqual([]);
    expect(maintenanceFloor(older)).toBe(6);
  });

  it('não avisa quando o grupo sobe ou continua na faixa de ganhar', () => {
    expect(maintenanceRisks(before, new Map([['peito', 12] as const]), p)).toEqual([]);
    expect(
      maintenanceRisks(new Map([['peito', 3] as const]), new Map([['peito', 3] as const]), p),
    ).toEqual([]);
  });
});

describe('vários grupos no nível de manter: um aviso só', () => {
  it('junta os grupos e mostra a faixa de séries', () => {
    const before = new Map([
      ['peito', 8],
      ['costas', 12],
      ['biceps', 8],
    ] as const);
    const after = new Map([
      ['peito', 4],
      ['costas', 8],
      ['biceps', 4],
    ] as const);
    const risks = maintenanceRisks(before, after, p);
    expect(risks).toHaveLength(1);
    expect(risks[0]?.text).toMatch(
      /^Peito, costas e bíceps: 4 a 8 séries por semana, no nível de manter/,
    );
  });
});
