import { CalendarCheck, Check, Dumbbell, Footprints, Moon } from 'lucide-react';
import { useHistorySummaries, useOverrides } from '../../data/hooks';
import { useTodayData } from '../../data/today';
import {
  addDays,
  capitalize,
  formatDDMM,
  weekStart,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
} from '../../engine/dates';
import { fichaLetter, fichaName, RUN_TYPE_LABEL, SPLITS } from '../../engine/taxonomy';
import type { PlanRow } from '../../engine/types';
import { commonTime, projectDays, type DayView } from '../../engine/weekView';
import { Icon, Widget } from '../../ui/primitives';

/**
 * This week at a glance: seven squares with the ficha letter (or run, rest), what was done,
 * today and what passed. Tapping a day opens it to change or trade with another day. One
 * line says what comes next. The letters are the fichas of the rotation card below.
 */
export function WeekPlan({
  plan,
  today,
  onEdit,
}: {
  plan: PlanRow;
  today: string;
  onEdit: (weekday: number) => void;
}) {
  const history = useHistorySummaries();
  const overrides = useOverrides();
  const { rec } = useTodayData(today);
  const rotation = plan.rules.rotation?.length ? plan.rules.rotation : null;
  const input = {
    plan,
    sessions: history.sessions,
    runs: history.runs,
    overrides,
    today,
    todayRec: rec,
  };
  const week = projectDays(input, weekStart(today), 7);
  const next = projectDays(input, today, 8).find(
    (d) => d.state !== 'feito' && (d.kind === 'gym' || d.kind === 'run'),
  );
  const time = commonTime(plan);

  const what = (d: DayView): string =>
    d.kind === 'gym'
      ? d.split_key
        ? fichaName(rotation, d.split_key)
        : 'Academia'
      : d.kind === 'run'
        ? `Corrida ${RUN_TYPE_LABEL[d.run_type ?? 'leve']}`
        : d.kind === 'light'
          ? 'Descanso ou algo leve'
          : 'Descanso';
  const when = (d: DayView): string =>
    d.date === today
      ? 'Hoje'
      : d.date === addDays(today, 1)
        ? 'Amanhã'
        : `${WEEKDAY_NAMES[d.weekday] ?? ''}, ${formatDDMM(d.date)}`;
  const state = (d: DayView) =>
    d.state === 'feito'
      ? ', feito'
      : d.state === 'hoje'
        ? ', hoje'
        : d.state === 'passou'
          ? ', passou'
          : '';

  const counts = `${plan.gym_per_week} de academia${plan.run_per_week ? ` e ${plan.run_per_week} ${plan.run_per_week === 1 ? 'corrida' : 'corridas'}` : ''}`;
  return (
    <Widget
      icon={CalendarCheck}
      pastel="butter"
      title="Esta semana"
      sub={`${counts}${time ? `, sempre às ${time}` : ''}. Toque num dia para mudar ou trocar.`}
    >
      <div className="stack">
        <ol className="weekstrip week-now" aria-label="Esta semana">
          {week.map((d) => (
            <li key={d.date} className="weekstrip-day" data-state={d.state}>
              <button
                type="button"
                className="hb-day-btn"
                aria-label={`${capitalize(WEEKDAY_NAMES[d.weekday] ?? '')}, ${formatDDMM(d.date)}: ${what(d)}${state(d)}. Mudar`}
                onClick={() => onEdit(d.weekday)}
              >
                <span className="weekstrip-name" aria-hidden="true">
                  {WEEKDAY_SHORT[d.weekday]}
                </span>
                <DayTile day={d} rotation={rotation} />
              </button>
            </li>
          ))}
        </ol>
        {next ? (
          <p className="week-next-line" data-testid="week-next">
            <span className="t-muted">Próximo:</span> {when(next)}, {what(next)}
            {next.time && next.time !== time ? `, às ${next.time}` : ''}
          </p>
        ) : null}
      </div>
    </Widget>
  );
}

/** The square of a day: the ficha letter, or an icon; done days get a check. */
function DayTile({ day, rotation }: { day: DayView; rotation: PlanRow['rules']['rotation'] }) {
  const letter = day.kind === 'gym' ? fichaLetter(rotation, day.split_key) : null;
  const pastel =
    day.kind === 'gym' && day.split_key
      ? SPLITS[day.split_key].pastel
      : day.kind === 'run'
        ? 'mint'
        : 'neutral';
  return (
    <span
      className={`weekstrip-tile p-${pastel}`}
      data-kind={day.kind === 'light' ? 'rest' : day.kind}
      data-state={day.state}
      aria-hidden="true"
    >
      {letter ?? (
        <Icon
          icon={day.kind === 'gym' ? Dumbbell : day.kind === 'run' ? Footprints : Moon}
          size={18}
        />
      )}
      {day.state === 'feito' ? (
        <span className="weekstrip-check">
          <Icon icon={Check} size={12} />
        </span>
      ) : null}
    </span>
  );
}
