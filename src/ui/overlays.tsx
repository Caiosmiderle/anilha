import type { LucideIcon } from 'lucide-react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, IconButton } from './primitives';

/**
 * Bottom sheet on phones, centered modal on wide screens. Native <dialog>:
 * focus is trapped, Escape closes, the page behind is inert.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  actions,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="hb-sheet"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Tap on the backdrop closes.
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="hb-sheet-inner">
          <div className="hb-sheet-grip" aria-hidden="true" />
          {title ? (
            <div className="hb-sheet-head">
              <h2 className="hb-sheet-title" id={titleId}>
                {title}
              </h2>
              <IconButton icon={X} label="Fechar" onClick={onClose} />
            </div>
          ) : null}
          {children}
          {actions ? <div className="hb-sheet-actions">{actions}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export interface MenuAction {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onSelect: () => void;
}

export function ActionList({ actions }: { actions: MenuAction[] }) {
  return (
    <div className="hb-menu" role="menu">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          role="menuitem"
          className="hb-menu-item"
          onClick={a.onSelect}
        >
          <Icon icon={a.icon} />
          <span>
            {a.label}
            {a.hint ? <small>{a.hint}</small> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

interface ToastItem {
  id: number;
  text: string;
  error?: boolean;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show(text: string, opts?: { error?: boolean; action?: { label: string; run: () => void } }): void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback<ToastApi['show']>((text, opts = {}) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, text, ...opts }]);
    window.setTimeout(
      () => setItems((list) => list.filter((t) => t.id !== id)),
      opts.action ? 6000 : 3500,
    );
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="hb-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`hb-toast ${t.error ? 'is-error' : ''}`}>
            <Icon icon={t.error ? CircleAlert : CircleCheck} />
            <span>{t.text}</span>
            {t.action ? (
              <button
                type="button"
                className="hb-btn-link"
                onClick={() => {
                  t.action?.run();
                  setItems((list) => list.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('ToastProvider ausente');
  return v;
}
