import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown, CircleAlert, Minus, Plus } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import type { Pastel } from '../engine/taxonomy';

/** One icon family: Lucide line icons, 1.8 stroke, 20px. */
export function Icon({
  icon: I,
  size = 20,
  stroke = 1.8,
  label,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  /** Line width in px, whatever the size. */
  stroke?: number;
  label?: string;
  className?: string;
}) {
  return (
    <I
      size={size}
      strokeWidth={stroke}
      absoluteStrokeWidth
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={className}
      focusable="false"
    />
  );
}

export function pastelClass(p: Pastel): string {
  return `p-${p}`;
}

type Variant = 'primary' | 'tint' | 'outline' | 'ghost' | 'danger';

export function Button({
  variant = 'outline',
  block,
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
  icon?: LucideIcon;
}) {
  const cls = [
    'hb-btn',
    `hb-btn-${variant}`,
    variant === 'primary' ? 'hb-btn-lg' : '',
    block ? 'hb-btn-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon ? <Icon icon={icon} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className={`hb-iconbtn ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon icon={icon} />
    </button>
  );
}

export function Disc({
  icon,
  pastel,
  small,
  label,
}: {
  icon: LucideIcon;
  pastel: Pastel;
  small?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`${small ? 'hb-disc-sm' : 'hb-widget-disc'} ${pastelClass(pastel)}`}
      aria-hidden={label ? undefined : true}
    >
      <Icon icon={icon} size={small ? 18 : 20} label={label} />
    </span>
  );
}

export function Widget({
  icon,
  pastel,
  title,
  sub,
  action,
  children,
  foot,
  className,
  headless,
  id,
}: {
  icon?: LucideIcon;
  pastel?: Pastel;
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  className?: string;
  headless?: boolean;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section
      className={`hb-widget ${className ?? ''}`}
      aria-labelledby={title ? headingId : undefined}
      id={id}
    >
      {!headless && (title || icon) ? (
        <div className="hb-widget-head">
          {icon ? <Disc icon={icon} pastel={pastel ?? 'neutral'} /> : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title ? (
              <h2 className="hb-widget-title" id={headingId} style={{ margin: 0 }}>
                {title}
              </h2>
            ) : null}
            {sub ? <div className="hb-widget-sub">{sub}</div> : null}
          </div>
          {action ? <div className="hb-widget-action">{action}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className="hb-widget-body">{children}</div>
      ) : null}
      {foot ? <div className="hb-widget-foot">{foot}</div> : null}
    </section>
  );
}

export function Empty({ icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="hb-empty" role="status">
      {icon ? <Icon icon={icon} size={22} /> : null}
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p className="hb-error" role="alert" id={id} style={{ margin: 0 }}>
      <Icon icon={CircleAlert} size={16} />
      {children}
    </p>
  );
}

export function Skeleton({
  height = 16,
  width = '100%',
}: {
  height?: number;
  width?: number | string;
}) {
  return <span className="hb-skel" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="hb-widget" aria-busy="true" aria-label="Carregando">
      <div className="hb-widget-body stack-sm">
        <Skeleton height={20} width="45%" />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} height={14} width={i === lines - 1 ? '70%' : '100%'} />
        ))}
      </div>
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className="hb-field">
      <label className="hb-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`hb-input ${error ? 'is-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
      {hint && !error ? (
        <span className="t-caption" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? <ErrorText id={`${id}-err`}>{error}</ErrorText> : null}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 500,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="hb-field">
      <label className="hb-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="hb-input"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="hb-field">
      <label className={hideLabel ? 'hb-sr' : 'hb-label'} htmlFor={id}>
        {label}
      </label>
      <span className="hb-selectwrap">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon icon={ChevronDown} size={18} />
      </span>
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="hb-switchrow" htmlFor={id}>
      <span>
        <span className="t-body" style={{ display: 'block' }}>
          {label}
        </span>
        {hint ? <span className="t-caption">{hint}</span> : null}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="hb-switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** A box the person ticks. The input stays real (keyboard, screen readers). */
export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="checkrow">
      <input
        type="checkbox"
        className="checkrow-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="checkrow-box" aria-hidden="true">
        <Icon icon={Check} size={16} />
      </span>
      <span className="checkrow-text">{label}</span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="hb-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Choices<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string; icon?: LucideIcon }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="hb-choices" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className="hb-choice"
          aria-pressed={selected.includes(o.value)}
          onClick={() => onToggle(o.value)}
        >
          {o.icon ? <Icon icon={o.icon} size={18} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Big +/- stepper. Tap the number to type it with the numeric keyboard. */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  decimals = 0,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
}) {
  const id = useId();
  const fmt = (v: number | null) =>
    v == null
      ? ''
      : decimals
        ? String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ',')
        : String(v);
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  const bump = (dir: 1 | -1) => {
    const base = value ?? 0;
    onChange(clamp(base + dir * step));
  };
  return (
    <div className="stack-sm" style={{ gap: 4 }}>
      <label className="t-caption" htmlFor={id}>
        {label}
      </label>
      <div className="hb-stepper">
        <button
          type="button"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          onClick={() => bump(-1)}
        >
          <Icon icon={Minus} size={22} />
        </button>
        <div className="hb-stepper-value">
          <input
            id={id}
            inputMode={decimals ? 'decimal' : 'numeric'}
            enterKeyHint="done"
            value={text}
            placeholder="0"
            aria-describedby={unit ? `${id}-unit` : undefined}
            onFocus={(e) => {
              focused.current = true;
              e.target.select();
            }}
            onBlur={() => {
              focused.current = false;
              setText(fmt(value));
            }}
            onChange={(e) => {
              const raw = e.target.value.replace(',', '.');
              setText(e.target.value);
              if (raw.trim() === '') {
                onChange(null);
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n)) onChange(clamp(n));
            }}
          />
          {unit ? (
            <span className="hb-stepper-unit" id={`${id}-unit`}>
              {unit}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => bump(1)}
        >
          <Icon icon={Plus} size={22} />
        </button>
      </div>
    </div>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className="hb-meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <span style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Chip({ pastel = 'neutral', children }: { pastel?: Pastel; children: ReactNode }) {
  return <span className={`hb-chip ${pastelClass(pastel)}`}>{children}</span>;
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const pastels = ['butter', 'lavender', 'mint', 'peach', 'sky', 'pink'] as const;
  // FNV-1a: spreads short names across the six avatar pastels.
  let hash = 0x811c9dc5;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  hash = (hash ^ (hash >>> 15)) >>> 0;
  const p = pastels[hash % pastels.length];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <span className={`hb-av hb-av-${p} ${large ? 'hb-av-lg' : ''}`} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}
