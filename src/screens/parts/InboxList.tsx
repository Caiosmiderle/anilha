import {
  Bell,
  CloudOff,
  Dumbbell,
  Megaphone,
  MessageSquare,
  ThumbsUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useRuns } from '../../data/hooks';
import { activityOf, CARDIO } from '../../engine/cardio';
import { fmtAgo } from '../../engine/format';
import type { RunRow } from '../../engine/types';
import { inboxKey, markInboxItemRead, markInboxSeen, useInbox } from '../../sync/inbox';
import { answerGroupInvite, ERROR_TEXT, type InboxItem } from '../../sync/social';
import { useToast } from '../../ui/overlays';
import { Button, Disc, Empty, LoadingCard } from '../../ui/primitives';
import { SharedRoutineSheet } from '../sheets/SharedRoutineSheet';

/**
 * The list of the inbox, shared by the page (phone) and the panel under the bell
 * (computer). A new item has a dot until it is touched or everything is marked as read.
 */
export function InboxList({ inbox }: { inbox: ReturnType<typeof useInbox> }) {
  const loaded = inbox.data !== undefined;
  const [routine, setRoutine] = useState<string | null>(null);
  return (
    <>
      {inbox.offline && !loaded ? (
        <Empty icon={CloudOff}>Sem conexão. Os avisos aparecem quando o sinal voltar.</Empty>
      ) : !loaded ? (
        <LoadingCard lines={4} />
      ) : inbox.items.length === 0 ? (
        <Empty icon={Bell}>Nada por aqui ainda. Convites e reações dos amigos aparecem aqui.</Empty>
      ) : (
        <div className="hb-list">
          {inbox.items.map((item) => {
            const key = inboxKey(item);
            const unread = inbox.isUnread(item);
            return (
              // Touching an item (opening or answering it) reads it.
              <div
                key={key}
                className={`inbox-row${unread ? ' is-unread' : ''}`}
                data-unread={unread ? 'true' : undefined}
                onClickCapture={() => {
                  if (unread) markInboxItemRead(key);
                }}
              >
                {unread ? <span className="hb-sr">Novo: </span> : null}
                <InboxRow
                  item={item}
                  onAnswered={() => void inbox.refresh()}
                  onOpenRoutine={setRoutine}
                />
              </div>
            );
          })}
        </div>
      )}
      <SharedRoutineSheet
        id={routine}
        onClose={() => setRoutine(null)}
        onAnswered={() => void inbox.refresh()}
      />
    </>
  );
}

/** "Marcar tudo como lido": shown while something is new. */
export function MarkAllRead({ unread }: { unread: number }) {
  if (!unread) return null;
  return (
    <button type="button" className="hb-btn-link" onClick={markInboxSeen}>
      Marcar tudo como lido
    </button>
  );
}

/**
 * Computer: the bell opens the inbox in a panel under it, without leaving the screen. It
 * closes on a click outside, on Escape or when an item takes to another screen.
 */
export function InboxPanel({ onClose }: { onClose: () => void }) {
  const inbox = useInbox();
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const opened = useRef(location.key);

  useEffect(() => {
    if (location.key !== opened.current) onClose();
  }, [location.key, onClose]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Element;
      if (ref.current?.contains(target) || target.closest?.('[data-testid="inbox-bell"]')) return;
      onClose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    ref.current?.focus();
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="inbox-panel" role="dialog" aria-label="Avisos" tabIndex={-1}>
      <div className="inbox-panel-head">
        <h2>Avisos</h2>
        <MarkAllRead unread={inbox.unread} />
      </div>
      <div className="inbox-panel-body">
        <InboxList inbox={inbox} />
      </div>
      <Link to="/avisos" className="hb-btn-link inbox-panel-foot">
        Abrir a página de avisos
      </Link>
    </div>
  );
}

/** "Na sua corrida", "No seu remo": the run is yours, so it is on this phone. */
function onYourCardio(runs: RunRow[] | undefined, id: string): string {
  const run = runs?.find((r) => r.id === id);
  const def = CARDIO[run ? activityOf(run) : 'corrida'];
  return `${def.fem ? 'Na sua' : 'No seu'} ${def.noun}`;
}

