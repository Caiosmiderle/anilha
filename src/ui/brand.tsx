import { useId } from 'react';

/**
 * Anilha mark: a weight plate whose ring is an almost closed week. The gap is the
 * planned rest. Brand gradient tile from the Harbor tokens.
 */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  const gid = useId();
  return (
    <svg
      className="hb-logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-300)" />
          <stop offset="1" stopColor="var(--brand-500)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <path
        d="M16 6.5 A9.5 9.5 0 1 1 7.77 11.25"
        fill="none"
        stroke="var(--ink-on-brand)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3.2" fill="var(--ink-on-brand)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="row" style={{ gap: 10 }}>
      <LogoMark />
      <span className="hb-wordmark">Anilha</span>
    </span>
  );
}
