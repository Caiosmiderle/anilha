import { Eye, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToday } from '../../data/hooks';
import {
  deleteSession,
  itemsFromLastSession,
  itemsFromSession,
  startSession,
} from '../../data/ops';
import type { SessionRow } from '../../engine/types';
import { ActionList, Sheet, useToast, type MenuAction } from '../../ui/overlays';
import { Button } from '../../ui/primitives';

type Session = Pick<SessionRow, 'id' | 'title' | 'split_key' | 'routine_id' | 'status'>;

export function canRepeat(session: Session): boolean {
  return !!session.split_key && session.split_key !== 'livre' && session.status === 'done';
}

/** Starts a new session with what was done in this one, the session the person opened. */
export function useRepeatSession() {
  const navigate = useNavigate();
  const toast = useToast();
  const today = useToday();
  return async (session: Session) => {
    if (!session.split_key) return;
    // A session recorded in a few words has no exercises: then the last full one of the split.
    const own = await itemsFromSession(session.id);
    const its = own.length ? own : await itemsFromLastSession(session.split_key);
    if (!its?.length) {
      toast.show('Nada para repetir', { error: true });
      return;
    }
    const newId = await startSession({
      title: session.title,
      split_key: session.split_key,
      routine_id: session.routine_id,
      source: 'repeat',
      items: its,
      today,
    });
    navigate(`/treino/${newId}`);
  };
}

/**
 * Menu of a finished session: open, repeat, delete. Opened by holding the row in the
 * history or by the options button on the session page. Delete asks first.
 */
export function SessionActionsSheet({
  session,
  open,
  onClose,
  confirmOnly = false,
  showOpen = true,
}: {
  session: Session;
  open: boolean;
  onClose: () => void;
  /** Skip the menu and go straight to the delete question. */
  confirmOnly?: boolean;
  showOpen?: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const repeat = useRepeatSession();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const asking = confirm || confirmOnly;

  const close = () => {
    setConfirm(false);
    onClose();
  };

  const actions: MenuAction[] = [
    ...(showOpen
      ? [
          {
            icon: Eye,
            label: 'Ver treino',
            onSelect: () => {
              close();
              navigate(`/historico/treino/${session.id}`);
            },
          },
        ]
      : []),
    ...(canRepeat(session)
      ? [
          {
            icon: Repeat,
            label: 'Repetir este treino',
            hint: 'Começa um novo com o que você fez neste treino',
            onSelect: () => {
              close();
              void repeat(session);
            },
          },
        ]
      : []),
    { icon: Trash2, label: 'Apagar treino', onSelect: () => setConfirm(true) },
  ];

  return (
    <Sheet
      open={open}
      onClose={close}
      title={asking ? 'Apagar este treino?' : session.title}
      actions={
        asking ? (
          <>
            <Button
              variant="danger"
              block
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteSession(session.id);
                  toast.show('Treino apagado');
                  close();
                  navigate('/historico', { replace: true });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Apagar treino
            </Button>
            <Button variant="tint" block onClick={close}>
              Manter treino
            </Button>
          </>
        ) : undefined
      }
    >
      {asking ? (
        <p className="t-regular" style={{ margin: 0 }}>
          {session.title}: as séries somem do histórico e do progresso em todos os aparelhos.
        </p>
      ) : (
        <ActionList actions={actions} />
      )}
    </Sheet>
  );
}
