import {
  ClipboardList,
  CloudOff,
  Megaphone,
  MessageSquare,
  Send,
  ShieldAlert,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccount } from '../app/account';
import { useExerciseMap, useRoutineItems, useRoutines, useToday } from '../data/hooks';
import { diffDays, formatDDMM } from '../engine/dates';
import { fmtAgo } from '../engine/format';
import { brDay, funnel, segmentOf, SEGMENTS, type AdminUser, type Segment } from '../lib/crm';
import {
  announce,
  answerTicket,
  deleteAnnouncement,
  publishRoutine,
  unpublishRoutine,
  setAgentRequestStatus,
  useAdminAnnouncements,
  useAdminErrors,
  useAgentRequests,
  useAdminLibrary,
  useAdminOverview,
  useAdminTickets,
  useAdminUser,
  useAdminUsers,
  useAudienceSize,
  type AdminTicket,
  type AgentRequest,
  type Audience,
} from '../sync/admin';
import { useRemote, type Remote } from '../sync/remote';
import { adminSendRoutine, routinePayload } from '../sync/sharing';
import { PRIVACY_KINDS, TICKET_LABEL } from '../sync/tickets';
import { BarList, LineChart } from '../ui/charts';
import { Sheet, useToast } from '../ui/overlays';
import {
  Button,
  Chip,
  Choices,
  Empty,
  ErrorText,
  LoadingCard,
  Segmented,
  Select,
  Switch,
  TextArea,
  TextField,
  Widget,
} from '../ui/primitives';

/**
 * Management panel: the app's numbers, who needs attention, messages to answer (requests
 * about personal data first, with their 15-day deadline) and errors. No health data.
 */
type Tab = 'geral' | 'pessoas' | 'mensagens' | 'assistente' | 'conteudo' | 'erros';

const SEGMENT_PASTEL: Record<Segment, 'sky' | 'mint' | 'peach' | 'neutral' | 'lavender'> = {
  novo: 'sky',
  ativo: 'mint',
  risco: 'peach',
  inativo: 'neutral',
  sem_treino: 'lavender',
};

/** Loading, offline and error states of a server read, in one place. */
function Pending<T>({ remote, lines = 3 }: { remote: Remote<T>; lines?: number }) {
  if (remote.offline)
    return <Empty icon={CloudOff}>Sem conexão. O painel precisa de internet.</Empty>;
  if (remote.error)
    return (
      <div className="stack-sm">
        <ErrorText>{remote.error}</ErrorText>
        <Button variant="tint" onClick={() => void remote.refresh()}>
          Tentar de novo
        </Button>
      </div>
    );
  return <LoadingCard lines={lines} />;
}

export default function Admin() {
  const admin = useRemote<boolean>('is_admin', {});
  if (admin.data === undefined) return <Pending remote={admin} />;
  if (!admin.data)
    return (
      <Widget title="Sem acesso">
        <p className="t-regular" style={{ margin: 0 }}>
          Este painel é só para quem administra o Anilha.
        </p>
      </Widget>
    );
  return <Panel />;
}

function Panel() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab | null) ?? 'geral';
  const today = useToday();
  const go = (t: Tab) => setParams({ aba: t }, { replace: true });
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Painel</h1>
          <p className="page-sub">Gestão do Anilha. Dados de saúde não aparecem aqui.</p>
        </div>
      </header>
      {/* Five sections: chips that wrap on the phone instead of a squeezed segmented bar. */}
      <Choices<Tab>
        label="Seção do painel"
        options={[
          { value: 'geral', label: 'Geral' },
          { value: 'pessoas', label: 'Pessoas' },
          { value: 'mensagens', label: 'Mensagens' },
          { value: 'assistente', label: 'Assistente' },
          { value: 'conteudo', label: 'Conteúdo' },
          { value: 'erros', label: 'Erros' },
        ]}
        selected={[tab]}
        onToggle={go}
      />
      {tab === 'geral' ? (
        <Overview today={today} go={go} />
      ) : tab === 'pessoas' ? (
        <People today={today} />
      ) : tab === 'mensagens' ? (
        <Inbox today={today} />
      ) : tab === 'assistente' ? (
        <AgentQueue />
      ) : tab === 'conteudo' ? (
        <Content />
      ) : (
        <Errors />
      )}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="kpi">
      <span className="t-label">{label}</span>
      <span className="kpi-value t-num">{value}</span>
      <span className="t-caption">{sub}</span>
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Days left to answer a request about personal data; negative when late. */
function daysLeft(createdAt: string, today: string): number {
  return 15 - diffDays(brDay(createdAt), today);
}

