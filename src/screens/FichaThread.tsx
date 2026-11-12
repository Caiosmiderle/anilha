import { CircleCheck, Clock, CloudOff, Send, Users, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useExerciseMap, useRoutineItems, useRoutines, useToday } from '../data/hooks';
import { formatDDMM, toLocalDate, weekday, WEEKDAY_SHORT, weekStart } from '../engine/dates';
import { routinePayload, sendRoutine, useRoutineThread, type ThreadItem } from '../sync/sharing';
import { useRemote } from '../sync/remote';
import type { FriendOverview } from '../sync/social';
import { Sheet, useToast } from '../ui/overlays';
import { Avatar, Button, Choices, Empty, ErrorText, Icon, LoadingCard } from '../ui/primitives';
import { SharedRoutineSheet } from './sheets/SharedRoutineSheet';

/** "Seg, 19/10, 07:42" a partir do instante do servidor, no fuso do aparelho. */
function when(iso: string): string {
  const d = new Date(iso);
  const day = toLocalDate(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAY_SHORT[weekday(day)]}, ${formatDDMM(day)}, ${hh}:${mm}`;
}

/** O que aconteceu com a ficha, do ponto de vista de quem está lendo. */
function status(t: ThreadItem, friend: string): { icon: LucideIcon; text: string; done: boolean } {
  if (t.mine) {
    if (t.status === 'accepted')
      return { icon: CircleCheck, text: `${friend} adicionou`, done: true };
    if (t.status === 'declined') return { icon: X, text: `${friend} recusou`, done: false };
    return { icon: Clock, text: `Aguardando ${friend}`, done: false };
  }
  if (t.status === 'accepted') return { icon: CircleCheck, text: 'Você adicionou', done: true };
  if (t.status === 'declined') return { icon: X, text: 'Você recusou', done: false };
  return { icon: Clock, text: 'Esperando você', done: false };
}

/**
 * A conversa com um amigo, só de fichas: o que cada um mandou, em balões, e o que o outro
 * fez com cada uma. Não há campo de texto: o único jeito de falar é mandar uma ficha.
 */
export default function FichaThread() {
  const { id = '' } = useParams();
  const today = useToday();
  const toast = useToast();
  const friends = useRemote<FriendOverview[]>('friends_overview', {
    p_week_start: weekStart(today),
  });
  const friend = friends.data?.find((f) => f.id === id);
  const thread = useRoutineThread(id);
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const scrolled = useRef(false);
  const name = friend?.name ?? 'seu amigo';
  const first = name.split(' ')[0] ?? name;

  // A mais nova fica embaixo, perto do botão de mandar: abre já lá.
  useEffect(() => {
    if (thread.data && !scrolled.current) {
      scrolled.current = true;
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [thread.data]);

  if ((friends.offline && !friends.data) || (thread.offline && !thread.data)) {
    return <Empty icon={CloudOff}>Sem conexão. As fichas aparecem quando o sinal voltar.</Empty>;
  }
  if (!friends.data || !thread.data) return <LoadingCard lines={4} />;
  if (!friend) return <Empty icon={Users}>Amizade não encontrada.</Empty>;

  return (
    <>
      <header className="page-head">
        <div className="row">
          <Avatar name={friend.name} large />
          <div>
            <h1 className="page-title">Fichas com {first}</h1>
            <p className="page-sub">Só fichas: quem mandou, quem adicionou. Sem mensagens.</p>
          </div>
        </div>
      </header>

      {thread.data.length ? (
        <ol className="thread" aria-label={`Fichas entre você e ${first}`}>
          {thread.data.map((t) => {
            const st = status(t, first);
            return (
              <li key={t.id} className={`thread-item ${t.mine ? 'is-mine' : ''}`}>
                <div className="thread-bubble">
                  <span className="thread-meta">
                    {t.mine ? 'Você mandou' : `${first} mandou`} · {when(t.created_at)}
                  </span>
                  <strong className="thread-title">{t.name}</strong>
                  <span className="thread-meta">
                    {t.exercises} {t.exercises === 1 ? 'exercício' : 'exercícios'}
                  </span>
                  {t.note ? <p className="thread-note">“{t.note}”</p> : null}
                  <div className="thread-foot">
                    <span className={`thread-status ${st.done ? 'is-done' : ''}`}>
                      <Icon icon={st.icon} size={16} />
                      {st.text}
                    </span>
                    {!t.mine && t.status === 'pending' ? (
                      <Button variant="tint" onClick={() => setOpen(t.id)}>
                        Ver e adicionar
                      </Button>
                    ) : (
                      <button type="button" className="hb-btn-link" onClick={() => setOpen(t.id)}>
                        Ver ficha
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty icon={Send}>Nenhuma ficha entre vocês ainda. Mande a primeira.</Empty>
      )}

      <div className="thread-send">
        <Button variant="primary" block icon={Send} onClick={() => setPicking(true)}>
          Mandar uma ficha
        </Button>
      </div>

      <SharedRoutineSheet
        id={open}
        onClose={() => setOpen(null)}
        onAnswered={() => void thread.refresh()}
      />
      {picking ? (
        <PickFicha
          friendId={friend.id}
          friendName={first}
          onClose={() => setPicking(false)}
          onSent={() => {
            toast.show(`Ficha enviada para ${first}`);
            void thread.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/** Escolher um dos seus treinos e mandar. Sem recado: a conversa é só de fichas. */
function PickFicha({
  friendId,
  friendName,
  onClose,
  onSent,
}: {
  friendId: string;
  friendName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const routines = useRoutines();
  const items = useRoutineItems();
  const exMap = useExerciseMap();
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(
    () =>
      routines
        .map((r) => ({ r, n: items.filter((i) => i.routine_id === r.id).length }))
        .filter((x) => x.n > 0),
    [routines, items],
  );

  async function send() {
    const chosen = options.find((o) => o.r.id === pick);
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      const own = items.filter((i) => i.routine_id === chosen.r.id);
      const res = await sendRoutine(friendId, chosen.r.name, '', routinePayload(own, exMap));
      if (res.error) {
        setError('Vocês não são mais amigos no Anilha.');
        return;
      }
      onSent();
      onClose();
    } catch (err) {
      setError(
        navigator.onLine
          ? (err as Error).message || 'Não deu para mandar agora'
          : 'Sem conexão. A ficha não foi enviada.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Mandar ficha para ${friendName}`}
      actions={
        options.length ? (
          <Button variant="primary" block disabled={!pick || busy} onClick={() => void send()}>
            {busy ? 'Mandando' : 'Mandar'}
          </Button>
        ) : undefined
      }
    >
      <div className="stack">
        {options.length ? (
          <Choices<string>
            label="Qual treino"
            options={options.map((o) => ({
              value: o.r.id,
              label: `${o.r.name} (${o.n} ${o.n === 1 ? 'exercício' : 'exercícios'})`,
            }))}
            selected={pick ? [pick] : []}
            onToggle={setPick}
          />
        ) : (
          <Empty icon={Send}>
            Nenhum treino com exercícios ainda.{' '}
            <Link to="/plano?aba=treinos">Montar um treino</Link>.
          </Empty>
        )}
        <p className="t-caption" style={{ margin: 0 }}>
          Chega no sino de {friendName}, que decide se adiciona aos próprios treinos.
        </p>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}
