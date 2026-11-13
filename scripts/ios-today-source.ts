import 'fake-indexeddb/auto';
import { openDb, ensureLibrary } from '../src/data/db';
import { defaultProfile, setDayOverride } from '../src/data/ops';
import { setCurrent } from '../src/data/store';
import {
  applyAdjustment,
  overrideToAdjustment,
  plannedFromRoutine,
  routineFor,
} from '../src/engine/dayAdjustment';
import { describeChange } from '../src/engine/adjust';
import { planForDay, recommendDay } from '../src/engine/recommend';
import { summarizeSessions } from '../src/engine/history';
import { ALL_EQUIPMENT } from '../src/engine/taxonomy';
import { dayOptions, type TodayInput } from './ios-today-engine';
import { calendarArtifacts } from './ios-calendar-source';
import type { OverrideAction, PlanRow, RoutineRow } from '../src/engine/types';

export async function todayArtifacts() {
  const owner = 'fiction-today',
    today = '2026-11-13',
    database = openDb('ios-today-fixture');
  setCurrent({ db: database, userId: owner });
  try {
    await ensureLibrary(database, owner);
    const catalog = await database.exercises.toArray();
    const sync = { user_id: owner, updated_at: 100, deleted: false };
    const profile = {
      ...defaultProfile(owner),
      ...sync,
      return_mode: 'off' as const,
      onboarding: {
        first_name: 'Rafa',
        goal: 'hipertrofia' as const,
        gym_days: 3,
        run_days: 1,
        force_gym_days: false,
        minutes: 60,
        equipment: [...ALL_EQUIPMENT],
        level: 'intermediario' as const,
        spare_joints: [],
        returning: false,
        time: '18:30',
      },
    };
    const routine: RoutineRow = {
      ...sync,
      id: 'plan-ficha',
      name: 'Ficha fictícia',
      split_key: 'peito_triceps',
      position: 1,
      archived: false,
      origin: 'plano',
      reason: null,
    };
    const manual: RoutineRow = {
      ...routine,
      id: 'manual',
      name: 'Ficha pessoal',
      origin: 'pessoa',
      position: 0,
    };
    const plan: PlanRow = {
      ...sync,
      id: 'plan',
      active_from: '2026-11-09',
      gym_per_week: 3,
      run_per_week: 1,
      days: [
        { weekday: 4, kind: 'gym', split_key: 'peito_triceps', time: '18:30', run_type: null },
      ],
      rules: { no_legs_before_run: true, rotation: ['peito_triceps', 'costas_biceps', 'perna'] },
      params: profile.onboarding,
      reasons: [],
    };
    const ids = [
      'supino-reto-barra',
      'supino-inclinado-halteres',
      'triceps-corda',
      'remada-baixa',
      'agachamento-livre',
      'prancha',
      'rosca-direta-barra',
    ];
    const items = ids.map((exercise_id, position) => ({
      ...sync,
      id: `item-${position}`,
      routine_id: routine.id,
      exercise_id,
      position,
      sets: 3,
      target_min: 8,
      target_max: 12,
      rest_sec: 90,
      warmup_sets: position === 0 ? 2 : 0,
      superset: position === 1 || position === 2 ? 'par' : null,
      note: null,
      reason: null,
    }));
    const tables: TodayInput['tables'] = {
      profiles: [profile],
      routines: [manual, routine],
      plans: [plan],
      routine_items: [
        ...items,
        ...items
          .slice(0, 2)
          .map((item) => ({ ...item, id: `manual-${item.id}`, routine_id: manual.id })),
      ],
    };
    const options = JSON.parse(dayOptions()) as Record<string, { id: string; name: string }[]>;
    const requests: { action: OverrideAction | null; value: string | null }[] = [
      { action: null, value: null },
      ...Object.entries(options).flatMap(([action, choices]) =>
        choices.map((c) => ({ action: action as OverrideAction, value: c.id })),
      ),
      { action: 'run', value: null },
      { action: 'rest', value: null },
    ];
    const cases = [];
    const siteResult = (input: TodayInput) => {
      const t = input.tables;
      const active = <T extends { deleted: boolean }>(rows: T[] = []) =>
        rows.filter((r) => !r.deleted);
      const overrides = (t.day_overrides ?? []).filter(
        (o) => !o.deleted && (input.health || o.action !== 'spare_joint'),
      );
      const library = new Map(input.catalog.map((e) => [e.id, e]));
      for (const e of t.exercises ?? []) {
        if (e.deleted) library.delete(e.id);
        else library.set(e.id, e);
      }
      const exercises = [...library.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      const sessions = active(t.sessions).sort(
        (a, b) => b.local_date.localeCompare(a.local_date) || b.started_at - a.started_at,
      );
      const rec = recommendDay({
        today: input.today,
        plan: planForDay(active(t.plans), input.today),
        sessions: summarizeSessions(sessions, active(t.session_items), library),
        runs: active(t.runs),
        overrides,
        externalPlans: active(t.external_plan_items),
      });
      const selected = routineFor(
        rec.split_key,
        active(t.routines)
          .filter((r) => !r.archived)
          .sort((a, b) => a.position - b.position),
      );
      const override = overrides.find((o) => o.local_date === input.today) ?? null;
      const profile = t.profiles?.[0];
      const safe =
        profile && !input.health
          ? {
              ...profile,
              onboarding: profile.onboarding && { ...profile.onboarding, spare_joints: [] },
            }
          : profile;
      const result = applyAdjustment(
        plannedFromRoutine(selected, active(t.routine_items)),
        overrideToAdjustment(override),
        exercises,
        safe,
      );
      return {
        rec,
        routine: selected,
        override,
        items: result.items,
        summary: result.summary,
        descriptions: result.changes.map((c) => describeChange(c, exercises)),
      };
    };
    for (const request of requests) {
      await database.day_overrides.clear();
      await setDayOverride(today, request.action, request.value);
      const input: TodayInput = {
        today,
        health: true,
        catalog,
        tables: {
          ...tables,
          day_overrides: (await database.day_overrides.toArray()).map((o) => ({
            ...o,
            updated_at: 100,
          })),
        },
      };
      cases.push({
        name: `${request.action ?? 'base'}-${request.value ?? ''}`,
        input,
        expected: siteResult(input),
      });
    }
    const extra: TodayInput[] = [
      {
        today,
        health: false,
        catalog,
        tables: {
          ...tables,
          day_overrides: [
            {
              ...sync,
              id: `day-${today}`,
              local_date: today,
              action: 'spare_joint',
              value: 'ombro',
            },
          ],
        },
      },
      {
        today,
        health: true,
        catalog,
        tables: {
          ...tables,
          routine_items: [],
          day_overrides: [
            { ...sync, id: `day-${today}`, local_date: today, action: 'focus', value: 'costas' },
          ],
        },
      },
      {
        today,
        health: true,
        catalog,
        tables: {
          ...tables,
          plans: [],
          day_overrides: [
            {
              ...sync,
              id: `day-${today}`,
              local_date: today,
              action: 'rest',
              value: null,
              deleted: true,
            },
          ],
        },
      },
      {
        today,
        health: true,
        catalog,
        tables: {
          ...tables,
          profiles: [
            {
              ...profile,
              onboarding: {
                ...profile.onboarding,
                equipment: ['peso_corporal'],
                spare_joints: ['joelho'],
                returning: true,
                level: 'iniciante',
              },
            },
          ],
          day_overrides: [
            { ...sync, id: `day-${today}`, local_date: today, action: 'focus', value: 'pernas' },
          ],
        },
      },
    ];
    for (const [i, input] of extra.entries())
      cases.push({ name: `borda-${i}`, input, expected: siteResult(input) });
    for (const [i, c] of calendarArtifacts().entries()) {
      const input: TodayInput = {
        today: c.input.today,
        health: true,
        catalog,
        tables: {
          ...tables,
          plans: c.input.plans,
          sessions: c.input.sessions,
          runs: c.input.runs,
          external_plan_items: c.input.externalPlans,
          day_overrides: c.input.overrides,
        },
      };
      cases.push({ name: `historico-${i}`, input, expected: siteResult(input) });
    }
    const custom = {
      ...catalog.find((e) => e.id === 'remada-baixa')!,
      id: 'a-costas-ficticio',
      builtin: false,
      name: 'Costas fictício',
      equipment: 'peso_corporal' as const,
    };
    const customInput: TodayInput = {
      today,
      health: true,
      catalog,
      tables: {
        ...tables,
        exercises: [custom, { ...catalog.find((e) => e.id === 'puxada-frente')!, deleted: true }],
        day_overrides: [
          { ...sync, id: `day-${today}`, local_date: today, action: 'focus', value: 'costas' },
        ],
      },
    };
    cases.push({
      name: 'exercicio-proprio',
      input: customInput,
      expected: siteResult(customInput),
    });
    const writes = [];
    await database.day_overrides.clear();
    for (const request of [
      { action: null, value: null },
      ...requests.slice(1),
      { action: null, value: null },
      { action: 'time' as const, value: '45' },
    ]) {
      const before = await database.day_overrides.toArray();
      await setDayOverride(today, request.action, request.value);
      const after = (await database.day_overrides.toArray()).map(
        ({ user_id: _user, updated_at: _stamp, ...row }) => row,
      );
      const previous = before.map(({ user_id: _user, updated_at: _stamp, ...row }) => row);
      writes.push({
        request,
        before: previous,
        changes: after.map((row) => ({ table: 'day_overrides', row })),
      });
    }
    return {
      owner,
      today,
      catalog,
      options,
      cases: cases.map((c) => {
        const { catalog: _catalog, ...input } = c.input;
        return { ...c, input };
      }),
      writes,
    };
  } finally {
    setCurrent(null);
    database.close();
    await database.delete();
  }
}
