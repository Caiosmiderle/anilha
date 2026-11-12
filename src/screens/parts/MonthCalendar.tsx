import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  addMonths,
  capitalize,
  formatLongDay,
  monthGrid,
  monthOf,
  MONTH_NAMES,
  WEEKDAY_LETTER,
} from '../../engine/dates';
import { IconButton } from '../../ui/primitives';

export interface DayMarks {
  gym: number;
  cardio: number;
}

/**
 * The month at a glance: which days had a workout or cardio. A day opens what was done on
 * it, below the grid; the week list under it stays the full history.
 */
export function MonthCalendar({
  today,
  marks,
  renderDay,
}: {
  today: string;
  marks: Map<string, DayMarks>;
  renderDay: (day: string) => ReactNode;
}) {
  const [month, setMonth] = useState(monthOf(today));
  const [picked, setPicked] = useState<string | null>(null);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const title = `${capitalize(MONTH_NAMES[m - 1] ?? '')} de ${y}`;
  const active = [...marks.keys()].filter((d) => monthOf(d) === month).length;
  const isCurrent = month === monthOf(today);

  return (
    <section className="hb-widget month-cal" aria-label="Calendário do mês">
      <div className="month-cal-head">
        <IconButton
          icon={ChevronLeft}
          label="Mês anterior"
          onClick={() => {
            setMonth(addMonths(month, -1));
            setPicked(null);
          }}
        />
        <div className="month-cal-title">
          <h2 className="section-title" aria-live="polite">
            {title}
          </h2>
          <span className="t-caption">
            {active
              ? `${active} ${active === 1 ? 'dia com treino' : 'dias com treino'}`
              : 'Nenhum treino neste mês'}
          </span>
        </div>
        <IconButton
          icon={ChevronRight}
          label="Próximo mês"
          disabled={isCurrent}
          onClick={() => {
            setMonth(addMonths(month, 1));
            setPicked(null);
          }}
        />
      </div>
      <div className="month-cal-grid" role="grid" aria-label={title}>
        <div className="month-cal-row" role="row">
          {WEEKDAY_LETTER.map((l, i) => (
            <span key={i} className="month-cal-wd" role="columnheader" aria-hidden="true">
              {l}
            </span>
          ))}
        </div>
        {monthGrid(month).map((week, w) => (
          <div key={w} className="month-cal-row" role="row">
            {week.map((day, i) => {
              if (!day) return <span key={i} role="gridcell" />;
              const mark = marks.get(day);
              const what = mark
                ? [mark.gym ? 'academia' : null, mark.cardio ? 'cardio' : null]
                    .filter(Boolean)
                    .join(' e ')
                : 'sem treino';
              return (
                <span key={i} role="gridcell">
                  <button
                    type="button"
                    className="month-cal-day"
                    data-gym={mark?.gym ? true : undefined}
                    data-cardio={mark?.cardio ? true : undefined}
                    data-today={day === today ? true : undefined}
                    aria-pressed={picked === day}
                    aria-label={`${formatLongDay(day)}: ${what}`}
                    disabled={!mark || day > today}
                    onClick={() => setPicked(picked === day ? null : day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="month-cal-legend t-caption" aria-hidden="true">
        <span className="month-cal-key" data-gym /> Academia
        <span className="month-cal-key" data-cardio /> Cardio
      </div>
      {picked ? (
        <div className="month-cal-picked" data-testid="month-day">
          <h3 className="t-label">{capitalize(formatLongDay(picked))}</h3>
          {renderDay(picked)}
        </div>
      ) : null}
    </section>
  );
}