function deadlineText(left: number): string {
  if (left < 0) return `Venceu há ${-left} ${left === -1 ? 'dia' : 'dias'}`;
  if (left === 0) return 'Vence hoje';
  return `Vence em ${left} ${left === 1 ? 'dia' : 'dias'}`;
}

function Overview({ today, go }: { today: string; go: (t: Tab) => void }) {
  const overview = useAdminOverview(today);
  const users = useAdminUsers();
  const o = overview.data;
  if (!o) return <Pending remote={overview} lines={5} />;
  const left = o.privacy_due ? diffDays(today, brDay(o.privacy_due)) : null;
  const steps = users.data ? funnel(users.data, today) : null;
  const top = steps?.[0]?.value || 1;
  return (
    <div className="stack">
      {o.privacy_open ? (
        <Widget
          icon={ShieldAlert}
          pastel="peach"
          title={`${o.privacy_open} ${o.privacy_open === 1 ? 'pedido sobre dados aberto' : 'pedidos sobre dados abertos'}`}
          sub={left !== null ? `O mais antigo: ${deadlineText(left).toLowerCase()}` : undefined}
          action={
            <Button variant="tint" onClick={() => go('mensagens')}>
              Responder
            </Button>
          }
        />
      ) : null}
      <div className="kpi-grid">
        <Kpi label="Contas" value={o.accounts} sub={`${o.new_7d} novas em 7 dias`} />
        <Kpi label="Ativos em 7 dias" value={o.active_7d} sub={`${o.active_30d} em 30 dias`} />
        <Kpi
          label="Treinos em 7 dias"
          value={o.workouts_7d}
          sub={`e ${plural(o.cardio_7d, 'cardio', 'cardios')}`}
        />
        <Kpi
          label="Mensagens abertas"
          value={o.tickets_open}
          sub={`${o.privacy_open} sobre dados`}
        />
        <Kpi
          label="Erros em 24 h"
          value={o.errors_24h}
          sub={`${o.error_kinds_7d} tipos em 7 dias`}
        />
        <Kpi
          label="Saúde permitida"
          value={o.health_on}
          sub={`${o.health_off} ${o.health_off === 1 ? 'recusou' : 'recusaram'}`}
        />
        <Kpi label="Notificações" value={o.push} sub="contas com lembretes" />
        <Kpi
          label="Termos aceitos"
          value={o.terms_ok}
          sub={`de ${plural(o.accounts, 'conta', 'contas')}`}
        />
        <Kpi
          label="Fichas em 30 dias"
          value={o.routines_30d}
          sub={plural(o.routines_added_30d, 'adicionada', 'adicionadas')}
        />
      </div>
      <div className="grid-2">
        <Widget title="Funil" sub="Do cadastro à segunda semana de treino">
          {steps ? (
            <BarList
              rows={steps.map((s) => ({
                label: s.label,
                value: s.value,
                sub: `${Math.round((s.value / top) * 100)}%`,
              }))}
              unit=""
            />
          ) : (
            <Pending remote={users} />
          )}
        </Widget>
        <div className="stack">
          <Widget title="Cadastros por dia" sub="Últimos 30 dias">
            <LineChart main={o.signups} mainLabel="Cadastros" unit="" height={140} />
          </Widget>
          <Widget title="Pessoas treinando por semana" sub="Últimas 8 semanas">
            <LineChart main={o.weekly_active} mainLabel="Pessoas" unit="" height={140} />
          </Widget>
        </div>
      </div>
    </div>
  );
}

