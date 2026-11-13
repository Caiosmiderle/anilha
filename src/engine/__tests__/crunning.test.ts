import { describe, expect, it } from 'vitest';
import { crunningDuplicates } from '../runDuplicates';
import { recommendDay } from '../recommend';
import { exampleWeek } from '../fixtures/exampleWeek';
import { strengthResponse, type StrengthSnapshot } from '../crunningStrength';
import { strengthResponse as deployedStrength } from '../../../supabase/functions/troca-crunning/engine.generated';
import type { ExternalPlanItemRow, RunRow } from '../types';
import { handleCrunning } from '../../../supabase/functions/troca-crunning/core';

const run: RunRow = {
  id: 'r',
  user_id: 'u',
  updated_at: 1,
  deleted: false,
  local_date: '2026-11-09',
  distance_km: 10,
  duration_sec: 3600,
  run_type: 'longo',
  rpe: null,
  note: null,
  source: 'crunning',
  external_id: null,
  started_at: 1000000,
  strava_id: '123',
};
const external: ExternalPlanItemRow = {
  id: 'p',
  user_id: 'u',
  updated_at: 1,
  deleted: false,
  source: 'crunning',
  kind: 'corrida',
  origin_id: 'plano:2026-11-09:1-1',
  local_date: '2026-11-10',
  run_type: 'longo',
  source_type: 'longao',
  name: 'Longão importante',
  distance_m: 16000,
  duration_sec: null,
  important: true,
  status: 'planejada',
};

