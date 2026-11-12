import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

const HOLD_MS = 450;
const MOVE_PX = 10;

/**
 * Hold a row to open its menu. Touch hold or right click; a scroll cancels it, and the
 * click that ends a hold does not also open the row.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const fire = useCallback(() => {
    fired.current = true;
    cancel();
    navigator.vibrate?.(10);
    onLongPress();
  }, [cancel, onLongPress]);

  return {
    onPointerDown(e: PointerEvent) {
      fired.current = false;
      if (e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(fire, HOLD_MS);
    },
    onPointerMove(e: PointerEvent) {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      if (!fired.current) fire();
    },
    onClickCapture(e: MouseEvent) {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