function People({ today }: { today: string }) {
  const users = useAdminUsers();
  const [segment, setSegment] = useState<Segment | 'todos'>('todos');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<AdminUser | null>(null);
  const list = users.data;
  const withSegment = useMemo(
    () => (list ?? []).map((u) => ({ u, s: segmentOf(u, today) })),
    [list, today],
  );
  if (!list) return <Pending remote={users} lines={5} />;
  const q = query.trim().toLowerCase();
  const shown = withSegment.filter(
    ({ u, s }) =>
      (segment === 'todos' || s === segment) &&
      (!q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q)),
  );
  const count = (v: Segment) => withSegment.filter(({ s }) => s === v).length;
  return (
    <div className="stack">
      <Choices<Segment | 'todos'>
        label="Filtrar pessoas"
        options={[
          { value: 'todos', label: `Todos ${list.length}` },
          ...SEGMENTS.map((s) => ({ value: s.value, label: `${s.label} ${count(s.value)}` })),
        ]}
        selected={[segment]}
        onToggle={setSegment}
      />
      <p className="t-caption" style={{ margin: 0 }}>
        Novos: conta de até 7 dias. Ativos: treinaram nos últimos 7 dias. Em risco: último treino de
        8 a 21 dias atrás. Inativos: mais que isso.
      </p>
      <TextField
        label="Buscar por e-mail ou nome"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {shown.length === 0 ? (
        <Empty icon={Users}>Ninguém neste filtro.</Empty>
      ) : (
        <div className="hb-widget">
          <div className="hb-list">
            {shown.map(({ u, s }) => (
              <button
                key={u.id}
                type="button"
                className="hb-list-row admin-person"
                data-testid="admin-person"
                onClick={() => setOpen(u)}
              >
                <span className="hb-list-main">
                  <span className="hb-list-title">{u.name ?? u.email}</span>
                  <span className="hb-list-sub">
                    {u.name ? `${u.email} · ` : ''}
                    {u.last_day
                      ? `último treino ${formatDDMM(u.last_day)} · ${plural(u.workouts, 'treino', 'treinos')}, ${plural(u.cardio, 'cardio', 'cardios')}`
                      : `conta de ${formatDDMM(brDay(u.created_at))}, sem treino`}
                  </span>
                </span>
                <Chip pastel={SEGMENT_PASTEL[s]}>
                  {SEGMENTS.find((x) => x.value === s)?.one ?? s}
                </Chip>
              </button>
            ))}
          </div>
        </div>
      )}
      <PersonSheet user={open} today={today} onClose={() => setOpen(null)} />
    </div>
  );
}

