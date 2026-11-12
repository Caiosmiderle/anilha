import { CloudOff, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExerciseMap } from '../../data/hooks';
import type { RoutineItemRow, RoutineRow } from '../../engine/types';
import { routinePayload, sendRoutine, useMyFriends } from '../../sync/sharing';
import { Sheet, useToast } from '../../ui/overlays';
import { Button, Choices, Empty, ErrorText, LoadingCard, TextField } from '../../ui/primitives';

/** Sends one of your fichas to a friend: it arrives in their inbox to add or decline. */
export function SendRoutineSheet({
  open,
  onClose,
  routine,
  items,
}: {
  open: boolean;
  onClose: () => void;
  routine: RoutineRow;
  items: RoutineItemRow[];
}) {
  const friends = useMyFriends();
  const exMap = useExerciseMap();
  const toast = useToast();
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = friends.data ?? [];

  async function send() {
    if (!to || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendRoutine(to, routine.name, note.trim(), routinePayload(items, exMap));
      if (r.error) {
        setError('Vocês não são mais amigos no Anilha.');
        return;
      }
      toast.show(`Ficha enviada para ${list.find((f) => f.id === to)?.name ?? 'seu amigo'}`);
      setTo(null);
      setNote('');
      onClose();
    } catch (err) {
      setError(
        navigator.onLine
          ? (err as Error).message || 'Não deu para enviar agora'
          : 'Sem conexão. A ficha não foi enviada.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Enviar ficha"
      actions={
        list.length ? (
          <Button variant="primary" block disabled={!to || busy} onClick={() => void send()}>
            {busy ? 'Enviando' : 'Enviar'}
          </Button>
        ) : undefined
      }
    >
      <div className="stack">
        <p className="t-regular" style={{ margin: 0 }}>
          {routine.name}, com {items.length} {items.length === 1 ? 'exercício' : 'exercícios'}.
          Chega no sino de quem você escolher, que decide se adiciona às próprias fichas.
        </p>
        {friends.offline && !friends.data ? (
          <Empty icon={CloudOff}>Sem conexão. Para enviar, conecte.</Empty>
        ) : !friends.data ? (
          <LoadingCard lines={2} />
        ) : list.length === 0 ? (
          <Empty icon={Users}>
            Ficha vai para amigos do Anilha. <Link to="/amigos">Convide alguém</Link> primeiro.
          </Empty>
        ) : (
          <>
            <Choices<string>
              label="Para quem"
              options={list.map((f) => ({ value: f.id, label: f.name }))}
              selected={to ? [to] : []}
              onToggle={setTo}
            />
            <TextField
              label="Recado (opcional)"
              value={note}
              maxLength={300}
              placeholder="Ex.: faz duas vezes na semana"
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}
