import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISES_BY_ID } from '../exercises';
import { volumeGroupOf } from '../generator';
import { levelOf, suggestSubstitutes } from '../substitute';
import type { ExerciseDef } from '../types';

/**
 * Substitutes in the workout: only the same muscle group, ranked by main muscle, movement,
 * equipment the person has and difficulty; the current exercise and the ones already in the
 * workout never show up; 6 at most, each with one line of why.
 */
const get = (id: string) => EXERCISES_BY_ID.get(id) as ExerciseDef;
const ids = (list: { exercise: ExerciseDef }[]) => list.map((s) => s.exercise.id);

describe('catálogo', () => {
  it('todo exercício tem nível', () => {
    const missing = EXERCISES.filter((e) => !e.level).map((e) => e.id);
    expect(missing).toEqual([]);
    const count = (l: string) => EXERCISES.filter((e) => e.level === l).length;
    expect(count('iniciante')).toBeGreaterThan(count('intermediario'));
    expect(count('avancado')).toBeGreaterThan(0);
  });

  it('exercício salvo no aparelho antes do nível usa o do catálogo', () => {
    const old = { ...get('barra-fixa'), level: undefined };
    expect(levelOf(old)).toBe('avancado');
    expect(levelOf({ id: 'criado-pela-pessoa' })).toBeNull();
  });
});

describe('substitutos', () => {
  it('nunca o próprio exercício nem os que já estão no treino; no máximo 6', () => {
    const list = suggestSubstitutes(get('supino-reto-barra'), {
      library: EXERCISES,
      excludeIds: ['supino-reto-barra', 'supino-maquina', 'crucifixo-maquina'],
    });
    expect(list.length).toBeLessThanOrEqual(6);
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(ids(list)).not.toContain('supino-reto-barra');
    expect(ids(list)).not.toContain('supino-maquina');
    expect(ids(list)).not.toContain('crucifixo-maquina');
  });

  it.each(EXERCISES.map((e) => e.id))('%s: só do mesmo grupo muscular', (id) => {
    const e = get(id);
    for (const s of suggestSubstitutes(e, { library: EXERCISES }))
      expect(volumeGroupOf(s.exercise)).toBe(volumeGroupOf(e));
  });

  it('mesmo músculo e mesmo movimento primeiro, depois outra parte do grupo', () => {
    const presses = suggestSubstitutes(get('supino-reto-barra'), { library: EXERCISES });
    expect(ids(presses)[0]).toBe('supino-reto-halteres');
    expect(presses[0]?.reason).toBe('Mesmo movimento, com halteres.');
    for (const s of presses) expect(s.exercise.pattern).toBe('empurrar_horizontal');

    const rear = suggestSubstitutes(get('face-pull'), { library: EXERCISES });
    expect(ids(rear).slice(0, 2)).toEqual(['crucifixo-inverso', 'crucifixo-inverso-maquina']);
    expect(rear[2]?.reason).toMatch(/^Outra parte do ombro, /);
  });

  it('com o mesmo movimento, o equipamento de quem treina vem antes', () => {
    const list = suggestSubstitutes(get('remada-baixa'), {
      library: EXERCISES,
      available: ['halteres', 'peso_corporal'],
    });
    expect(list[0]?.exercise.id).toBe('remada-unilateral');
    expect(list[0]?.reason).toBe('Mesmo movimento, com halteres.');
    // What is not there says what it asks, once.
    expect(list.find((s) => s.exercise.id === 'remada-curvada')?.reason).toBe(
      'Mesmo movimento, mas pede barra.',
    );
  });

  it('dificuldade acima do nível vai para depois e avisa', () => {
    const list = suggestSubstitutes(get('puxada-frente'), {
      library: EXERCISES,
      level: 'iniciante',
    });
    const pullUp = ids(list).indexOf('barra-fixa');
    const easier = ids(list).indexOf('puxada-supinada');
    expect(easier).toBeGreaterThanOrEqual(0);
    expect(pullUp === -1 || pullUp > easier).toBe(true);
    if (pullUp >= 0) expect(list[pullUp]?.reason).toMatch(/pede mais técnica\.$/);
    // Advanced: the pull-up is a normal option.
    const adv = suggestSubstitutes(get('puxada-frente'), { library: EXERCISES, level: 'avancado' });
    expect(adv.find((s) => s.exercise.id === 'barra-fixa')?.reason).not.toMatch(/técnica/);
  });

  it('empate segue a ordem do catálogo, não a do aparelho (alfabética)', () => {
    const shuffled = [...EXERCISES].sort((x, y) => x.id.localeCompare(y.id));
    const list = suggestSubstitutes(get('supino-reto-barra'), { library: shuffled });
    expect(ids(list)[0]).toBe('supino-reto-halteres');
  });

  it('articulação poupada fica de fora', () => {
    const list = suggestSubstitutes(get('agachamento-livre'), {
      library: EXERCISES,
      spareJoints: ['joelho'],
    });
    for (const s of list) expect(s.exercise.joints).not.toContain('joelho');
  });

  it('cada motivo é uma linha curta, sem travessão', () => {
    for (const e of EXERCISES)
      for (const s of suggestSubstitutes(e, {
        library: EXERCISES,
        available: ['halteres'],
        level: 'iniciante',
      })) {
        expect(s.reason.length).toBeLessThanOrEqual(80);
        // Letters, spaces, commas and the final period only: no dashes, no line breaks.
        expect(s.reason).toMatch(/^[A-Za-zÀ-ÿ ,]+[.]$/);
      }
  });
});
