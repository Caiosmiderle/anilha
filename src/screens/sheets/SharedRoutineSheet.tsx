import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtAgo } from '../../engine/format';
import {
  addSharedRoutine,
  declineSharedRoutine,
  receivedRoutineId,
  useSharedRoutine,
} from '../../sync/sharing';
import { Sheet, useToast } from '../../ui/overlays';
import { Button, Empty, ErrorText, LoadingCard } from '../../ui/primitives';
import { RoutineItems } from '../parts/RoutineItems';

/** A ficha someone sent: what is in it, and add it or decline. */
export function SharedRoutineSheet({
  id,
  onClose,
  onAnswered,
}: {
  id: string | null;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const shared = useSharedRoutine(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = shared.data;
  const open = s?.status === 'pending' && !s.mine;

  async function add() {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      const routineId = await addSharedRoutine(s);
      toast.show('Ficha adicionada aos seus treinos');
      onAnswered();
      onClose();
      navigate(`/plano/rotina/${routineId}`);
    } catch {
      setError(navigator.onLine ? 'Não deu para adicionar agora' : 'Sem conexão agora');
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      await declineSharedRoutine(s.id);
      toast.show('Ficha recusada');
      onAnswered();
      onClose();
    } catch {
      setError('Sem conexão agora');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={id !== null}
      onClose={onClose}
      title={s?.name ?? 'Ficha'}
      actions={
        open ? (
          <>
            <Button variant="primary" block disabled={busy} onClick={() => void add()}>
              Adicionar às minhas fichas
            </Button>
            <Button variant="tint" block disabled={busy} onClick={() => void decline()}>
              Recusar
            </Button>
          </>
        ) : s?.status === 'accepted' && !s.mine ? (
          <Button
            variant="tint"
            block
            onClick={() => {
              onClose();
              navigate(`/plano/rotina/${receivedRoutineId(s.id)}`);
            }}
          >
            Abrir a ficha
          </Button>
        ) : undefined
      }
    >
      {s === undefined ? (
        shared.offline ? (
          <p className="t-regular">Sem conexão. A ficha aparece quando voltar.</p>
        ) : (
          <LoadingCard lines={3} />
        )
      ) : s === null ? (
        <Empty>Esta ficha não está mais disponível.</Empty>
      ) : (
        <div className="stack">
          <span className="t-caption">
            {s.mine ? 'Você enviou' : `De ${s.sender_name}`} · {fmtAgo(s.created_at)}
            {s.status === 'accepted'
              ? ' · adicionada'
              : s.status === 'declined'
                ? ' · recusada'
                : ''}
          </span>
          {s.note ? <p className="t-regular ticket-answer ticket-text">{s.note}</p> : null}
          <RoutineItems items={s.items} exercises={s.exercises} />
          {open ? (
            <p className="t-caption" style={{ margin: 0 }}>
              Vira um treino seu, em Plano, Treinos. Depois você muda o que quiser. Quem mandou não
              é conferido pelo Anilha como profissional: avalie antes de treinar.
            </p>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
        </div>
      )}
    </Sheet>
  );
}
