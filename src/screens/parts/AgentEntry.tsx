import { MessageSquareText, X } from 'lucide-react';
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccount } from '../../app/account';
import { lazyScreen } from '../../lib/lazyScreen';
import { Chip, Icon, IconButton, LoadingCard } from '../../ui/primitives';

const AgentChat = lazyScreen(
  () => import('../AgentChat'),
  (m) => m.default,
);

/**
 * The assistant stays mounted after its first open: minimizing keeps the draft, proposals
 * and undo, even while a response is on its way. A different account gets a fresh widget.
 */
export function AgentEntry() {
  const { userId } = useAccount();
  return <AgentWidget key={userId} />;
}

function AgentWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const titleId = useId();
  // Saved links still open the full conversation; avoid a second chat on that screen.
  const standalone = pathname === '/plano/pedir';
  const visible = open && !standalone;

  useEffect(() => {
    const d = dialog.current;
    const viewport = window.visualViewport;
    if (!visible || !d || !viewport) return;

    // VisualViewport is one coordinate system: innerHeight can change independently
    // on iOS. Subtracting its height from the fixed dialog's layout collapsed the chat.
    let frame = 0;
    function update() {
      frame = 0;
      if (viewport!.height <= 0) return;
      d!.style.setProperty('--agent-viewport-height', `${viewport!.height}px`);
      d!.style.setProperty('--agent-viewport-top', `${Math.max(0, viewport!.offsetTop)}px`);
      d!.toggleAttribute('data-compact-viewport', viewport!.height < 550);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      d.style.removeProperty('--agent-viewport-height');
      d.style.removeProperty('--agent-viewport-top');
      d.removeAttribute('data-compact-viewport');
    };
  }, [visible]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (visible && !d.open) d.showModal();
    else if (!visible && d.open) d.close();
  }, [visible]);

  function close() {
    setOpen(false);
    dialog.current?.close();
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="agent-launcher"
        hidden={standalone}
        aria-label="Falar com Waltér"
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={visible}
        onClick={() => {
          setActivated(true);
          setOpen(true);
        }}
      >
        <Icon icon={MessageSquareText} size={22} />
        <span>Falar com Waltér</span>
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="agent-popup"
        aria-labelledby={titleId}
        onCancel={(ev) => {
          ev.preventDefault();
          close();
        }}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) {
            const bounds = ev.currentTarget.getBoundingClientRect();
            if (
              ev.clientX < bounds.left ||
              ev.clientX > bounds.right ||
              ev.clientY < bounds.top ||
              ev.clientY > bounds.bottom
            )
              close();
          }
        }}
      >
        <div className="agent-popup-surface">
          <header className="agent-popup-head">
            <span className="agent-entry-icon" aria-hidden="true">
              <Icon icon={MessageSquareText} />
            </span>
            <div className="agent-popup-heading">
              <h2 id={titleId}>Waltér</h2>
              <Chip pastel="lavender">Beta</Chip>
            </div>
            <IconButton icon={X} label="Fechar conversa com Waltér" onClick={close} />
          </header>
          {activated ? (
            <Suspense
              fallback={
                <div className="agent-popup-loading">
                  <LoadingCard lines={3} />
                </div>
              }
            >
              <AgentChat embedded active={visible} onNavigate={close} />
            </Suspense>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
