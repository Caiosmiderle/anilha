import {
  Ban,
  ClipboardList,
  CloudOff,
  Dumbbell,
  Lock,
  TrendingUp,
  UserMinus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToday } from '../data/hooks';
import { formatDDMM, weekStart } from '../engine/dates';
import { EXERCISES_BY_ID } from '../engine/exercises';
import { fmtNum } from '../engine/format';
import { effortLabel } from '../engine/taxonomy';
import { rpc } from '../sync/client';
import { useRemote } from '../sync/remote';
import { useRoutineThread } from '../sync/sharing';
import { blockUser, removeFriend, type FriendOverview } from '../sync/social';
import { Sheet, useToast } from '../ui/overlays';
import { Avatar, Button, Empty, Icon, LoadingCard, Widget } from '../ui/primitives';
import { ActivityRow, AdherenceLine } from './parts/social';

interface Details {
  items: { id: string; exercise_id: string; status: string; position: number }[];
  sets: {
    item_id: string;
    kind: string;
    load_kg: number | null;
    reps: number | null;
    seconds: number | null;
    rir: number | null;
  }[];
  exercises: { id: string; name: string }[];
}

export default function FriendDetail() {
  const { id } = useParams();
  const today = useToday();
  const navigate = useNavigate();
  const toast = useToast();
  const friends = useRemote<FriendOverview[]>('friends_overview', {
    p_week_start: weekStart(today),
  });
  const [confirm, setConfirm] = useState<'unfriend' | 'block' | null>(null);
  const [details, setDetails] = useState<{ title: string; data: Details | null } | null>(null);
  const f = friends.data?.find((x) => x.id === id);
  const thread = useRoutineThread(id ?? null);

  if (friends.offline && !friends.data) {
    return (
      <Empty icon={CloudOff}>
        Sem conexão. Os dados dos amigos aparecem quando o sinal voltar.
      </Empty>
    );
  }
  if (!friends.data) return <LoadingCard lines={4} />;
  if (!f) return <Empty icon={Users}>Amizade não encontrada.</Empty>;

  async function openDetails(sessionId: string, title: string) {
    setDetails({ title, data: null });
    try {
      const data = await rpc<Details>('friend_session_details', {
        p_friend: f?.id,
        p_session: sessionId,
      });
      setDetails({ title, data });
    } catch {
      setDetails(null);
      toast.show('Sem conexão agora', { error: true });
    }
  }

  return (
    <>
      <header className="page-head">
        <div className="row">
          <Avatar name={f.name} large />
          <div>
            <h1 className="page-title">{f.name}</h1>
            <p className="page-sub">
              {f.share_details ? 'Compartilha cargas e repetições' : 'Cargas e repetições privadas'}
            </p>
          </div>
        </div>
      </header>
      <div className="grid-2">
        <div className="stack">
          <Widget title="Plano desta semana">
            <AdherenceLine a={f.adherence} />
          </Widget>
          <FichasLink friendId={f.id} items={thread.data} />
          <Widget title="Treinos recentes">
            {f.activities === null ? (
              <p className="empty-line">Treinos privados.</p>
            ) : f.activities.length ? (
              <div className="stack-sm" style={{ gap: 0 }}>
                {f.activities.map((a) => (
                  <div key={`${a.kind}-${a.id}`}>
                    <ActivityRow friendId={f.id} a={a} onChanged={() => void friends.refresh()} />
                    {f.share_details && a.kind === 'session' ? (
                      <button
                        type="button"
                        className="hb-btn-link"
                        onClick={() => void openDetails(a.id, a.title)}
                      >
                        Ver séries
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-line">Nenhum treino nas últimas duas semanas.</p>
            )}
          </Widget>
        </div>
        <div className="stack">
          <Widget icon={TrendingUp} pastel="butter" title="Recordes">
            {f.records === null ? (
              <p className="empty-line">Recordes privados.</p>
            ) : f.records.length ? (
              <ul
                className="stack-sm t-regular"
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
              >
                {f.records.map((r, i) => (
                  <li key={i} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {r.exercise_name}
                      <span className="t-caption" style={{ display: 'block' }}>
                        {formatDDMM(r.local_date)}
                      </span>
                    </span>
                    {r.value != null ? (
                      <strong className="t-strong t-num">
                        {fmtNum(Number(r.value))} {r.unit === 'reps' ? 'reps' : r.unit}
                      </strong>
                    ) : (
                      <span className="t-caption row" style={{ gap: 4 }}>
                        <Icon icon={Lock} size={14} />
                        valor privado
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-line">Nenhum recorde no último mês.</p>
            )}
          </Widget>
          <div className="actions">
            <Button variant="outline" icon={UserMinus} onClick={() => setConfirm('unfriend')}>
              Desfazer amizade
            </Button>
            <Button variant="ghost" icon={Ban} onClick={() => setConfirm('block')}>
              Bloquear
            </Button>
          </div>
        </div>
      </div>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'block' ? `Bloquear ${f.name}?` : `Desfazer amizade com ${f.name}?`}
        actions={
          <>
            <Button
              variant="danger"
              block
              onClick={async () => {
                try {
                  if (confirm === 'block') await blockUser(f.id);
                  else await removeFriend(f.id);
                  toast.show(confirm === 'block' ? 'Bloqueado' : 'Amizade desfeita');
                  navigate('/amigos', { replace: true });
                } catch {
                  toast.show('Sem conexão agora', { error: true });
                }
              }}
            >
              {confirm === 'block' ? 'Bloquear' : 'Desfazer amizade'}
            </Button>
            <Button variant="tint" block onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
          </>
        }
      >
        <p className="t-regular" style={{ margin: 0 }}>
          {confirm === 'block'
            ? 'Vocês deixam de ver qualquer coisa um do outro, inclusive nos grupos, e novos convites entre vocês não funcionam.'
            : 'Vocês deixam de ver a aderência e os treinos um do outro. Dá para virar amigos de novo com um convite.'}
        </p>
      </Sheet>

      <Sheet open={details !== null} onClose={() => setDetails(null)} title={details?.title ?? ''}>
        {details?.data ? (
          details.data.items.length ? (
            <div className="stack">
              {details.data.items
                .filter((i) => i.status === 'done')
                .sort((a, b) => a.position - b.position)
                .map((it) => {
                  const name =
                    details.data?.exercises.find((e) => e.id === it.exercise_id)?.name ??
                    EXERCISES_BY_ID.get(it.exercise_id)?.name ??
                    it.exercise_id;
                  const sets =
                    details.data?.sets.filter((s) => s.item_id === it.id && s.kind === 'work') ??
                    [];
                  return (
                    <div key={it.id} className="stack-sm" style={{ gap: 4 }}>
                      <strong className="t-strong row" style={{ gap: 8 }}>
                        <Icon icon={Dumbbell} size={18} />
                        {name}
                      </strong>
                      <span className="t-regular t-num">
                        {sets
                          .map((s) =>
                            s.seconds != null
                              ? `${s.seconds} s`
                              : `${s.load_kg != null ? `${fmtNum(Number(s.load_kg))} kg × ` : ''}${s.reps ?? ''}${effortLabel(s.rir) ? ` (${effortLabel(s.rir)?.toLowerCase()})` : ''}`,
                          )
                          .join(', ') || 'Sem séries'}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="empty-line">Sem detalhes para mostrar.</p>
          )
        ) : (
          <LoadingCard lines={3} />
        )}
      </Sheet>
    </>
  );
}

/** A conversa de fichas com o amigo: quantas foram e voltaram, e as que esperam resposta. */
function FichasLink({
  friendId,
  items,
}: {
  friendId: string;
  items: ReturnType<typeof useRoutineThread>['data'];
}) {
  const sent = items?.filter((t) => t.mine).length ?? 0;
  const got = items?.filter((t) => !t.mine).length ?? 0;
  const waiting = items?.filter((t) => !t.mine && t.status === 'pending').length ?? 0;
  const sub =
    items === undefined
      ? 'Fichas que vocês mandaram um para o outro'
      : sent + got === 0
        ? 'Nenhuma ainda. Mande a primeira.'
        : `${got} ${got === 1 ? 'recebida' : 'recebidas'}, ${sent} ${sent === 1 ? 'enviada' : 'enviadas'}${waiting ? `. ${waiting} esperando você` : ''}`;
  return (
    <Link
      to={`/amigos/${friendId}/fichas`}
      className="hb-widget hb-list-row"
      style={{ textDecoration: 'none' }}
    >
      <span className="hb-disc-sm p-butter" aria-hidden="true">
        <Icon icon={ClipboardList} size={18} />
      </span>
      <span className="hb-list-main">
        <span className="hb-list-title" style={{ display: 'block' }}>
          Fichas entre vocês
        </span>
        <span className="hb-list-sub">{sub}</span>
      </span>
    </Link>
  );
}
