import type { LucideIcon } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Icon } from './primitives';

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  tone: 'brand' | 'danger';
  onAction: () => void;
}

/** Width of a revealed action. */
const OPEN = 96;
/** Movement before deciding whether the gesture is sideways or a scroll. */
const DECIDE = 10;
/** The edges of the screen belong to the back gesture. */
const EDGE = 24;

/**
 * A row that slides to show an action: dragged to the right, the start action (Repetir);
 * to the left, the end action (Apagar). The revealed action is a button that still needs
 * a tap, so a slip never deletes anything. Vertical scroll stays with the page, and the
 * hold menu of the row keeps working for who never finds the gesture.
 */
export function SwipeRow({
  start,
  end,
  children,
}: {
  start?: SwipeAction | null;
  end?: SwipeAction | null;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null } | null>(
    null,
  );
  const dragged = useRef(false);

  // Open: a touch anywhere else closes it.
  useEffect(() => {
    if (offset === 0) return;
    const close = (e: globalThis.PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOffset(0);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [offset]);

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
    gesture.current = { x: e.clientX, y: e.clientY, base: offset, axis: null };
    dragged.current = false;
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (g.axis === 'x') setDragging(true);
    }
    if (g.axis !== 'x') return;
    dragged.current = true;
    const min = end ? -OPEN * 1.25 : 0;
    const max = start ? OPEN * 1.25 : 0;
    setOffset(Math.max(min, Math.min(max, g.base + dx)));
  }

  function up() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    setDragging(false);
    setOffset((o) => (o > OPEN / 2 ? OPEN : o < -OPEN / 2 ? -OPEN : 0));
  }

  function clickCapture(e: MouseEvent) {
    // The click that ends a drag, or a tap on an open row, does not open the row.
    if (dragged.current || offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      if (!dragged.current) setOffset(0);
      dragged.current = false;
    }
  }

  const act = (a: SwipeAction) => () => {
    setOffset(0);
    a.onAction();
  };

  return (
    <div className="swipe" ref={root}>
      {start ? (
        <button
          type="button"
          className="swipe-action is-start"
          data-tone={start.tone}
          aria-hidden={offset <= 0}
          tabIndex={offset > 0 ? 0 : -1}
          onClick={act(start)}
        >
          <Icon icon={start.icon} />
          {start.label}
        </button>
      ) : null}
      {end ? (
        <button
          type="button"
          className="swipe-action is-end"
          data-tone={end.tone}
          aria-hidden={offset >= 0}
          tabIndex={offset < 0 ? 0 : -1}
          onClick={act(end)}
        >
          <Icon icon={end.icon} />
          {end.label}
        </button>
      ) : null}
      <div
        className={`swipe-front${dragging ? ' is-dragging' : ''}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onClickCapture={clickCapture}
        // A link dragged with the mouse would start the browser's own drag and drop.
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
