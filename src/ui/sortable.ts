import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/** Rows near the top or bottom of the screen scroll the page while dragging. */
const EDGE_TOP = 90;
const EDGE_BOTTOM = 140;
const SCROLL_STEP = 14;

type Drag = {
  from: number;
  to: number;
  startY: number;
  startScroll: number;
  /** Rows in page coordinates at the start: scrolling while dragging does not shift them. */
  tops: number[];
  heights: number[];
};

/**
 * Drag a row of a vertical list by its handle. `reorder`: the row follows the finger and the
 * others make room; `swap`: the row follows the finger and the row under it lights up. On
 * release, `onMove(from, to)`. Arrow keys on the handle move one step, for the keyboard and
 * screen readers. Rows are the children of `listRef` marked with `data-sortable`.
 */
export function useSortable(
  count: number,
  onMove: (from: number, to: number) => void,
  mode: 'reorder' | 'swap' = 'reorder',
): {
  listRef: RefObject<HTMLDivElement | null>;
  handle: (index: number) => {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  };
  rowStyle: (index: number) => CSSProperties | undefined;
  rowClass: (index: number) => string;
} {
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [view, setView] = useState<{ from: number; to: number; dy: number } | null>(null);

  function rows(): HTMLElement[] {
    return Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(':scope > [data-sortable]') ?? [],
    );
  }

  function targetFor(d: Drag, center: number): number {
    if (mode === 'swap') {
      for (let i = 0; i < d.tops.length; i += 1) {
        const top = d.tops[i] as number;
        if (center >= top && center < top + (d.heights[i] as number)) return i;
      }
      return center < (d.tops[0] ?? 0) ? 0 : d.tops.length - 1;
    }
    for (let i = 0; i < d.from; i += 1)
      if (center < (d.tops[i] as number) + (d.heights[i] as number) / 2) return i;
    for (let i = d.tops.length - 1; i > d.from; i -= 1)
      if (center > (d.tops[i] as number) + (d.heights[i] as number) / 2) return i;
    return d.from;
  }

  const handle = (index: number) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const rects = rows().map((r) => r.getBoundingClientRect());
      drag.current = {
        from: index,
        to: index,
        startY: e.clientY,
        startScroll: window.scrollY,
        tops: rects.map((r) => r.top + window.scrollY),
        heights: rects.map((r) => r.height),
      };
      setView({ from: index, to: index, dy: 0 });
      navigator.vibrate?.(8);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d) return;
      if (e.clientY < EDGE_TOP) window.scrollBy(0, -SCROLL_STEP);
      else if (e.clientY > window.innerHeight - EDGE_BOTTOM) window.scrollBy(0, SCROLL_STEP);
      const dy = e.clientY + window.scrollY - (d.startY + d.startScroll);
      const center = (d.tops[d.from] as number) + (d.heights[d.from] as number) / 2 + dy;
      const to = targetFor(d, center);
      if (to !== d.to) {
        d.to = to;
        navigator.vibrate?.(4);
      }
      setView({ from: d.from, to, dy });
    },
    onPointerUp() {
      const d = drag.current;
      drag.current = null;
      setView(null);
      if (d && d.to !== d.from) onMove(d.from, d.to);
    },
    onPointerCancel() {
      drag.current = null;
      setView(null);
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        onMove(index, index - 1);
      } else if (e.key === 'ArrowDown' && index < count - 1) {
        e.preventDefault();
        onMove(index, index + 1);
      }
    },
  });

  function rowStyle(index: number): CSSProperties | undefined {
    if (!view) return undefined;
    const d = drag.current;
    if (index === view.from) return { transform: `translateY(${view.dy}px)` };
    if (mode === 'swap' || !d) return undefined;
    // Room for the dragged row: the rows between where it was and where it goes shift.
    const step = d.heights[view.from] ?? 0;
    if (view.from < view.to && index > view.from && index <= view.to)
      return { transform: `translateY(${-step}px)` };
    if (view.from > view.to && index >= view.to && index < view.from)
      return { transform: `translateY(${step}px)` };
    return undefined;
  }

  function rowClass(index: number): string {
    if (!view) return '';
    if (index === view.from) return ' is-lifted';
    if (mode === 'swap' && index === view.to && view.to !== view.from) return ' is-drop-target';
    return ' is-shifting';
  }

  return { listRef, handle, rowStyle, rowClass };
}