describe('CRUNNING no motor', () => {
  it('detecta duplicatas por Strava ou bordas de tempo/distância, sem mutação', () => {
    const imported: RunRow = {
      ...run,
      id: 'i',
      source: 'import',
      strava_id: '123',
      started_at: 9999999,
    };
    expect(crunningDuplicates([run, imported])[0]?.reason).toBe('strava');
    const overlapping = { ...imported, strava_id: null, started_at: 1300000, distance_km: 10.5 };
    expect(crunningDuplicates([run, overlapping])).toHaveLength(1);
    expect(crunningDuplicates([run, { ...overlapping, started_at: 1300001 }])).toEqual([]);
    expect(crunningDuplicates([run, { ...overlapping, distance_km: 10.50001 }])).toEqual([]);
    expect(crunningDuplicates([run, { ...imported, deleted: true }])).toEqual([]);
    expect(crunningDuplicates([run, { ...imported, activity: 'bike' }])).toEqual([]);
    // Registered by hand: same day and distance within 5%, no start time needed.
    const manual = { ...imported, source: 'manual' as const, started_at: null, strava_id: null };
    expect(
      crunningDuplicates([run, { ...manual, distance_km: run.distance_km! * 1.05 }])[0]?.reason,
    ).toBe('manual_day');
    expect(crunningDuplicates([run, { ...manual, distance_km: run.distance_km! * 1.06 }])).toEqual(
      [],
    );
    expect(crunningDuplicates([run, { ...manual, local_date: '2000-01-01' }])).toEqual([]);
    expect(imported.deleted).toBe(false);
  });
  it('reconhece horário de TCX/GPX antigo no external_id, sem inventar hora do CSV', () => {
    const canonical = { ...run, started_at: Date.parse('2026-11-09T09:00:00Z') };
    expect(
      crunningDuplicates([
        canonical,
        {
          ...run,
          id: 'i',
          source: 'import',
          started_at: null,
          strava_id: null,
          external_id: '2026-11-09T09:05:00Z',
        },
      ]),
    ).toHaveLength(1);
    expect(
      crunningDuplicates([
        canonical,
        { ...run, id: 'i', source: 'import', started_at: null, strava_id: null, external_id: null },
      ]),
    ).toEqual([]);
  });
  const fixture = exampleWeek('u');
  const plan = {
    ...fixture.plan,
    gym_per_week: 3,
    run_per_week: 0,
    days: fixture.plan.days.map((d) => ({
      ...d,
      kind: 'gym' as const,
      split_key: 'perna' as const,
    })),
    rules: { no_legs_before_run: true, rotation: ['perna', 'costas_biceps'] as const },
  };
  // Mutable PlanRow arrays, just as persisted JSON.
  const input = {
    today: '2026-11-09',
    plan: { ...plan, rules: { ...plan.rules, rotation: [...plan.rules.rotation] } },
    sessions: [],
    runs: [],
  };
  it('usa planejado importante de amanhã sem somá-lo como corrida feita e explica a confirmação', () => {
    const rec = recommendDay({ ...input, externalPlans: [external] });
    expect(rec.split_key).toBe('costas_biceps');
    expect(rec.reason).toContain('Corrida planejada no CRUNNING: Longão importante');
    expect(rec.reason).toContain('Confirme');
    expect(rec.week.done_run).toBe(0);
    expect(rec.alerts.some((a) => a.kind === 'legs_before_run')).toBe(true);
    expect(input.plan.rules.rotation).toEqual(['perna', 'costas_biceps']);
  });
  it('respeita regra desligada, lápide, feito, perdido, leve e outra data', () => {
    for (const change of [
      { deleted: true },
      { status: 'feita' as const },
      { status: 'perdida' as const },
      { important: false },
      { local_date: '2026-11-11' },
    ]) {
      expect(
        recommendDay({ ...input, externalPlans: [{ ...external, ...change }] }).split_key,
      ).toBe('perna');
    }
    expect(
      recommendDay({
        ...input,
        plan: { ...input.plan, rules: { ...input.plan.rules, no_legs_before_run: false } },
        externalPlans: [external],
      }).split_key,
    ).toBe('perna');
  });
  it('corrida realizada usa run_legs e informa a data feita', () => {
    const rec = recommendDay({
      ...input,
      runs: [{ ...run, distance_km: 16, rpe: 8, local_date: '2026-11-08' }],
    });
    expect(rec.split_key).toBe('costas_biceps');
    expect(rec.reason).toContain('feita ontem (2026-11-08)');
  });
  it('força usa projeção do PWA no bundle implantável e distingue pulado de feito', () => {
    const data: StrengthSnapshot = {
      cursor: '1',
      today: '2026-11-09',
      changed: [],
      sessions: [],
      sets: [],
      exercises: [],
      plans: [input.plan],
      routines: fixture.routines,
      routine_items: fixture.routineItems,
      overrides: [{ local_date: '2026-11-09', action: 'rest' }],
    };
    const response = strengthResponse(data, false);
    expect(deployedStrength(data, false)).toEqual(response);
    expect(response.planejadas[0]).toMatchObject({ data_local: '2026-11-09', status: 'pulado' });
    expect(response.planejadas.length).toBe(14);
  });
  it('força prevista tira perna da véspera de corrida importante do CRUNNING', () => {
    const data: StrengthSnapshot = {
      cursor: '1',
      today: '2026-11-09',
      changed: [],
      sessions: [],
      sets: [],
      exercises: [],
      plans: [input.plan],
      routines: fixture.routines,
      routine_items: fixture.routineItems,
      overrides: [],
    };
    const legsOn = (r: ReturnType<typeof strengthResponse>, day: string) =>
      r.planejadas.find((p) => p.data_local === day)?.pernas;
    const plain = strengthResponse(data, false);
    const withRun = { ...data, external_plans: [external] };
    const moved = strengthResponse(withRun, false);
    expect(deployedStrength(withRun, false)).toEqual(moved);
    expect(legsOn(plain, '2026-11-09')).toBe(true);
    expect(legsOn(moved, '2026-11-09')).toBe(false);
    // Not important: legs stay.
    const easy = strengthResponse(
      { ...data, external_plans: [{ ...external, important: false }] },
      false,
    );
    expect(legsOn(easy, '2026-11-09')).toBe(true);
  });
  it('handler ignora campos desconhecidos e mantém null sem enviar dados privados ao banco', async () => {
    let received: Record<string, unknown> = {};
    const res = await handleCrunning(
      new Request('http://local/troca-crunning/corridas', {
        method: 'POST',
        headers: { authorization: `Bearer anl_${'a'.repeat(43)}` },
        body: JSON.stringify({
          versao: 1,
          itens: [
            {
              origem_id: '00000000-0000-4000-8000-000000000001',
              atualizado_em: '2026-11-12T10:00:00Z',
              inicio: '2026-11-12T06:00:00-03:00',
              data_local: '2026-11-12',
              tipo: 'leve',
              distancia_m: 5000,
              duracao_movimento_s: 1800,
              esforco: null,
              gps: [1, 2],
              planejado: { semana: 1, dia: 2, nota: 'não enviar' },
            },
          ],
        }),
      }),
      async (_hash, _op, payload) => {
        received = payload;
        return { aceitos: 1, ignorados: 0, rejeitados: [] };
      },
    );
    expect(res.status).toBe(200);
    expect(JSON.stringify(received)).not.toContain('gps');
    expect(JSON.stringify(received)).not.toContain('nota');
    expect((received.itens as { esforco: null }[])[0]?.esforco).toBeNull();
  });
});
