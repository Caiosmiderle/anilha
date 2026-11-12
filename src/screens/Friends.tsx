import {
  ChevronRight,
  CloudOff,
  KeyRound,
  Lock,
  Plus,
  Share2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToday } from '../data/hooks';
import { fmtPct } from '../engine/adherence';
import { weekStart } from '../engine/dates';
import { useRemote } from '../sync/remote';
import {
  acceptInvite,
  createGroup,
  createInvite,
  ERROR_TEXT,
  inviteInfo,
  inviteLink,
  joinGroup,
  shareText,
  type FriendOverview,
  type GroupSummary,
  type RankingRow,
} from '../sync/social';
import { Sheet, useToast } from '../ui/overlays';
import { ActivityRow, AdherenceLine } from './parts/social';
import {
  Avatar,
  Button,
  Empty,
  ErrorText,
  Icon,
  LoadingCard,
  TextField,
  Widget,
} from '../ui/primitives';

export default function Friends() {
  const today = useToday();
  const navigate = useNavigate();
  const ws = weekStart(today);
  const friends = useRemote<FriendOverview[]>('friends_overview', { p_week_start: ws });
  const groups = useRemote<GroupSummary[]>('my_groups', {});
  const [sheet, setSheet] = useState<'invite' | 'code' | 'group' | null>(null);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Amigos</h1>
          <p className="page-sub">Constância junto. Ninguém vê suas cargas sem você liberar.</p>
        </div>
      </header>

      <div className="actions">
        <Button variant="primary" icon={UserPlus} onClick={() => setSheet('invite')}>
          Convidar amigo
        </Button>
        <Button variant="tint" icon={KeyRound} onClick={() => setSheet('code')}>
          Usar código
        </Button>
      </div>

      {friends.offline ? (
        <div className="hb-advice" role="status">
          <Icon icon={CloudOff} />
          <span>Sem conexão. Amigos e grupos aparecem quando o sinal voltar.</span>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="stack">
          <h2 className="section-title">Amigos</h2>
          {friends.data === undefined && !friends.offline ? <LoadingCard lines={3} /> : null}
          {friends.data?.length === 0 ? (
            <Empty icon={Users}>Nenhum amigo ainda. Convide pelo link.</Empty>
          ) : null}
          {friends.data?.map((f) => (
            <Widget
              key={f.id}
              title={
                <Link
                  to={`/amigos/${f.id}`}
                  className="row"
                  style={{ gap: 10, color: 'inherit', textDecoration: 'none' }}
                >
                  <Avatar name={f.name} large />
                  {f.name}
                </Link>
              }
              action={
                <Link to={`/amigos/${f.id}`} className="hb-iconbtn" aria-label={`Ver ${f.name}`}>
                  <Icon icon={ChevronRight} />
                </Link>
              }
            >
              <div className="stack">
                <AdherenceLine a={f.adherence} />
                {f.activities === null ? (
                  <span className="t-caption">Treinos privados</span>
                ) : f.activities.length ? (
                  <div className="stack-sm" style={{ gap: 0 }}>
                    {f.activities.slice(0, 3).map((a) => (
                      <ActivityRow
                        key={`${a.kind}-${a.id}`}
                        friendId={f.id}
                        a={a}
                        onChanged={() => void friends.refresh()}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="t-caption">Nenhum treino nas últimas duas semanas.</span>
                )}
              </div>
            </Widget>
          ))}
        </div>
        <div className="stack">
          <h2 className="section-title">Grupos</h2>
          {groups.data?.length === 0 ? (
            <p className="empty-line">Nenhum grupo. Crie um desafio de constância.</p>
          ) : null}
          {groups.data?.map((g) => (
            <GroupPreview
              key={g.id}
              group={g}
              weekStartDay={ws}
              onOpen={() => navigate(`/amigos/grupo/${g.id}`)}
            />
          ))}
          <Button variant="outline" icon={Plus} onClick={() => setSheet('group')}>
            Criar grupo
          </Button>
          <div className="hb-advice" role="note">
            <Icon icon={Lock} />
            <span>
              Perfil privado: só amigos veem o que você libera em{' '}
              <Link to="/voce/privacidade" className="hb-btn-link" style={{ minHeight: 0 }}>
                Você
              </Link>
              .
            </span>
          </div>
        </div>
      </div>

      {sheet === 'invite' ? <InviteSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'code' ? (
        <CodeSheet
          onClose={() => setSheet(null)}
          onDone={() => {
            void friends.refresh();
            void groups.refresh();
          }}
        />
      ) : null}
      {sheet === 'group' ? (
        <GroupSheet
          onClose={() => setSheet(null)}
          onCreated={(id) => {
            void groups.refresh();
            navigate(`/amigos/grupo/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

function GroupPreview({
  group,
  weekStartDay,
  onOpen,
}: {
  group: GroupSummary;
  weekStartDay: string;
  onOpen: () => void;
}) {
  const ranking = useRemote<{ members?: RankingRow[]; error?: string }>('group_ranking', {
    p_group: group.id,
    p_week_start: weekStartDay,
  });
  const rows = ranking.data?.members ?? [];
  return (
    <Widget
      icon={Users}
      pastel="butter"
      title={group.name}
      sub={`Desafio da semana · ${group.members} ${group.members === 1 ? 'pessoa' : 'pessoas'}`}
      action={
        <button
          type="button"
          className="hb-iconbtn"
          aria-label={`Abrir ${group.name}`}
          onClick={onOpen}
        >
          <Icon icon={ChevronRight} />
        </button>
      }
    >
      {rows.length ? (
        <ol className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.slice(0, 3).map((r) => (
            <li key={r.id} className="row t-regular">
              <span className="t-caption t-num" style={{ width: 20 }}>
                {r.position}
              </span>
              <span style={{ flex: 1 }}>{r.is_me ? `${r.name} (você)` : r.name}</span>
              <strong className="t-strong t-num">{fmtPct(Number(r.pct))}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <LoadingCard lines={1} />
      )}
    </Widget>
  );
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [invite, setInvite] = useState<{ code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function make() {
    setBusy(true);
    setError(null);
    try {
      const r = await createInvite();
      if (r.error) setError(ERROR_TEXT[r.error] ?? 'Não deu agora');
      else setInvite(r);
    } catch {
      setError('Sem conexão agora');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title="Convidar amigo"
      actions={
        invite ? (
          <Button
            variant="primary"
            block
            icon={Share2}
            onClick={async () => {
              const r = await shareText(
                'Anilha',
                'Bora treinar junto no Anilha:',
                inviteLink(invite.code),
              );
              if (r === 'copied') toast.show('Link copiado');
            }}
          >
            Compartilhar convite
          </Button>
        ) : (
          <Button variant="primary" block onClick={() => void make()} disabled={busy}>
            {busy ? 'Gerando' : 'Gerar convite'}
          </Button>
        )
      }
    >
      <div className="stack">
        <p className="t-regular" style={{ margin: 0 }}>
          O convite vale por 7 dias e para uma pessoa. Não existe busca pública: só entra quem tem o
          link ou o código.
        </p>
        {invite ? (
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            <span className="t-caption">Código</span>
            <span
              className="hb-recog-value t-num"
              data-testid="invite-code"
              style={{ letterSpacing: 2 }}
            >
              {invite.code}
            </span>
            <span className="t-caption" style={{ wordBreak: 'break-all', textAlign: 'center' }}>
              {inviteLink(invite.code)}
            </span>
          </div>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}

function CodeSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const c = code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (c.length !== 8) return setError('Código tem 8 caracteres');
    setBusy(true);
    setError(null);
    try {
      const info = await inviteInfo(c);
      if (!info.error) {
        const r = await acceptInvite(c);
        if (r.error) throw new Error(r.error);
        toast.show(`Agora você e ${r.name} são amigos`);
        onDone();
        onClose();
        return;
      }
      if (info.error === 'invalido') {
        const g = await joinGroup(c);
        if (!g.error) {
          toast.show(`Você entrou em ${g.name}`);
          onDone();
          onClose();
          return;
        }
        setError(ERROR_TEXT[g.error] ?? 'Código inválido');
      } else {
        setError(ERROR_TEXT[info.error] ?? 'Código inválido');
      }
    } catch (err) {
      setError(ERROR_TEXT[(err as Error).message] ?? 'Sem conexão agora');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title="Usar código"
      actions={
        <Button variant="primary" block onClick={() => void submit()} disabled={busy}>
          {busy ? 'Conferindo' : 'Usar código'}
        </Button>
      }
    >
      <TextField
        label="Código de convite ou de grupo"
        value={code}
        maxLength={12}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="ABCD2345"
        onChange={(e) => setCode(e.target.value)}
        error={error}
      />
    </Sheet>
  );
}

function GroupSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Criar grupo"
      actions={
        <Button
          variant="primary"
          block
          onClick={async () => {
            if (!name.trim()) return setError('Dê um nome');
            try {
              const r = await createGroup(name.trim());
              if (r.error) return setError(ERROR_TEXT[r.error] ?? 'Não deu agora');
              onClose();
              onCreated(r.id);
            } catch {
              setError('Sem conexão agora');
            }
          }}
        >
          Criar grupo
        </Button>
      }
    >
      <div className="stack">
        <TextField
          label="Nome do grupo"
          value={name}
          maxLength={60}
          placeholder="Turma das 6h"
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
        <p className="t-regular t-muted" style={{ margin: 0 }}>
          O desafio é cumprir o plano da semana. Ranking pela porcentagem do plano, no máximo 100%:
          treinar a mais não passa ninguém.
        </p>
      </div>
    </Sheet>
  );
}
