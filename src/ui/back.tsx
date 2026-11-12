import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isBackSwipe, parentOf } from '../lib/back';
import { Icon } from './primitives';

/** Previous screen of the app if there is one; otherwise the screen above this one. */
function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

/** Only the installed iPhone app: Safari and Android already have their own back gesture. */
function isStandaloneIOS(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function useEdgeSwipe(onBack: (() => void) | null): void {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  const enabled = onBack != null;
  useEffect(() => {
    if (!enabled || !isStandaloneIOS()) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      // Not over an open sheet: there the swipe belongs to the sheet.
      start =
        e.touches.length === 1 && t && !document.querySelector('dialog[open]')
          ? { x: t.clientX, y: t.clientY }
          : null;
    };
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (start && t && isBackSwipe(start, { x: t.clientX, y: t.clientY })) latest.current?.();
      start = null;
    };
    const cancel = () => {
      start = null;
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', cancel);
    };
  }, [enabled]);
}

/** "Voltar" at the top left of every screen below a tab, where iOS puts it. */
export function BackBar() {
  const { pathname } = useLocation();
  const parent = parentOf(pathname);
  const goBack = useGoBack(parent ?? '/');
  useEdgeSwipe(parent ? goBack : null);
  if (!parent) return null;
  return (
    <div className="backbar">
      <button type="button" className="hb-btn-link backbar-btn" onClick={goBack}>
        <Icon icon={ChevronLeft} size={22} />
        Voltar
      </button>
    </div>
  );
}
