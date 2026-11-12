import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

/** **bold** inside a line, as React nodes (never HTML from the model). */
function inline(line: string): ReactNode[] {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

/** The assistant's text: paragraphs, "- " lists and bold, the little it writes. */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={b} className="agent-list">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*] /, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <Fragment key={i}>
                {i ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/**
 * The answer appearing as typed: the text is already whole, it only shows in pieces. Who
 * asks the system for less motion sees it at once. A text types once: turned off midway
 * (the popup closed) it shows whole, and turned on again it stays whole.
 */
export function useTyped(text: string, on: boolean): { shown: string; done: boolean } {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [count, setCount] = useState(on && !reduce ? 0 : text.length);
  const typed = useRef<string | null>(on && !reduce ? null : text);
  useEffect(() => {
    if (!on || reduce || typed.current === text) {
      typed.current = text;
      setCount(text.length);
      return;
    }
    let frame = 0;
    let n = 0;
    const tick = () => {
      // About 150 characters a second, faster for long answers.
      n += Math.max(2, Math.ceil(text.length / 240));
      setCount(Math.min(n, text.length));
      if (n < text.length) frame = requestAnimationFrame(tick);
      else typed.current = text;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, on, reduce]);
  return { shown: text.slice(0, count), done: count >= text.length };
}
