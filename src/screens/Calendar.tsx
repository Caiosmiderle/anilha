import { ChevronLeft, ChevronRight, Dumbbell, Footprints } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useExternalPlanItems,
  useOverrides,
  usePlans,
  useRoutines,
  useRuns,
  useSessions,
  useToday,
} from '../data/hooks';
import { calendarDays, type CalendarEvent } from '../engine/calendar';
import {
  addMonths,
  capitalize,
  formatLongDay,
  monthGrid,
  monthOf,
  MONTH_NAMES,
  WEEKDAY_LETTER,
} from '../engine/dates';
import { fmtNum } from '../engine/format';
import { RUN_TYPE_LABEL, SPLITS } from '../engine/taxonomy';
import { lazyScreen } from '../lib/lazyScreen';
import { Disc, IconButton, LoadingCard } from '../ui/primitives';
import { Sheet } from '../ui/overlays';

const RunSheet = lazyScreen(
  () => import('./sheets/RunSheet'),
  (m) => m.RunSheet,
);

export default function Calendar() {
  const today = useToday();
  const plans = usePlans();
  const routines = useRoutines();
  const sessions = useSessions();
  const runs = useRuns();
  const externalPlans = useExternalPlanItems();
  const overrides = useOverrides();
  const [month, setMonth] = useState(monthOf(today));
  const [picked, setPicked] = useState(today);
  const [opened, setOpened] = useState<CalendarEvent | null>(null);
  const days = useMemo(
    () =>
      calendarDays({
        month,
        today,
        plans: plans ?? [],
        routines,
        sessions: sessions ?? [],
        runs: runs ?? [],
        externalPlans,
        overrides,
      }),
    [month, today, plans, routines, sessions, runs, externalPlans, overrides],
  );
  if (!plans || !sessions || !runs) return <LoadingCard lines={6} />;
  const title = `${capitalize(MONTH_NAMES[Number(month.slice(5)) - 1] ?? '')} de ${month.slice(0, 4)}`;
  const selected = days.find((d) => d.date === picked);
  const openedRun = opened?.runID ? runs.find((r) => r.id === opened.runID) : undefined;
  const changeMonth = (delta: number) => {
    const next = addMonths(month, delta);
    setMonth(next);
    setPicked(next === monthOf(today) ? today : `${next}-01`);
  };
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Calendário</h1>
      </header>
      <section className="hb-widget month-cal" aria-label="Calendário de treinos">
        <div className="month-cal-head">
          <IconButton icon={ChevronLeft} label="Mês anterior" onClick={() => changeMonth(-1)} />
          <h2 className="section-title" aria-live="polite">
            {title}
          </h2>
          <IconButton icon={ChevronRight} label="Próximo mês" onClick={() => changeMonth(1)} />
        </div>
        <div className="month-cal-grid" role="group" aria-label={title}>
          <div className="month-cal-row" aria-hidden="true">
            {WEEKDAY_LETTER.map((l, i) => (
              <span key={i} className="month-cal-wd">
                {l}
              </span>
            ))}
          </div>
          {monthGrid(month).map((week, w) => (
            <div className="month-cal-row" key={w}>
              {week.map((date, i) => {
                if (!date) return <span key={i} />;
                const day = days.find((d) => d.date === date)!;
                const strength = day.events.some((e) => e.kind === 'strength');
                const run = day.events.some((e) => e.kind === 'run');
                return (
                  <button
                    key={date}
                    className="month-cal-day calendar-cell"
                    type="button"
                    data-today={day.today || undefined}
                    aria-pressed={picked === date}
                    aria-label={`${formatLongDay(date)}, ${day.events.length} atividades${strength ? ', força' : ''}${run ? ', corrida' : ''}${day.today ? ', hoje' : ''}`}
                    onClick={() => setPicked(date)}
                  >
                    {Number(date.slice(8))}
                    <span className="calendar-dots" aria-hidden="true">
                      {strength && <i className="calendar-dot-strength" />}
                      {run && <i className="calendar-dot-run" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="month-cal-legend t-caption">
          <span className="calendar-dot-strength calendar-key" /> Força{' '}
          <span className="calendar-dot-run calendar-key" /> Corrida
        </p>
        <p className="t-caption">
          Força prevista pelo plano e rodízio. Pode mudar conforme os treinos feitos e as trocas do
          dia.
        </p>
      </section>
      <section className="hb-widget calendar-agenda" aria-label="Atividades do dia" data-testid="calendar-day">
        <h2 className="section-title">{capitalize(formatLongDay(picked))}</h2>
        {selected?.warnings.map((text) => (
          <p className="hb-advice" role="note" key={text}>
            {text}
          </p>
        ))}
        {!selected?.events.length && <p className="t-muted">Nenhum treino neste dia.</p>}
        <div className="hb-list">
          {selected?.events.map((event) => {
            const content = (
              <>
                <Disc
                  icon={event.kind === 'strength' ? Dumbbell : Footprints}
                  pastel={event.split ? SPLITS[event.split].pastel : 'sky'}
                />
                <span className="hb-list-main">
                  <span className="hb-list-title">{event.title}</span>
                  <span className="hb-list-sub" style={{ display: 'block' }}>
                    {eventDetail(event)}
                  </span>
                </span>
              </>
            );
            if (event.sessionID)
              return (
                <Link
                  className="hb-list-row"
                  key={event.id}
                  to={`/historico/treino/${event.sessionID}`}
                >
                  {content}
                </Link>
              );
            if (event.routineID)
              return (
                <Link
                  className="hb-list-row"
                  key={event.id}
                  to={`/plano/rotina/${event.routineID}`}
                >
                  {content}
                </Link>
              );
            return (
              <button
                type="button"
                className="hb-list-row"
                key={event.id}
                onClick={() => setOpened(event)}
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>
      {openedRun ? (
        <Suspense fallback={<LoadingCard lines={2} />}>
          <RunSheet open today={today} run={openedRun} onClose={() => setOpened(null)} />
        </Suspense>
      ) : opened ? (
        <Sheet open title={opened.title} onClose={() => setOpened(null)}>
          <p>{eventDetail(opened)}</p>
          {opened.externalID && <p className="t-caption">Planejamento recebido do CRUNNING.</p>}
        </Sheet>
      ) : null}
    </>
  );
}

function eventDetail(event: CalendarEvent): string {
  const state = { done: 'Feito', planned: 'Previsto', missed: 'Perdido' }[event.status];
  const type =
    event.runType &&
    (RUN_TYPE_LABEL[event.runType as keyof typeof RUN_TYPE_LABEL] ?? event.runType);
  return [
    state,
    type,
    event.distanceKm != null ? `${fmtNum(event.distanceKm)} km` : null,
    event.important ? 'Importante' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
