import type { CSSProperties } from 'react';
import { interpolate } from 'remotion';
import { CLAMP, expoIn, expoOut, harborSpring } from '../anim';
import { TYPE, useBeat, useVideo, type TypeName } from '../layout';

/**
 * Tipografia cinética no tempo da música. Cada pedaço entra num tempo (`at`, em quadros
 * locais), batendo junto com um som da trilha: sobe de trás de uma máscara e assenta na
 * mola do Harbor. Sai inteiro, para cima, em `exit`.
 *
 * `parts`: pedaços de texto e o quadro em que cada um entra. "\n" quebra a linha.
 */
export function Kinetic({
  parts,
  exit,
  kind = 'headline',
  tone = 'light',
  muted = [],
  style,
}: {
  parts: { text: string; at: number }[];
  exit?: number;
  kind?: TypeName;
  tone?: 'light' | 'dark';
  /** Índices dos pedaços em cor secundária. */
  muted?: number[];
  style?: CSSProperties;
}) {
  const { f, fps } = useBeat();
  const { layout } = useVideo();
  const t = TYPE[kind];
  const size = t.size * layout.type * (kind === 'display' ? 1.25 : 1);
  const ink = tone === 'dark' ? 'var(--bg-warm)' : 'var(--ink-strong)';
  const soft = tone === 'dark' ? 'var(--ink-subtle)' : 'var(--ink-muted-aa)';
  const out = exit == null ? 0 : interpolate(f, [exit, exit + 9], [0, 1], { ...CLAMP, easing: expoIn });
  if (out >= 1) return null;

  // Agrupa em linhas, mantendo o índice de cada pedaço.
  const lines: { text: string; at: number; i: number }[][] = [[]];
  parts.forEach((p, i) => {
    const chunks = p.text.split('\n');
    chunks.forEach((c, k) => {
      if (k > 0) lines.push([]);
      if (c) (lines[lines.length - 1] as { text: string; at: number; i: number }[]).push({ text: c, at: p.at, i });
    });
  });

  return (
    <p
      className="kinetic"
      style={{
        fontSize: size,
        lineHeight: t.line,
        fontWeight: t.weight,
        letterSpacing: t.track * layout.type,
        color: ink,
        ...style,
      }}
    >
      {lines.map((line, li) => (
        <span key={li} className="kinetic-line">
          {line.map((w, wi) => {
            const inT = interpolate(f, [w.at, w.at + 10], [0, 1], { ...CLAMP, easing: expoOut });
            const settle = harborSpring(f, w.at, fps, 360);
            const y = (1 - inT) * 95 - out * 105;
            return (
              <span
                key={wi}
                className="kinetic-word"
                style={{
                  transform: `translateY(${y}%) scale(${1.035 - 0.035 * settle})`,
                  transformOrigin: '0% 100%',
                  opacity: Math.min(inT * 1.6, 1) * (1 - out),
                  color: muted.includes(w.i) ? soft : undefined,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}

/** O selo de marketing do Harbor (.hb-eyebrow), no zoom do formato. */
export function Eyebrow({ text, at, exit, style }: { text: string; at: number; exit?: number; style?: CSSProperties }) {
  const { f, fps } = useBeat();
  const { layout } = useVideo();
  const inT = harborSpring(f, at, fps, 420);
  const out = exit == null ? 0 : interpolate(f, [exit, exit + 8], [0, 1], { ...CLAMP, easing: expoIn });
  if (f < at || out >= 1) return null;
  // zoom também escala left e top: a posição fica num invólucro sem zoom.
  return (
    <div style={{ position: 'absolute', ...style }}>
      <span
        className="hb-eyebrow"
        style={{
          zoom: 2 * (layout.type / 1.5),
          transform: `translateY(${(1 - inT) * 8 - out * 8}px)`,
          opacity: Math.min(1, inT * 2) * (1 - out),
        }}
      >
        {text}
      </span>
    </div>
  );
}