function InboxRow({
  item,
  onAnswered,
  onOpenRoutine,
}: {
  item: InboxItem;
  onAnswered: () => void;
  onOpenRoutine: (id: string) => void;
}) {
  const when = fmtAgo(item.at);
  const runs = useRuns();
  if (item.kind === 'routine') {
    const pending = item.status === 'pending';
    return (
      <button
        type="button"
        className="hb-list-row row-button"
        data-testid="inbox-item"
        onClick={() => onOpenRoutine(item.id)}
      >
        <Disc small icon={Dumbbell} pastel="sky" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">
            {pending
              ? `${item.actor_name} te mandou uma ficha: ${item.name}`
              : item.status === 'accepted'
                ? `Você adicionou a ficha ${item.name}`
                : `Você recusou a ficha ${item.name}`}
          </span>
          <span className="hb-list-sub">
            {pending ? 'Toque para ver os exercícios' : `De ${item.actor_name}`} · {when}
          </span>
        </span>
      </button>
    );
  }
  if (item.kind === 'announcement') {
    const inner = (
      <>
        <Disc small icon={Megaphone} pastel="butter" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">{item.title}</span>
          <span className="hb-list-sub inbox-title">
            {item.body} · {when}
          </span>
        </span>
      </>
    );
    // News from the team: opens the screen it talks about, when there is one.
    return item.url ? (
      <Link to={item.url} className="hb-list-row" data-testid="inbox-item">
        {inner}
      </Link>
    ) : (
      <div className="hb-list-row" data-testid="inbox-item">
        {inner}
      </div>
    );
  }
  if (item.kind === 'routine_accepted') {
    return (
      <Link to={`/amigos/${item.actor_id}`} className="hb-list-row" data-testid="inbox-item">
        <Disc small icon={Dumbbell} pastel="mint" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">
            {item.actor_name} adicionou sua ficha {item.name}
          </span>
          <span className="hb-list-sub">
            Já está nas fichas de {item.actor_name} · {when}
          </span>
        </span>
      </Link>
    );
  }
  if (item.kind === 'reaction') {
    const to =
      item.target_kind === 'session' ? `/historico/treino/${item.target_id}` : '/historico';
    return (
      <Link to={to} className="hb-list-row" data-testid="inbox-item">
        <Disc small icon={ThumbsUp} pastel="butter" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">{item.actor_name} mandou um boa</span>
          <span className="hb-list-sub">
            {item.target_kind === 'session' ? 'No seu treino' : onYourCardio(runs, item.target_id)}{' '}
            · {when}
          </span>
        </span>
      </Link>
    );
  }
  if (item.kind === 'friend') {
    return (
      <Link to={`/amigos/${item.actor_id}`} className="hb-list-row" data-testid="inbox-item">
        <Disc small icon={UserPlus} pastel="mint" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">{item.actor_name} aceitou seu convite</span>
          <span className="hb-list-sub">Agora vocês são amigos · {when}</span>
        </span>
      </Link>
    );
  }
  if (item.kind === 'agent_done') {
    // Something the assistant could not do: the team built it.
    return (
      <Link to="/plano/pedir" className="hb-list-row" data-testid="inbox-item">
        <Disc small icon={MessageSquare} pastel="lavender" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">O que você pediu agora dá para fazer</span>
          <span className="hb-list-sub inbox-title">
            “{item.pedido}” · {when}
          </span>
        </span>
      </Link>
    );
  }
  if (item.kind === 'ticket_answer') {
    return (
      <Link to="/mensagens" className="hb-list-row" data-testid="inbox-item">
        <Disc small icon={MessageSquare} pastel="sky" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">O Anilha respondeu sua mensagem</span>
          <span className="hb-list-sub">Toque para ler · {when}</span>
        </span>
      </Link>
    );
  }
  if (item.kind === 'group_joined') {
    return (
      <Link to={`/amigos/grupo/${item.group_id}`} className="hb-list-row" data-testid="inbox-item">
        <Disc small icon={Users} pastel="butter" />
        <span className="hb-list-main">
          <span className="hb-list-title inbox-title">
            {item.actor_name} entrou em {item.group_name}
          </span>
          <span className="hb-list-sub">Pelo seu convite · {when}</span>
        </span>
      </Link>
    );
  }
  // A kind this version does not know (a newer server): nothing, rather than a wrong row.
  if (item.kind !== 'group_invite') return null;
  return <GroupInviteRow item={item} when={when} onAnswered={onAnswered} />;
}

function GroupInviteRow({
  item,
  when,
  onAnswered,
}: {
  item: Extract<InboxItem, { kind: 'group_invite' }>;
  when: string;
  onAnswered: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function answer(accept: boolean) {
    setBusy(true);
    try {
      const r = await answerGroupInvite(item.id, accept);
      if (r.error) {
        toast.show(ERROR_TEXT[r.error] ?? 'Convite inválido', { error: true });
      } else if (accept) {
        toast.show(`Você entrou em ${item.group_name}`);
        navigate(`/amigos/grupo/${item.group_id}`);
      } else {
        toast.show('Convite recusado');
      }
      onAnswered();
    } catch {
      toast.show('Sem conexão agora', { error: true });
    } finally {
      setBusy(false);
    }
  }

  const pending = item.status === 'pending';
  return (
    <div className="hb-list-row" data-testid="inbox-item" style={{ alignItems: 'flex-start' }}>
      <Disc small icon={Users} pastel="butter" />
      <div className="hb-list-main stack-sm">
        <div>
          <span className="hb-list-title inbox-title">
            {pending
              ? `${item.actor_name} chamou você para ${item.group_name}`
              : item.status === 'accepted'
                ? `Você entrou em ${item.group_name}`
                : `Você recusou o convite para ${item.group_name}`}
          </span>
          <span className="hb-list-sub">
            {pending
              ? 'Desafio da semana: cumprir o próprio plano'
              : `Convite de ${item.actor_name}`}{' '}
            · {when}
          </span>
        </div>
        {pending ? (
          <div className="row" style={{ gap: 8 }}>
            <Button variant="tint" disabled={busy} onClick={() => void answer(true)}>
              Entrar no grupo
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void answer(false)}>
              Recusar
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
