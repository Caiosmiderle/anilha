import { AlertTriangle, ArrowUp, CloudOff, ExternalLink, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { applyProposal, UndoConflictError, type Undo } from '../agent/apply';
import {
  AgentError,
  runTurn,
  type AgentMessage,
  type Stage,
  type TurnResult,
} from '../agent/client';
import type { Proposal } from '../agent/execute';
import { buildAgentContext } from '../agent/live';
import { nextPhrase, phrasesFor } from '../agent/phrases';
import { ProposalDetails } from '../agent/ProposalDetails';
import { RichText, useTyped } from '../agent/RichText';
import { isNearConversationEnd } from '../agent/scroll';
import type { Place } from '../agent/tools';
import { currentStore } from '../data/store';
import {
  useCurrentPlan,
  useProfile,
  useReturnMode,
  useRoutineItems,
  useRoutines,
  useToday,
} from '../data/hooks';
import { EXERCISES_BY_ID } from '../engine/exercises';
import { FOCUS_LABEL, focusesOf, volumeLabel } from '../engine/generator';
import type { OnboardingParams } from '../engine/types';
import { reportError } from '../lib/errors';
import { accountRpc } from '../sync/client';
import { useConsent } from '../sync/consent';
import { useToast } from '../ui/overlays';
import { Button, Chip, Icon } from '../ui/primitives';
import { GOAL_LABEL, LEVEL_LABEL, SPLIT_LABEL } from './parts/trainingQuestions';

type CardStatus = 'aberta' | 'salva' | 'desfeita' | 'recusada' | 'antiga';

interface Card {
  proposal: Proposal;
  status: CardStatus;
  undo?: Undo;
}

interface Entry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: Card[];
  requestId: string | null;
}

const SUGGESTIONS = [
  'Quero mais foco em perna e glúteo',
  'Agora consigo treinar 5 vezes por semana',
  'Trocar um exercício que não tem na minha academia',
  'Montar uma ficha curta para dias corridos',
];

/** Where "Abrir" goes for each place of the app; none for what lives inside a workout. */
const ROUTE: Partial<Record<Place, string>> = {
  perfil_treino: '/voce/treino',
  ajustes: '/ajustes',
  exercicio: '/exercicios',
  historico: '/historico',
  seus_dados: '/voce/dados',
  privacidade: '/voce/privacidade',
  amigos: '/amigos',
  enviar_ficha: '/plano',
  fichas_prontas: '/plano/fichas-prontas',
  hoje_descanso: '/',
  fale_conosco: '/mensagens',
};

/** For the queue: what the request was about, from the tools it took. */
function categoryOf(r: TurnResult): string {
  if (r.request) return r.request.categoria;
  const t = r.tools[0];
  return t === 'propor_plano'
    ? 'plano'
    : t === 'editar_ficha'
      ? 'ficha'
      : t === 'nova_ficha'
        ? 'ficha_nova'
        : t === 'substitutos'
          ? 'substituto'
          : t === 'mostrar_onde'
            ? 'onde'
            : 'conversa';
}

function resultOf(r: TurnResult): string {
  if (r.proposals.some((p) => p.kind !== 'lugar')) return 'proposto';
  if (r.request) return 'nao_consegui';
  if (r.proposals.length) return 'ja_existia';
  return 'conversa';
}

/**
 * Asking the assistant for a change: the person says it in their words, the assistant
 * builds the proposal with the app's generator and the card shows before and after. Nothing
 * changes until Salvar, and "Voltar ao anterior" puts it back. In test with the team first.
 */
