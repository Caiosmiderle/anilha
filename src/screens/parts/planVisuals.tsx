import type { LucideIcon } from 'lucide-react';
import { Check, Dumbbell, Footprints, Moon } from 'lucide-react';
import type { ReactNode } from 'react';
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../engine/dates';
import { fichaLetter, FICHA_LETTERS, JOINT_LABEL, SPLITS } from '../../engine/taxonomy';
import type { Joint, PlanDay, SplitKey } from '../../engine/types';
import { Icon } from '../../ui/primitives';

/** Seven tiles, Monday first: the ficha letter on gym days, a shoe on runs, a moon on rest. */
export function WeekStrip({
  days,
  rotation,
}: {
  days: PlanDay[];
  rotation: SplitKey[] | null | undefined;
}) {
  return (
    <ol className="weekstrip" aria-label="Semana do plano">
      {days.map((d) => {
        const letter = d.kind === 'gym' ? fichaLetter(rotation, d.split_key) : null;
        const pastel =
          d.kind === 'gym' && d.split_key
            ? SPLITS[d.split_key].pastel
            : d.kind === 'run'
              ? 'mint'
              : 'neutral';
        const what =
          d.kind === 'gym'
            ? letter
              ? `ficha ${letter}`
              : d.split_key
                ? SPLITS[d.split_key].label.toLowerCase()
                : 'academia'
            : d.kind === 'run'
              ? 'corrida'
              : 'descanso';
        return (
          <li
            key={d.weekday}
            className="weekstrip-day"
            aria-label={`${WEEKDAY_NAMES[d.weekday]}: ${what}`}
          >
            <span className="weekstrip-name" aria-hidden="true">
              {WEEKDAY_SHORT[d.weekday]}
            </span>
            <span className={`weekstrip-tile p-${pastel}`} data-kind={d.kind} aria-hidden="true">
              {letter ?? (
                <Icon
                  icon={d.kind === 'gym' ? Dumbbell : d.kind === 'run' ? Footprints : Moon}
                  size={18}
                />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The fichas of a split as colored pills: A Peito e tríceps, B Costas e bíceps... */
export function FichaPills({ rotation }: { rotation: SplitKey[] }) {
  return (
    <ul className="fichapills">
      {rotation.map((s, i) => (
        <li key={s} className={`fichapill p-${SPLITS[s].pastel}`}>
          <b>{FICHA_LETTERS[i]}</b>
          {SPLITS[s].label}
        </li>
      ))}
    </ul>
  );
}

export interface OptionCard<T extends string> {
  value: T;
  title: string;
  text: string;
  icon?: LucideIcon;
  badge?: string;
  extra?: ReactNode;
}

/** Big tappable cards for one choice among few: a picture of each option, not a list. */
export function OptionCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: OptionCard<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="optioncards"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        const radios = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
        );
        const current = radios.indexOf(event.target as HTMLButtonElement);
        if (current < 0 || !radios.length) return;
        event.preventDefault();
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? radios.length - 1
              : (current +
                  (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
                  radios.length) %
                radios.length;
        const option = options[index];
        if (option) {
          onChange(option.value);
          radios[index]?.focus();
        }
      }}
    >
      {options.map((o, index) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={
              on || (!options.some((option) => option.value === value) && index === 0) ? 0 : -1
            }
            className="optioncard"
            onClick={() => onChange(o.value)}
          >
            <span className="optioncard-head">
              {o.icon ? (
                <span className="optioncard-icon" aria-hidden="true">
                  <Icon icon={o.icon} />
                </span>
              ) : null}
              <span className="optioncard-title">{o.title}</span>
              {o.badge ? <span className="optioncard-badge">{o.badge}</span> : null}
              <span className="optioncard-check" aria-hidden="true">
                {on ? <Icon icon={Check} size={16} /> : null}
              </span>
            </span>
            <span className="optioncard-text">{o.text}</span>
            {o.extra ? <span className="optioncard-extra">{o.extra}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Body outline with the joints to tap. One side is tappable; the other mirrors it.
 * Positions are in the 200 x 320 drawing.
 */
const JOINT_SPOTS: Record<Joint, { x: number; y: number; side: 'left' | 'below' }> = {
  ombro: { x: 66, y: 74, side: 'left' },
  cotovelo: { x: 50, y: 128, side: 'left' },
  punho: { x: 42, y: 178, side: 'left' },
  // Label inside the torso, under the dot: on the side it would cover the other arm.
  lombar: { x: 100, y: 112, side: 'below' },
  joelho: { x: 82, y: 230, side: 'left' },
};

const MIRROR: Joint[] = ['ombro', 'cotovelo', 'punho', 'joelho'];

export function BodyMap({
  selected,
  onToggle,
}: {
  selected: Joint[];
  onToggle: (j: Joint) => void;
}) {
  const on = (j: Joint) => selected.includes(j);
  return (
    <div className="bodymap" role="group" aria-label="Articulações a poupar">
      <svg viewBox="0 0 200 320" className="bodymap-figure" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M66 74 L50 128 L42 178" />
          <path d="M134 74 L150 128 L158 178" />
          <path d="M86 168 L82 230 L80 296" />
          <path d="M114 168 L118 230 L120 296" />
        </g>
        <circle cx="100" cy="34" r="21" fill="currentColor" />
        <rect x="68" y="60" width="64" height="112" rx="24" fill="currentColor" />
        {MIRROR.map((j) => {
          const s = JOINT_SPOTS[j];
          return (
            <circle
              key={j}
              className="bodymap-mirror"
              data-on={on(j)}
              cx={200 - s.x}
              cy={s.y}
              r="9"
            />
          );
        })}
      </svg>
      {(Object.keys(JOINT_SPOTS) as Joint[]).map((j) => {
        const s = JOINT_SPOTS[j];
        return (
          <button
            key={j}
            type="button"
            className="bodymap-joint"
            data-side={s.side}
            aria-pressed={on(j)}
            style={{ left: `${(s.x / 200) * 100}%`, top: `${(s.y / 320) * 100}%` }}
            onClick={() => onToggle(j)}
          >
            <span className="bodymap-dot" aria-hidden="true">
              {on(j) ? <Icon icon={Check} size={14} /> : null}
            </span>
            <span className="bodymap-label">
              {JOINT_LABEL[j].charAt(0).toUpperCase() + JOINT_LABEL[j].slice(1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
