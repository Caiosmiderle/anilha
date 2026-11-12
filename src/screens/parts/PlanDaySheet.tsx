import { useState } from 'react';
import { useRoutines } from '../../data/hooks';
import { newId, save } from '../../data/store';
import { capitalize, WEEKDAY_NAMES, WEEKDAY_SHORT, weekStart } from '../../engine/dates';
import { dayKindText, legsBeforeRunDays, swapPlanDays } from '../../engine/planEdit';
import { RUN_TYPE_LABEL, SPLITS } from '../../engine/taxonomy';
import type { PlanDay, PlanRow, RunType, SplitKey } from '../../engine/types';
import { Sheet, useToast } from '../../ui/overlays';
import { Button, Segmented, Select, TextField } from '../../ui/primitives';

/** Edits apply from this week on. Past weeks keep the plan they had. */
export async function savePlan(current: PlanRow, changes: Partial<PlanRow>, today: string) {
  const days = changes.days ?? current.days;
  const next = {
    ...current,
    ...changes,
    gym_per_week: days.filter((d) => d.kind === 'gym').length,
    run_per_week: days.filter((d) => d.kind === 'run').length,
  };
  const thisWeek = weekStart(today);
  if (current.active_from >= thisWeek) {
    await save('plans', next);
  } else {
    await save('plans', { ...next, id: newId(), active_from: thisWeek });
  }
}

/**
 * One day of the plan: what it is, at what time, or swap it with another day (the run of
 * Tuesday goes to Thursday and Thursday's workout comes to Tuesday). Opened from Plan and
 * from the week on Today.
 */
export function PlanDaySheet({
  plan,
  weekday,
  today,
  onClose,
}: {
  plan: PlanRow;
  weekday: number;
  today: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const routines = useRoutines();
  const day = plan.days.find((d) => d.weekday === weekday) as PlanDay;
  const [d, setD] = useState<PlanDay>(day);
  const rotation = !!plan.rules.rotation?.length;
  const splits = [...new Set(routines.map((r) => r.split_key))];
  const options = splits.length
    ? splits
    : (['costas_biceps', 'peito_triceps', 'perna'] as SplitKey[]);
  const name = WEEKDAY_NAMES[weekday] ?? '';

  async function commit(days: PlanDay[], message: string) {
    await savePlan(plan, { days }, today);
    const bad = plan.rules.no_legs_before_run ? legsBeforeRunDays(days) : [];
    toast.show(bad.length ? `${message}. Atenção: perna na véspera de corrida` : message, {
      error: bad.length > 0,
    });
    onClose();
  }

  async function swapWith(other: number) {
    const otherName = WEEKDAY_NAMES[other] ?? '';
    // The day as it is on screen, with any change not saved yet: nothing typed is lost.
    const edited = plan.days.map((x) => (x.weekday === weekday ? d : x));
    const what = d.kind === 'rest' ? 'Descanso' : capitalize(dayKindText(d));
    await commit(swapPlanDays(edited, weekday, other), `${what} passou para ${otherName}`);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={capitalize(name)}
      actions={
        <Button
          variant="primary"
          block
          onClick={() =>
            void commit(
              plan.days.map((x) => (x.weekday === weekday ? d : x)),
              'Plano atualizado',
            )
          }
        >
          Salvar dia
        </Button>
      }
    >
      <div className="stack">
        <p className="t-caption" style={{ margin: 0 }}>
          Vale a partir desta semana. Para mudar só hoje, use os ajustes da tela Hoje.
        </p>
        <Segmented<PlanDay['kind']>
          label="Tipo do dia"
          value={d.kind}
          options={[
            { value: 'gym', label: 'Academia' },
            { value: 'run', label: 'Corrida' },
            { value: 'rest', label: 'Descanso' },
          ]}
          onChange={(kind) =>
            setD({
              ...d,
              kind,
              split_key: kind === 'gym' && !rotation ? (d.split_key ?? options[0] ?? null) : null,
              run_type: kind === 'run' ? (d.run_type ?? 'leve') : null,
            })
          }
        />
        {d.kind === 'gym' && !rotation ? (
          <Select<SplitKey>
            label="Treino"
            value={d.split_key ?? (options[0] as SplitKey)}
            options={options.map((s) => ({ value: s, label: SPLITS[s].label }))}
            onChange={(split_key) => setD({ ...d, split_key })}
          />
        ) : null}
        {d.kind === 'run' ? (
          <Segmented<RunType>
            label="Tipo de corrida"
            value={d.run_type ?? 'leve'}
            options={(['leve', 'longo', 'intervalado'] as RunType[]).map((t) => ({
              value: t,
              label: capitalize(RUN_TYPE_LABEL[t]),
            }))}
            onChange={(run_type) => setD({ ...d, run_type })}
          />
        ) : null}
        {d.kind !== 'rest' ? (
          <TextField
            label="Horário"
            type="time"
            value={d.time}
            onChange={(e) => setD({ ...d, time: e.target.value || '06:00' })}
          />
        ) : null}

        <div className="stack-sm" role="group" aria-label="Trocar com outro dia">
          <span className="hb-label">
            {day.kind === 'run'
              ? 'Mudar a corrida de dia'
              : day.kind === 'gym'
                ? 'Mudar o treino de dia'
                : 'Trocar com outro dia'}
          </span>
          <div className="dayswap">
            {plan.days
              .filter((x) => x.weekday !== weekday)
              .map((x) => (
                <button
                  key={x.weekday}
                  type="button"
                  className="hb-choice dayswap-btn"
                  aria-label={`Trocar com ${WEEKDAY_NAMES[x.weekday]} (${dayKindText(x)})`}
                  onClick={() => void swapWith(x.weekday)}
                >
                  <b>{WEEKDAY_SHORT[x.weekday]}</b>
                  <span>{dayKindText(x)}</span>
                </button>
              ))}
          </div>
          <p className="t-caption" style={{ margin: 0 }}>
            O que está no outro dia vem para {name}.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