export default function AgentChat({
  embedded = false,
  active = true,
  onNavigate,
}: {
  embedded?: boolean;
  active?: boolean;
  onNavigate?: () => void;
}) {
  const today = useToday();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const { plan, loaded } = useCurrentPlan(today);
  const routines = useRoutines();
  const items = useRoutineItems();
  const consent = useConsent();
  const ret = useReturnMode(today);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [withContext, setWithContext] = useState(true);
  const [draft, setDraft] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<{ text: string; ask: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const sending = useRef(false);
  const action = useRef(false);
  const doneActions = useRef(new Set<string>());
  const sentContext = useRef<string | null>(null);
  const mounted = useRef(true);
  const turn = useRef<AbortController | null>(null);
  const previousHealth = useRef(consent.health);

  const resetConversation = useCallback(() => {
    following.current = true;
    setAwayFromEnd(false);
    turn.current?.abort();
    turn.current = null;
    sending.current = false;
    sentContext.current = null;
    doneActions.current.clear();
    setEntries([]);
    setHistory([]);
    setDraft('');
    setError(null);
    setActionError(null);
    setStage(null);
    setWithContext(true);
  }, []);

  useEffect(() => {
    if (previousHealth.current && !consent.health) {
      resetConversation();
      setActionError('A conversa foi limpa porque a permissão para dados de saúde mudou.');
    }
    previousHealth.current = consent.health;
  }, [consent.health, resetConversation]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      turn.current?.abort();
    };
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const params = (profile?.onboarding ?? plan?.params ?? null) as OnboardingParams | null;
  const ctx = useMemo(
    () =>
      params
        ? buildAgentContext({
            params,
            plan,
            routines,
            items,
            health: consent.health,
            returnMode: ret.active,
          })
        : null,
    [params, plan, routines, items, consent.health, ret.active],
  );
  const ready = !!ctx && loaded;
  const busy = stage !== null;
  const conversationFull = history.length >= 32;

  const trackReading = useCallback(() => {
    if (!active) return;
    const container = embedded ? scroll.current : document.scrollingElement;
    if (!container) return;
    following.current = isNearConversationEnd(
      embedded
        ? container
        : {
            // The standalone page also has a composer and shell below the thread.
            scrollHeight: (end.current?.getBoundingClientRect().bottom ?? 0) + container.scrollTop,
            scrollTop: container.scrollTop,
            clientHeight: container.clientHeight,
          },
    );
    setAwayFromEnd(!following.current);
  }, [embedded, active]);

  useEffect(() => {
    if (embedded || !active) return;
    window.addEventListener('scroll', trackReading, { passive: true });
    return () => window.removeEventListener('scroll', trackReading);
  }, [embedded, active, trackReading]);

  const goToLatest = useCallback(() => {
    following.current = true;
    setAwayFromEnd(false);
    if (embedded && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    else end.current?.scrollIntoView({ block: 'end' });
  }, [embedded]);

  const follow = useCallback(
    (card?: HTMLElement) => {
      // Remember the position BEFORE text/cards grow. Measuring the new height here
      // would stop following a reader at the bottom when a large proposal arrives.
      if (!active || !following.current) return;
      if (card && embedded && scroll.current) {
        const body = scroll.current;
        const bounds = body.getBoundingClientRect();
        const rect = card.getBoundingClientRect();
        if (rect.top < bounds.top) body.scrollTop += rect.top - bounds.top;
        else if (rect.bottom > bounds.bottom)
          body.scrollTop += Math.min(rect.top - bounds.top, rect.bottom - bounds.bottom);
      } else if (card) card.scrollIntoView({ block: 'nearest' });
      else goToLatest();
    },
    [active, embedded, goToLatest],
  );

  useLayoutEffect(() => {
    if (active) follow();
  }, [entries.length, stage, error, active, follow]);

  async function send(ask: string) {
    const text = ask.trim();
    if (!text || !ctx || sending.current || action.current || conversationFull || !navigator.onLine)
      return;
    sending.current = true;
    const controller = new AbortController();
    turn.current = controller;
    const account = currentStore();
    const stillHere = () =>
      mounted.current &&
      currentStore() === account &&
      turn.current === controller &&
      !controller.signal.aborted;
    const contextVersion = JSON.stringify(ctx);
    setError(null);
    setActionError(null);
    setDraft('');
    if (input.current) input.current.style.height = '';
    const userEntry: Entry = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      cards: [],
      requestId: null,
    };
    setEntries((list) => [...list, userEntry]);
    try {
      const r = await runTurn(
        history,
        text,
        ctx,
        withContext || sentContext.current !== contextVersion,
        (next) => {
          if (stillHere()) setStage(next);
        },
        controller.signal,
      );
      if (!stillHere()) return;
      sentContext.current = contextVersion;
      setHistory(r.messages);
      setWithContext(false);
      let requestId: string | null = null;
      try {
        if (!account) return;
        requestId = await accountRpc<string>(account, 'agent_log_request', {
          p_pedido: r.request?.pedido || text,
          p_categoria: categoryOf(r),
          p_nivel: r.level,
          p_resultado: resultOf(r),
          p_avisos: r.proposals.reduce((n, p) => n + ('risks' in p ? p.risks.length : 0), 0),
        });
      } catch (err) {
        if (stillHere()) reportError(err);
      }
      if (!stillHere()) return;
      setEntries((list) => [
        // A newer proposal replaces the open ones before it.
        ...list.map((e) => ({
          ...e,
          cards: e.cards.map((c) =>
            c.status === 'aberta' && r.proposals.length ? { ...c, status: 'antiga' as const } : c,
          ),
        })),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: r.text,
          cards: r.proposals.map((proposal) => ({ proposal, status: 'aberta' })),
          requestId,
        },
      ]);
    } catch (err) {
      if (!stillHere()) return;
      if (!(err instanceof AgentError)) reportError(err);
      setEntries((list) => list.filter((e) => e.id !== userEntry.id));
      setError({
        text:
          err instanceof AgentError
            ? err.message
            : 'Waltér não respondeu agora. Tente de novo em instantes.',
        ask: text,
      });
      setDraft((current) => current || text);
    } finally {
      if (stillHere()) {
        sending.current = false;
        setStage(null);
      }
    }
  }

  function updateCard(entryId: string, index: number, next: Partial<Card>) {
    setEntries((list) =>
      list.map((e) =>
        e.id === entryId
          ? { ...e, cards: e.cards.map((c, i) => (i === index ? { ...c, ...next } : c)) }
          : e,
      ),
    );
  }

  function setResult(requestId: string | null, resultado: string) {
    const owner = currentStore();
    if (!requestId || !owner) return;
    accountRpc(owner, 'agent_set_result', { p_id: requestId, p_resultado: resultado }).catch(
      reportError,
    );
  }

  async function save(entry: Entry, index: number) {
    const card = entry.cards[index];
    const key = `save:${entry.id}:${index}`;
    if (
      !card ||
      card.status !== 'aberta' ||
      sending.current ||
      action.current ||
      doneActions.current.has(key)
    )
      return;
    action.current = true;
    const owner = currentStore();
    setPendingAction(true);
    setActionError(null);
    try {
      const undo = await applyProposal(card.proposal, today);
      if (!mounted.current || currentStore() !== owner) return;
      doneActions.current.add(key);
      updateCard(entry.id, index, { status: 'salva', undo });
      setWithContext(true);
      setResult(entry.requestId, 'salvo');
      toast.show('Salvo');
    } catch (err) {
      reportError(err);
      setActionError('Não deu para salvar. Tente de novo.');
    } finally {
      action.current = false;
      setPendingAction(false);
    }
  }

  async function undo(entry: Entry, index: number) {
    const card = entry.cards[index];
    const key = `undo:${entry.id}:${index}`;
    if (
      !card?.undo ||
      card.status !== 'salva' ||
      sending.current ||
      action.current ||
      doneActions.current.has(key)
    )
      return;
    action.current = true;
    const owner = currentStore();
    setPendingAction(true);
    setActionError(null);
    try {
      await card.undo();
      if (!mounted.current || currentStore() !== owner) return;
      doneActions.current.add(key);
      updateCard(entry.id, index, { status: 'desfeita', undo: undefined });
      setWithContext(true);
      setResult(entry.requestId, 'recusado');
      toast.show('Voltou como estava');
    } catch (err) {
      if (!(err instanceof UndoConflictError)) reportError(err);
      setActionError(
        err instanceof UndoConflictError ? err.message : 'Não deu para desfazer. Tente de novo.',
      );
    } finally {
      action.current = false;
      setPendingAction(false);
    }
  }

  const last = entries[entries.length - 1];

  return (
    <div className={`agent${embedded ? ' is-embedded' : ''}`}>
      {!embedded ? (
        <header className="page-head">
          <div>
            <div className="agent-title">
              <h1 className="page-title">Waltér</h1>
              <Chip pastel="lavender">Beta</Chip>
            </div>
            <p className="page-sub">
              Seu parceiro de treino. Diga o que quer mudar e revise a proposta. Só muda quando você
              salvar.
            </p>
          </div>
        </header>
      ) : null}

      <div className="agent-body" ref={scroll} onScroll={embedded ? trackReading : undefined}>
        {entries.length || error ? (
          <div className="agent-conversation-tools">
            <button
              type="button"
              className="hb-btn-link"
              disabled={busy || pendingAction}
              onClick={resetConversation}
            >
              Nova conversa
            </button>
            <span>O que você salvou continua no plano.</span>
          </div>
        ) : null}
        {embedded ? (
          <p className="agent-intro">
            Seu parceiro de treino. O que você quer mudar? Revise a proposta antes de salvar.
          </p>
        ) : null}

        {!entries.length && !busy ? (
          <div className="agent-start" aria-label="Sugestões de pedido">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="agent-suggestion"
                disabled={!ready || !online}
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <ol
          className="agent-thread"
          aria-label="Conversa com Waltér"
          aria-live={active ? 'polite' : 'off'}
        >
          {entries.map((e) =>
            e.role === 'user' ? (
              <li key={e.id} className="agent-item is-mine">
                <div className="agent-bubble">{e.text}</div>
              </li>
            ) : (
              <AssistantEntry
                key={e.id}
                entry={e}
                typing={active && e === last}
                onFollow={follow}
                pending={pendingAction || busy}
                onSave={(i) => void save(e, i)}
                onUndo={(i) => void undo(e, i)}
                onDecline={(i) => {
                  updateCard(e.id, i, { status: 'recusada' });
                  setResult(e.requestId, 'recusado');
                }}
                onAdjust={() => {
                  input.current?.focus();
                }}
                onOpen={(to) => {
                  onNavigate?.();
                  navigate(to);
                }}
              />
            ),
          )}
        </ol>

        {busy && stage && active ? <Working stage={stage} /> : null}
        {actionError ? (
          <p className="agent-error" role="alert">
            {actionError}
          </p>
        ) : null}
        {error ? (
          <div className="agent-error" role="alert">
            <span>{error.text}</span>
            <Button
              variant="tint"
              icon={RotateCcw}
              disabled={busy || pendingAction || !online}
              onClick={() => void send(error.ask)}
            >
              Tentar de novo
            </Button>
          </div>
        ) : null}
        <div ref={end} />
      </div>

      <form
        className="agent-composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send(draft);
        }}
      >
        {awayFromEnd && entries.length ? (
          <button type="button" className="hb-btn-link" onClick={goToLatest}>
            Ir para a resposta mais recente
          </button>
        ) : null}
        {conversationFull ? (
          <p className="agent-offline" role="status">
            Esta conversa ficou longa. Toque em Nova conversa para continuar.
          </p>
        ) : null}
        {!online ? (
          <p className="agent-offline">
            <Icon icon={CloudOff} size={16} /> Sem internet: Waltér precisa de conexão. Seu texto
            fica aqui.
          </p>
        ) : null}
        <div className="agent-composer-row">
          <textarea
            ref={input}
            className="hb-input agent-input"
            aria-label="Seu pedido"
            placeholder={
              entries.some((e) => e.cards.some((c) => c.status === 'aberta'))
                ? 'Quer ajustar algo na proposta?'
                : 'Ex.: quero treinar 4 vezes e focar em costas'
            }
            rows={1}
            maxLength={500}
            value={draft}
            onChange={(ev) => {
              setDraft(ev.target.value);
              // One line to start, growing with the text up to five.
              ev.target.style.height = 'auto';
              ev.target.style.height = `${Math.min(ev.target.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="submit"
            className="agent-send"
            aria-label="Enviar pedido"
            disabled={
              !draft.trim() || busy || pendingAction || conversationFull || !ready || !online
            }
          >
            <Icon icon={ArrowUp} />
          </button>
        </div>
      </form>
    </div>
  );
}

/** The real step the assistant is on, in words that change while it works. */
function Working({ stage }: { stage: Stage }) {
  const list = phrasesFor(stage);
  const [phrase, setPhrase] = useState(() => nextPhrase(list, null));
  useEffect(() => {
    setPhrase((p) => (list.includes(p) ? p : nextPhrase(list, null)));
    const t = window.setInterval(() => setPhrase((p) => nextPhrase(list, p)), 1700);
    return () => window.clearInterval(t);
  }, [list]);
  return (
    <div className="agent-working" role="status" data-testid="agent-working">
      <span className="agent-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {phrase}
    </div>
  );
}

function AssistantEntry({
  entry,
  typing,
  pending,
  onSave,
  onUndo,
  onDecline,
  onAdjust,
  onOpen,
  onFollow,
}: {
  entry: Entry;
  typing: boolean;
  onFollow: (card?: HTMLElement) => void;
  pending: boolean;
  onSave: (i: number) => void;
  onUndo: (i: number) => void;
  onDecline: (i: number) => void;
  onAdjust: () => void;
  onOpen: (to: string) => void;
}) {
  const { shown, done } = useTyped(entry.text, typing);
  const item = useRef<HTMLLIElement>(null);
  const followed = useRef(false);
  // The text grows at the bottom while it types; then the proposal comes into view.
  useLayoutEffect(() => {
    if (!typing) return;
    if (!done) {
      followed.current = true;
      onFollow();
    } else if (followed.current) {
      followed.current = false;
      const card = item.current?.querySelector<HTMLElement>('.agent-card');
      onFollow(card ?? undefined);
    }
  }, [typing, done, shown.length, onFollow]);
  return (
    <li className="agent-item" ref={item}>
      <div className="agent-bubble is-assistant" data-testid="agent-answer">
        <span className="agent-who">Waltér</span>
        <RichText text={shown} />
      </div>
      {done
        ? entry.cards.map((c, i) => (
            <ProposalCard
              key={i}
              card={c}
              pending={pending}
              onSave={() => onSave(i)}
              onUndo={() => onUndo(i)}
              onDecline={() => onDecline(i)}
              onAdjust={onAdjust}
              onOpen={onOpen}
            />
          ))
        : null}
    </li>
  );
}

const exName = (id: string) => EXERCISES_BY_ID.get(id)?.name ?? id;

function focusText(p: OnboardingParams): string {
  const f = focusesOf(p);
  return f.length ? f.map((x) => FOCUS_LABEL[x]).join(', ') : FOCUS_LABEL.equilibrado;
}

function splitText(p: OnboardingParams): string {
  if (!p.split_style) return 'Pelos dias da semana';
  return p.split_style === 'grupos'
    ? `${SPLIT_LABEL.grupos}, ${p.fichas ?? 3} fichas`
    : SPLIT_LABEL[p.split_style];
}

/** The profile fields a plan proposal can change, before and after. */
function profileRows(a: OnboardingParams, b: OnboardingParams) {
  return [
    ['Objetivo', GOAL_LABEL[a.goal], GOAL_LABEL[b.goal]],
    ['Foco', focusText(a), focusText(b)],
    ['Nível', LEVEL_LABEL[a.level], LEVEL_LABEL[b.level]],
    ['Dias de academia', `${a.gym_days} por semana`, `${b.gym_days} por semana`],
    ['Tempo por treino', `${a.minutes} min`, `${b.minutes} min`],
    ['Divisão', splitText(a), splitText(b)],
  ] as const;
}

function ProposalCard({
  card,
  pending,
  onSave,
  onUndo,
  onDecline,
  onAdjust,
  onOpen,
}: {
  card: Card;
  pending: boolean;
  onSave: () => void;
  onUndo: () => void;
  onDecline: () => void;
  onAdjust: () => void;
  onOpen: (to: string) => void;
}) {
  const p = card.proposal;
  if (p.kind === 'lugar') {
    const to = ROUTE[p.place];
    return (
      <div className="agent-card" data-testid="agent-card">
        <span className="agent-card-kind">Já existe no app</span>
        {p.text ? <p className="agent-card-text">{p.text}</p> : null}
        {to ? (
          <Button variant="tint" icon={ExternalLink} onClick={() => onOpen(to)}>
            Abrir
          </Button>
        ) : null}
      </div>
    );
  }

  const title =
    p.kind === 'plano'
      ? 'Plano novo'
      : p.kind === 'ficha'
        ? `Ficha ${p.before.name}`
        : `Ficha nova: ${p.ficha.name}`;

  return (
    <div className={`agent-card is-${card.status}`} data-testid="agent-card">
      <span className="agent-card-kind">Proposta</span>
      <strong className="agent-card-title">{title}</strong>

      {p.kind === 'plano' ? (
        <>
          <dl className="agent-fields" aria-label="Perfil de treino">
            {profileRows(p.before, p.after).map(([label, was, now]) => (
              <div key={label} className={`agent-field ${was !== now ? 'is-change' : ''}`}>
                <dt>{label}</dt>
                <dd>
                  {was === now ? (
                    <>
                      {now} <span className="agent-tag">mantém</span>
                    </>
                  ) : (
                    <>
                      <s>{was}</s> {now} <span className="agent-tag is-change">muda</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="agent-card-text">
            Fichas: {p.plan.routines.map((r) => r.name).join(', ')}.
          </p>
        </>
      ) : null}

      {p.kind === 'ficha' ? <FichaDiff before={p.before.items} after={p.after.items} /> : null}

      {p.kind === 'nova' ? (
        <>
          <p className="agent-card-text">
            {p.replaces ? `Entra no lugar de ${p.replaces.name}.` : 'Entra como uma ficha a mais.'}{' '}
            {p.ficha.items.length} exercícios.
          </p>
        </>
      ) : null}

      {p.volume.length ? (
        <p className="agent-card-text">
          Séries por semana:{' '}
          {p.volume
            .map((v) => `${volumeLabel(v.group)} ${fmt(v.before)} para ${fmt(v.after)}`)
            .join(', ')}
          .
        </p>
      ) : null}

      {p.risks.map((r, i) => (
        <div key={i} className="hb-advice agent-risk">
          <Icon icon={AlertTriangle} />
          <div>
            <span>{r.text}</span>
            <small className="t-muted">Fonte: {r.source}</small>
          </div>
        </div>
      ))}

      <ProposalDetails proposal={p} />

      {card.status === 'aberta' ? (
        <div className="agent-actions">
          <Button variant="primary" disabled={pending} onClick={onSave}>
            {p.risks.length ? 'Salvar assim mesmo' : 'Salvar'}
          </Button>
          <Button variant="outline" disabled={pending} onClick={onAdjust}>
            Ajustar
          </Button>
          <button type="button" className="hb-btn-link" disabled={pending} onClick={onDecline}>
            Recusar
          </button>
        </div>
      ) : card.status === 'salva' ? (
        <div className="agent-actions">
          <span className="agent-done">Salvo.</span>
          <Button variant="outline" icon={RotateCcw} disabled={pending} onClick={onUndo}>
            Voltar ao anterior
          </Button>
        </div>
      ) : (
        <span className="agent-done">
          {card.status === 'desfeita'
            ? 'Desfeito: voltou como estava.'
            : card.status === 'recusada'
              ? 'Recusada.'
              : 'Substituída por uma proposta mais nova.'}
        </span>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/** Each exercise after the change, with what happened to it; the ones that left at the end. */
function FichaDiff({
  before,
  after,
}: {
  before: {
    exercise_id: string;
    sets: number;
    target_min: number;
    target_max: number;
    rest_sec: number;
  }[];
  after: {
    exercise_id: string;
    sets: number;
    target_min: number;
    target_max: number;
    rest_sec: number;
  }[];
}) {
  const left = before.filter((b) => !after.some((a) => a.exercise_id === b.exercise_id));
  return (
    <ul className="agent-exercises">
      {after.map((a, i) => {
        const was = before.find((b) => b.exercise_id === a.exercise_id);
        const changed =
          was &&
          (was.sets !== a.sets ||
            was.target_min !== a.target_min ||
            was.target_max !== a.target_max ||
            was.rest_sec !== a.rest_sec);
        return (
          <li key={i}>
            {exName(a.exercise_id)}{' '}
            <span className="t-muted">
              {was && changed ? `${was.sets}x${was.target_min}-${was.target_max} para ` : ''}
              {a.sets}x{a.target_min}-{a.target_max}
              {' · Descanso: '}
              {was && was.rest_sec !== a.rest_sec ? `${was.rest_sec} s para ` : ''}
              {a.rest_sec} s
            </span>
            {!was ? <span className="agent-tag is-change">entra</span> : null}
            {changed ? <span className="agent-tag is-change">muda</span> : null}
          </li>
        );
      })}
      {left.map((b, i) => (
        <li key={`sai-${i}`} className="is-out">
          <s>{exName(b.exercise_id)}</s> <span className="agent-tag">sai</span>
        </li>
      ))}
    </ul>
  );
}