function PersonSheet({
  user,
  today,
  onClose,
}: {
  user: AdminUser | null;
  today: string;
  onClose: () => void;
}) {
  const detail = useAdminUser(user?.id ?? null, today);
  const d = detail.data;
  return (
    <Sheet open={user !== null} onClose={onClose} title={user?.name ?? user?.email ?? ''}>
      {user ? (
        <div className="stack">
          <dl className="admin-facts">
            <dt>E-mail</dt>
            <dd>{user.email}</dd>
            <dt>Conta desde</dt>
            <dd>{formatDDMM(brDay(user.created_at))}</dd>
            <dt>Último login</dt>
            <dd>{user.last_sign_in_at ? fmtAgo(user.last_sign_in_at) : 'sem registro'}</dd>
            <dt>Treinos e cardios</dt>
            <dd>
              {user.workouts} e {user.cardio}, em {user.weeks}{' '}
              {user.weeks === 1 ? 'semana' : 'semanas'}
            </dd>
            <dt>Plano</dt>
            <dd>{user.plan ? 'montado' : 'ainda não'}</dd>
            <dt>Amigos</dt>
            <dd>{user.friends}</dd>
            <dt>Lembretes</dt>
            <dd>{user.push ? 'ligados' : 'desligados'}</dd>
            <dt>Termos</dt>
            <dd>{user.terms ? `versão ${user.terms}` : 'ainda não aceitou'}</dd>
            <dt>Dados de saúde</dt>
            <dd>
              {user.health === null ? 'sem resposta' : user.health ? 'permitidos' : 'recusados'}
            </dd>
          </dl>
          {d ? (
            <>
              <section className="stack-sm" aria-label="Atividade por semana">
                <span className="t-label">Atividade nas últimas 12 semanas</span>
                <BarList
                  rows={d.weeks.map((w) => ({
                    label: formatDDMM(w.day),
                    value: w.treino + w.cardio,
                  }))}
                  unit=""
                />
              </section>
              {d.tickets.length ? (
                <section className="stack-sm">
                  <span className="t-label">Mensagens</span>
                  {d.tickets.map((t) => (
                    <span key={t.id} className="t-regular">
                      {TICKET_LABEL[t.kind]} · {fmtAgo(t.created_at)} ·{' '}
                      {t.status === 'aberto' ? 'aberta' : 'respondida'}
                    </span>
                  ))}
                </section>
              ) : null}
              {d.routines.length ? (
                <section className="stack-sm">
                  <span className="t-label">Fichas do Anilha</span>
                  {d.routines.map((r) => (
                    <span key={r.id} className="t-regular">
                      {r.name} · {fmtAgo(r.created_at)} ·{' '}
                      {r.status === 'pending'
                        ? 'esperando resposta'
                        : r.status === 'accepted'
                          ? 'adicionada'
                          : 'recusada'}
                    </span>
                  ))}
                </section>
              ) : null}
              <TeamRoutine user={user} onSent={() => void detail.refresh()} />
              {d.errors.length ? (
                <section className="stack-sm">
                  <span className="t-label">Erros recentes</span>
                  {d.errors.map((e) => (
                    <span key={`${e.message}${e.last_at}`} className="t-regular admin-wrap">
                      {e.message} · {e.count}x · {fmtAgo(e.last_at)}
                    </span>
                  ))}
                </section>
              ) : null}
            </>
          ) : (
            <Pending remote={detail} />
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

/** The team sends one of the admin's own routines to this person, signed "Anilha". */
function TeamRoutine({ user, onSent }: { user: AdminUser; onSent: () => void }) {
  const { userId } = useAccount();
  const routines = useRoutines();
  const exMap = useExerciseMap();
  const toast = useToast();
  const [routineId, setRoutineId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = routines.find((r) => r.id === routineId) ?? routines[0];
  const items = useRoutineItems(chosen?.id ?? 'nenhuma');
  if (user.id === userId) return null;
  if (!chosen)
    return (
      <p className="t-caption" style={{ margin: 0 }}>
        Para mandar uma ficha, crie um treino em Plano, Treinos.
      </p>
    );
  return (
    <section className="stack-sm" aria-label="Mandar uma ficha">
      <span className="t-label">Mandar uma ficha</span>
      <Select<string>
        label="Qual treino"
        value={chosen.id}
        options={routines.map((r) => ({ value: r.id, label: r.name }))}
        onChange={setRoutineId}
      />
      <TextField
        label="Recado (opcional)"
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        variant="tint"
        icon={Send}
        disabled={busy || items.length === 0}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await adminSendRoutine(user.id, chosen.name, note.trim(), routinePayload(items, exMap));
            toast.show(`Ficha enviada para ${user.name ?? user.email}`);
            setNote('');
            onSent();
          } catch (err) {
            setError((err as Error).message || 'Não deu para enviar');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Enviando' : 'Enviar como Anilha'}
      </Button>
      <span className="t-caption">
        Chega no sino da pessoa assinada como Anilha; ela adiciona ou recusa.
      </span>
    </section>
  );
}

function Inbox({ today }: { today: string }) {
  const tickets = useAdminTickets();
  const [filter, setFilter] = useState<'abertas' | 'respondidas'>('abertas');
  if (!tickets.data) return <Pending remote={tickets} lines={4} />;
  const shown = tickets.data.filter((t) =>
    filter === 'abertas' ? t.status === 'aberto' : t.status === 'respondido',
  );
  const openCount = tickets.data.filter((t) => t.status === 'aberto').length;
  return (
    <div className="stack">
      <Segmented<'abertas' | 'respondidas'>
        label="Quais mensagens"
        value={filter}
        options={[
          { value: 'abertas', label: `Abertas (${openCount})` },
          { value: 'respondidas', label: 'Respondidas' },
        ]}
        onChange={setFilter}
      />
      {shown.length === 0 ? (
        <Empty icon={MessageSquare}>
          {filter === 'abertas' ? 'Nenhuma mensagem esperando resposta.' : 'Nada respondido ainda.'}
        </Empty>
      ) : (
        shown.map((t) => (
          <TicketCard key={t.id} t={t} today={today} onDone={() => void tickets.refresh()} />
        ))
      )}
    </div>
  );
}

function TicketCard({ t, today, onDone }: { t: AdminTicket; today: string; onDone: () => void }) {
  const toast = useToast();
  const privacy = PRIVACY_KINDS.includes(t.kind);
  const left = daysLeft(t.created_at, today);
  const [editing, setEditing] = useState(t.status === 'aberto');
  const [answer, setAnswer] = useState(t.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Widget
      title={TICKET_LABEL[t.kind]}
      sub={`${t.name ? `${t.name}, ` : ''}${t.email} · ${fmtAgo(t.created_at)}`}
    >
      <div className="stack-sm" data-testid="admin-ticket">
        {privacy && t.status === 'aberto' ? (
          <span className={left < 3 ? 'admin-due is-late' : 'admin-due'}>
            Pedido sobre dados pessoais · {deadlineText(left)}
          </span>
        ) : null}
        <p className="t-regular ticket-text">{t.message}</p>
        {t.kind === 'problema' && (t.app_version || t.user_agent) ? (
          <span className="t-caption admin-wrap">
            Versão {t.app_version ?? '?'} · {t.user_agent ?? 'navegador não informado'}
          </span>
        ) : null}
        {t.status === 'respondido' && !editing ? (
          <div className="ticket-answer">
            <span className="t-caption">
              Respondida {t.answered_at ? fmtAgo(t.answered_at) : ''}
            </span>
            <p className="t-regular ticket-text">{t.answer}</p>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Responder de novo
            </Button>
          </div>
        ) : (
          <form
            className="stack-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!answer.trim() || busy) return;
              setBusy(true);
              setError(null);
              try {
                await answerTicket(t.id, answer.trim());
                toast.show('Resposta enviada');
                setEditing(false);
                onDone();
              } catch (err) {
                setError((err as Error).message || 'Não deu para enviar');
              } finally {
                setBusy(false);
              }
            }}
          >
            <TextArea
              label="Resposta"
              value={answer}
              onChange={setAnswer}
              maxLength={4000}
              placeholder="A pessoa lê no app e recebe um aviso no sino"
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button variant="primary" type="submit" disabled={busy || !answer.trim()}>
              {busy ? 'Enviando' : 'Enviar resposta'}
            </Button>
          </form>
        )}
      </div>
    </Widget>
  );
}

/** Screens an announcement can open. Only screens of the app, never outside links. */
const ANNOUNCE_TARGETS: { value: string; label: string }[] = [
  { value: '', label: 'Só o aviso' },
  { value: '/', label: 'Hoje' },
  { value: '/plano/fichas-prontas', label: 'Fichas prontas' },
  { value: '/plano', label: 'Plano' },
  { value: '/historico', label: 'Histórico' },
  { value: '/amigos', label: 'Amigos' },
  { value: '/mensagens', label: 'Fale com o Anilha' },
  { value: '/ajustes', label: 'Ajustes' },
];

/** Team content: news for everyone's inbox and the library of ready-made fichas. */
function Content() {
  return (
    <div className="grid-2">
      <Announcements />
      <Library />
    </div>
  );
}

function Announcements() {
  const list = useAdminAnnouncements();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [push, setPush] = useState(false);
  const [audience, setAudience] = useState<Audience>('todos');
  const size = useAudienceSize(audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Widget icon={Megaphone} pastel="butter" title="Avisos do Anilha" sub="Aparecem no sino">
      <div className="stack">
        <form
          className="stack-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim() || !body.trim() || busy) return;
            setBusy(true);
            setError(null);
            try {
              await announce(title.trim(), body.trim(), url || null, push, audience);
              toast.show('Aviso publicado');
              setTitle('');
              setBody('');
              setPush(false);
              setAudience('todos');
              void list.refresh();
            } catch (err) {
              setError((err as Error).message || 'Não deu para publicar');
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="Título"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextArea label="Texto" value={body} onChange={setBody} maxLength={500} />
          <div className="stack-sm">
            <span className="hb-label">Para quem</span>
            <Segmented<Audience>
              label="Para quem"
              value={audience}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'sem_treino', label: 'Nunca treinaram' },
              ]}
              onChange={setAudience}
            />
            <span className="t-caption" data-testid="audience-size">
              {size.data == null
                ? ' '
                : `${size.data} ${size.data === 1 ? 'conta' : 'contas'} agora${audience === 'sem_treino' ? '. Quem treinar depois deixa de ver o aviso' : ''}.`}
            </span>
          </div>
          <Select<string>
            label="Ao tocar, abre"
            value={url}
            options={ANNOUNCE_TARGETS}
            onChange={setUrl}
          />
          <Switch
            label="Também mandar notificação"
            hint="Para quem ligou as notificações de amigos e do app."
            checked={push}
            onChange={setPush}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button variant="primary" type="submit" disabled={busy || !title.trim() || !body.trim()}>
            {busy ? 'Publicando' : 'Publicar aviso'}
          </Button>
        </form>
        {!list.data ? (
          <Pending remote={list} lines={2} />
        ) : list.data.length === 0 ? (
          <p className="t-caption" style={{ margin: 0 }}>
            Nenhum aviso publicado.
          </p>
        ) : (
          <ul className="ticket-list">
            {list.data.map((a) => (
              <li key={a.id} className="ticket" data-testid="admin-announcement">
                <span className="t-strong">{a.title}</span>
                <span className="t-caption">
                  {fmtAgo(a.created_at)}
                  {a.audience === 'sem_treino' ? ' · para quem nunca treinou' : ''}
                  {a.url
                    ? ` · abre ${ANNOUNCE_TARGETS.find((t) => t.value === a.url)?.label ?? a.url}`
                    : ''}
                </span>
                <p className="t-regular ticket-text">{a.body}</p>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await deleteAnnouncement(a.id);
                    toast.show('Aviso apagado');
                    void list.refresh();
                  }}
                >
                  Apagar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}

function Library() {
  const list = useAdminLibrary();
  const routines = useRoutines();
  const exMap = useExerciseMap();
  const toast = useToast();
  const [routineId, setRoutineId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = routines.find((r) => r.id === routineId) ?? routines[0];
  const items = useRoutineItems(chosen?.id ?? 'nenhuma');
  return (
    <Widget
      icon={ClipboardList}
      pastel="sky"
      title="Fichas prontas"
      sub="Em Plano, Fichas prontas: qualquer pessoa adiciona"
    >
      <div className="stack">
        {chosen ? (
          <div className="stack-sm">
            <Select<string>
              label="Publicar um treino seu"
              value={chosen.id}
              options={routines.map((r) => ({ value: r.id, label: r.name }))}
              onChange={setRoutineId}
            />
            <TextField
              label="Descrição"
              value={description}
              maxLength={300}
              placeholder="Para quem é e quanto tempo leva"
              onChange={(e) => setDescription(e.target.value)}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button
              variant="primary"
              disabled={busy || items.length === 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await publishRoutine(
                    chosen.name,
                    description.trim(),
                    routinePayload(items, exMap),
                  );
                  toast.show('Ficha publicada');
                  setDescription('');
                  void list.refresh();
                } catch (err) {
                  setError((err as Error).message || 'Não deu para publicar');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Publicando' : 'Publicar ficha'}
            </Button>
          </div>
        ) : (
          <p className="t-caption" style={{ margin: 0 }}>
            Crie um treino em Plano, Treinos, para publicar.
          </p>
        )}
        {!list.data ? (
          <Pending remote={list} lines={2} />
        ) : (
          <ul className="ticket-list">
            {list.data.map((r) => (
              <li key={r.id} className="ticket" data-testid="admin-library">
                <span className="t-strong">{r.name}</span>
                <span className="t-caption">
                  {plural(r.exercises_count, 'exercício', 'exercícios')} ·{' '}
                  {r.adds === 1 ? 'adicionada 1 vez' : `adicionada ${r.adds} vezes`}
                </span>
                {r.description ? <p className="t-regular ticket-text">{r.description}</p> : null}
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await unpublishRoutine(r.id);
                    toast.show('Ficha tirada do ar');
                    void list.refresh();
                  }}
                >
                  Tirar do ar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}

const NIVEL_LABEL: Record<AgentRequest['nivel'], string> = {
  0: 'Conversa',
  1: 'O app resolveu',
  2: 'Feito à mão',
  3: 'Não conseguiu',
};

const RESULT_LABEL: Record<string, string> = {
  proposto: 'proposta feita',
  salvo: 'salvou',
  recusado: 'recusou',
  ja_existia: 'já existia',
  nao_consegui: 'não conseguiu',
  conversa: 'conversa',
};

const CATEGORY_LABEL: Record<string, string> = {
  plano: 'Plano',
  ficha: 'Ficha',
  ficha_nova: 'Ficha nova',
  substituto: 'Substituto',
  onde: 'Onde fica',
  conversa: 'Conversa',
  nutricao: 'Nutrição',
  integracao: 'Integração',
  equipamento: 'Equipamento',
  lembrete: 'Lembrete',
  relatorio: 'Relatório',
  social: 'Social',
  outro: 'Outro',
};

/**
 * The assistant's queue: what people asked and how far the tools went. "Feito à mão" means
 * an option missing in the generator; "Não conseguiu", something the app does not do yet.
 * Marking one as feito tells who asked, in the inbox.
 */
function AgentQueue() {
  const requests = useAgentRequests();
  const toast = useToast();
  const [view, setView] = useState<'falta' | 'todos'>('falta');
  if (!requests.data) return <Pending remote={requests} lines={4} />;
  const all = requests.data;
  const shown = view === 'falta' ? all.filter((r) => r.nivel >= 2) : all;
  const groups = new Map<string, AgentRequest[]>();
  for (const r of shown) groups.set(r.categoria, [...(groups.get(r.categoria) ?? []), r]);
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const count = (n: AgentRequest['nivel']) => all.filter((r) => r.nivel === n).length;

  async function setStatus(r: AgentRequest, status: AgentRequest['status']) {
    await setAgentRequestStatus(r.id, status);
    if (status === 'feito') toast.show('Quem pediu vai receber um aviso no sino');
    void requests.refresh();
  }

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Pedidos" value={all.length} sub="Últimos 500" />
        <Kpi label="O app resolveu" value={count(1)} sub="Gerador ou atalho" />
        <Kpi label="Feito à mão" value={count(2)} sub="Falta opção no gerador" />
        <Kpi label="Não conseguiu" value={count(3)} sub="O app ainda não faz" />
      </div>
      <Segmented<'falta' | 'todos'>
        label="Quais pedidos"
        value={view}
        options={[
          { value: 'falta', label: 'O que falta' },
          { value: 'todos', label: 'Todos' },
        ]}
        onChange={setView}
      />
      {sorted.length === 0 ? (
        <Empty icon={MessageSquare}>
          {view === 'falta'
            ? 'Nada pendente: o app resolveu tudo o que pediram.'
            : 'Nenhum pedido ainda.'}
        </Empty>
      ) : (
        sorted.map(([cat, list]) => (
          <Widget key={cat} title={`${CATEGORY_LABEL[cat] ?? cat} · ${list.length}`}>
            <div className="stack">
              {list.map((r) => (
                <div key={r.id} className="stack-sm" data-testid="agent-request">
                  <span className="t-regular">“{r.pedido}”</span>
                  <span className="t-caption">
                    {r.name ?? 'Alguém'} · {fmtAgo(r.at)} · {NIVEL_LABEL[r.nivel]} ·{' '}
                    {RESULT_LABEL[r.resultado] ?? r.resultado}
                    {r.avisos ? ` · ${plural(r.avisos, 'aviso', 'avisos')}` : ''}
                  </span>
                  <Select<AgentRequest['status']>
                    label={`Situação do pedido "${r.pedido}"`}
                    hideLabel
                    value={r.status}
                    options={[
                      { value: 'novo', label: 'Novo' },
                      { value: 'planejado', label: 'Planejado' },
                      { value: 'feito', label: 'Feito (avisa quem pediu)' },
                      { value: 'nao_vamos', label: 'Não vamos fazer' },
                    ]}
                    onChange={(v) => void setStatus(r, v)}
                  />
                </div>
              ))}
            </div>
          </Widget>
        ))
      )}
    </div>
  );
}

function Errors() {
  const errors = useAdminErrors();
  if (!errors.data) return <Pending remote={errors} lines={4} />;
  if (errors.data.length === 0)
    return <Empty icon={TriangleAlert}>Nenhum erro nos últimos 30 dias.</Empty>;
  return (
    <div className="stack">
      {errors.data.map((e) => (
        <Widget key={e.message} title={e.message}>
          <div className="stack-sm" data-testid="admin-error">
            <span className="t-regular">
              {e.count} {e.count === 1 ? 'vez' : 'vezes'}, {e.people}{' '}
              {e.people === 1 ? 'pessoa' : 'pessoas'} · último {fmtAgo(e.last_at)}
            </span>
            <span className="t-caption admin-wrap">
              Versão {e.version ?? '?'} · tela {e.url ?? '?'} · desde {fmtAgo(e.first_at)}
            </span>
            {e.stack ? (
              <details>
                <summary className="t-label">Pilha</summary>
                <pre className="admin-stack">{e.stack}</pre>
              </details>
            ) : null}
          </div>
        </Widget>
      ))}
    </div>
  );
}
