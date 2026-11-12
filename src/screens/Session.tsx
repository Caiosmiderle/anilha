import {
  Bandage,
  Check,
  ChevronDown,
  Maximize2,
  CirclePlay,
  Ellipsis,
  Flame,
  Info,
  Keyboard,
  ArrowDownToLine,
  ArrowUpToLine,
  Minus,
  Plus,
  Replace,
  SkipForward,
  StickyNote,
  TrendingDown,
  TrendingUp,
  Equal,
  TriangleAlert,
  Undo2,
  Dumbbell,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAllItems,
  useExerciseMap,
  useItems,
  usePain,
  useProfile,
  useReturnMode,
  useSession,
  useSessions,
  useSets,
  useSetsForExercises,
  useToday,
  useWeekSets,
} from '../data/hooks';
import {
  addExercise,
  addSet,
  applyParsedSets,
  changeRest,
  completeSet,
  discardSession,
  finishSession,
  markPain,
  removePendingSet,
  setEffort,
  setItemNote,
  setSessionNote,
  moveWorkoutItem,
  skipItem,
  substituteExercise,
  toggleKind,
  unskipItem,
  updateSet,
} from '../data/ops';
import { painAdvice, yesterdayOverlap } from '../engine/advice';
import { exerciseFocus } from '../engine/focus';
import { nextSetInOrder, restAfter } from '../engine/superset';
import { useHealthOn } from '../sync/consent';
import { cancelRestAlert, restAlertsWanted, scheduleRestAlert } from '../sync/restAlert';
import { setPrefs, usePrefs } from '../lib/prefs';
import { FocusMode } from './parts/FocusMode';
import { ExerciseProgress } from './parts/ExerciseProgress';
import { lastTimeUpdates, setStartValues, setValuesToSave, type SetDraft } from './parts/setValues';
import { SetEditSheet } from './parts/SetEditSheet';
import { warmupRule, warmupStyleFor } from '../engine/warmup';
import { addDays } from '../engine/dates';
import { volumeGroupOf } from '../engine/generator';
import { RETURN_VOLUME_CAP } from '../engine/returnMode';
import { weeklyGroupSets } from '../engine/volume';
import { fmtClock, fmtLoad } from '../engine/format';
import { buildExerciseLogs } from '../engine/history';
import { lastTimeFill, suggestNext, type Suggestion } from '../engine/progression';
import { parseQuickEntry } from '../engine/quickEntry';
import {
  EFFORT_OPTIONS,
  effortLabel,
  GROUP_PASTEL,
  JOINTS,
  JOINT_LABEL,
  VOLUME_GROUP_LABEL,
} from '../engine/taxonomy';
import type {
  ExerciseRow,
  Joint,
  SessionItemRow,
  SessionRow,
  SetRow,
  Unit,
  VolumeGroup,
} from '../engine/types';
import { keepScreenOn, restOverSignal, unlockAudio } from '../lib/device';
import { ActionList, Sheet, useToast } from '../ui/overlays';
import { Button, Disc, Empty, Icon, IconButton, LoadingCard, Stepper } from '../ui/primitives';
import { ExercisePicker } from './sheets/ExercisePicker';
import { HowToSheet } from './parts/HowToSheet';
import { SubstituteList } from './parts/SubstituteList';
import { hasHowTo } from '../content/howto';
import { setText } from '../data/display';

type SheetState =
  | { kind: 'menu'; itemId: string }
  | { kind: 'substitute'; itemId: string }
  | { kind: 'skip'; itemId: string }
  | { kind: 'pain'; itemId: string }
  | { kind: 'note'; itemId: string }
  | { kind: 'howto'; itemId: string }
  | { kind: 'history'; itemId: string }
  | { kind: 'quick'; itemId: string }
  | { kind: 'set'; setId: string }
  | { kind: 'add' }
  | { kind: 'finish' }
  | { kind: 'session-note' }
  | { kind: 'session-menu' }
  | null;

export default function Session() {
  const { id } = useParams();
  const session = useSession(id);
  if (session === undefined) return <LoadingCard lines={6} />;
  if (session === null || session.deleted)
    return <Empty icon={Dumbbell}>Treino não encontrado.</Empty>;
  if (session.status === 'done') return <SessionGone id={session.id} />;
  return <ActiveSession session={session} />;
}

function SessionGone({ id }: { id: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/historico/treino/${id}`, { replace: true });
  }, [id, navigate]);
  return null;
}

function ActiveSession({ session }: { session: SessionRow }) {
  const navigate = useNavigate();
  const toast = useToast();
  const today = useToday();
  const profile = useProfile();
  const unit: Unit = profile?.unit ?? 'kg';
  const items = useItems(session.id);
  const sets = useSets(session.id);
  const exMap = useExerciseMap();
  const allSessions = useSessions();
  const allItems = useAllItems();
  const pain = usePain();
  const ret = useReturnMode(today);
  const warmStyle = warmupStyleFor(profile?.onboarding?.level, ret.active);
  const historySets = useSetsForExercises(items.map((i) => i.exercise_id));
  const [sheet, setSheet] = useState<SheetState>(null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [effortSetId, setEffortSetId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem(`anilha:dismissed:${session.id}`) ?? '[]',
      ) as string[];
    } catch {
      return [];
    }
  });
  const [quickText, setQuickText] = useState('');
  // Values typed but not saved yet, by set: the editor and the focus mode show the same.
  // A set without a draft follows what is stored (a suggestion turned down updates it).
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});

  const { keepAwake, focusMode } = usePrefs();
  // Focus mode: the clock and one big button. Ajustar leaves it for a moment; the button
  // in the header (or leaving it) changes the choice of this device.
  const [focus, setFocus] = useState(focusMode);
  useEffect(() => (keepAwake ? keepScreenOn() : undefined), [keepAwake]);
  useEffect(() => {
    sessionStorage.setItem(`anilha:dismissed:${session.id}`, JSON.stringify(dismissed));
  }, [dismissed, session.id]);

  const setsByItem = useMemo(() => {
    const m = new Map<string, SetRow[]>();
    for (const s of sets) {
      const list = m.get(s.item_id) ?? [];
      list.push(s);
      m.set(s.item_id, list);
    }
    return m;
  }, [sets]);

  // Next set to do: in order, alternating inside a bi-set (warm-ups first).
  const nextPending = useMemo(() => nextSetInOrder(items, setsByItem), [items, setsByItem]);
  const active = sets.find((s) => s.id === activeSetId && s.completed_at == null) ?? nextPending;
  const activeItem = active ? items.find((i) => i.id === active.item_id) : undefined;
  const draftOf = (s: SetRow): SetDraft =>
    drafts[s.id] ?? {
      ...setStartValues(s, setsByItem.get(s.item_id) ?? [], exMap.get(s.exercise_id), unit),
      kind: s.kind,
    };
  const activeDraft = active ? draftOf(active) : undefined;

  const suggestions = useMemo(() => {
    const out = new Map<string, Suggestion>();
    if (!allSessions || !allItems) return out;
    for (const it of items) {
      const ex = exMap.get(it.exercise_id);
      if (!ex) continue;
      const logs = buildExerciseLogs(ex.id, allSessions, allItems, historySets, {
        excludeSessionId: session.id,
      });
      out.set(
        it.id,
        suggestNext({
          exercise: ex,
          logs,
          target: { sets: it.planned_sets, min: it.target_min, max: it.target_max },
          today,
          returnMode: ret.active,
          unit,
        }),
      );
    }
    return out;
  }, [items, exMap, allSessions, allItems, historySets, session.id, today, ret.active, unit]);

  const recentExercises = useMemo(() => {
    if (!allSessions || !allItems) return [];
    const yesterday = addDays(session.local_date, -1);
    const ids = new Set(
      allSessions.filter((s) => s.local_date === yesterday && s.status === 'done').map((s) => s.id),
    );
    return allItems
      .filter((i) => ids.has(i.session_id) && i.status === 'done')
      .map((i) => ({ local_date: yesterday, exercise: exMap.get(i.exercise_id) }))
      .filter((r): r is { local_date: string; exercise: ExerciseRow } => !!r.exercise);
  }, [allSessions, allItems, exMap, session.local_date]);

  const weekSets = useWeekSets(session.local_date, ret.active);
  // Return mode caps weekly sets per group: say so when a group already hit it.
  const weekVolume = useMemo(() => {
    if (!ret.active || !weekSets || !allSessions) return new Map<VolumeGroup, number>();
    const dayOf = new Map(allSessions.map((s) => [s.id, s.local_date]));
    return weeklyGroupSets(
      session.local_date,
      weekSets
        .filter((s) => dayOf.has(s.session_id))
        .map((s) => ({
          local_date: dayOf.get(s.session_id) as string,
          exercise_id: s.exercise_id,
          kind: s.kind,
        })),
      exMap,
    );
  }, [ret.active, weekSets, allSessions, session.local_date, exMap]);
  const volumeNote = (exerciseId: string): string | null => {
    const ex = exMap.get(exerciseId);
    if (!ret.active || !ex) return null;
    const g = volumeGroupOf(ex);
    const n = weekVolume.get(g) ?? 0;
    return n >= RETURN_VOLUME_CAP
      ? `Modo retorno: ${VOLUME_GROUP_LABEL[g].toLowerCase()} já tem ${n} séries nesta semana. Pode parar aqui.`
      : null;
  };

  const doneWork = sets.filter((s) => s.completed_at != null && s.kind === 'work').length;

  // End-of-rest notification for a locked phone: names the next set.
  const restEnd =
    session.rest_started_at != null
      ? session.rest_started_at + (session.rest_duration_sec ?? 90) * 1000
      : null;
  const nextEx = nextPending ? exMap.get(nextPending.exercise_id) : undefined;
  const nextText = useMemo(() => {
    if (!nextPending || !nextEx) return 'Hora da próxima série.';
    const sameKind = (setsByItem.get(nextPending.item_id) ?? []).filter(
      (x) => x.kind === nextPending.kind,
    );
    const n = sameKind.findIndex((x) => x.id === nextPending.id) + 1;
    const which = nextPending.kind === 'warmup' ? 'aquecimento' : `${n}ª série`;
    const values =
      nextPending.load_kg != null && nextPending.reps != null
        ? `, ${fmtLoad(nextPending.load_kg, unit)} × ${nextPending.reps}`
        : '';
    return `Próxima: ${nextEx.name}, ${which}${values}.`;
  }, [nextPending, nextEx, setsByItem, unit]);
  const wantAlerts = restAlertsWanted(profile?.reminders);
  useEffect(() => {
    if (restEnd == null || restEnd < Date.now()) {
      void cancelRestAlert();
      return;
    }
    if (wantAlerts) void scheduleRestAlert(restEnd, 'Descanso acabou', nextText);
  }, [restEnd, wantAlerts, nextText]);

  async function complete(
    set: SetRow,
    values: {
      load_kg: number | null;
      reps: number | null;
      seconds: number | null;
      kind: SetRow['kind'];
    },
  ) {
    unlockAudio();
    // In the middle of a bi-set round there is no rest: the partner exercise comes next.
    const after = new Map(setsByItem);
    after.set(
      set.item_id,
      (setsByItem.get(set.item_id) ?? []).map((x) =>
        x.id === set.id ? { ...x, kind: values.kind, completed_at: Date.now() } : x,
      ),
    );
    const rest = restAfter({ item_id: set.item_id, kind: values.kind }, items, after);
    await completeSet(set.id, values, { rest });
    setEffortSetId(values.kind === 'work' ? set.id : null);
    setActiveSetId(null);
  }

  return (
    <div className="app-shell">
      <header className="session-head">
        <IconButton icon={ChevronDown} label="Minimizar treino" onClick={() => navigate('/')} />
        <div className="session-head-title">
          <strong>{session.title}</strong>
          <Elapsed startedAt={session.started_at} doneWork={doneWork} />
        </div>
        <IconButton
          icon={Maximize2}
          label="Modo foco"
          onClick={() => {
            setFocus(true);
            setPrefs({ focusMode: true });
          }}
        />
        <IconButton
          icon={Ellipsis}
          label="Opções do treino"
          onClick={() => setSheet({ kind: 'session-menu' })}
        />
      </header>

      <main className="app-main is-session" style={{ gap: 'var(--space-4)' }}>
        {session.deload ? (
          <div className="hb-advice" role="note" data-testid="deload-session">
            <Icon icon={Info} />
            <span>
              Semana leve: pare cada série com 3 a 4 repetições na reserva. Este treino não conta
              para a progressão nem para recordes.
            </span>
          </div>
        ) : null}
        {ret.active ? (
          <div className="hb-advice" role="note">
            <Icon icon={Info} />
            <span>Modo retorno: pare cada série com 2 a 3 repetições na reserva.</span>
          </div>
        ) : null}
        {session.adjustments.length ? (
          <p className="t-caption" style={{ margin: 0 }}>
            Ajustado: {session.adjustments.join(' ')}
          </p>
        ) : null}
        {items.length === 0 ? (
          <Empty icon={Dumbbell}>Nenhum exercício ainda. Adicione o primeiro.</Empty>
        ) : null}
        {items.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            ex={exMap.get(it.exercise_id)}
            original={it.original_exercise_id ? exMap.get(it.original_exercise_id) : undefined}
            partner={(() => {
              const p = it.superset
                ? items.find(
                    (o) => o.id !== it.id && o.superset === it.superset && o.status !== 'skipped',
                  )
                : undefined;
              return p ? exMap.get(p.exercise_id)?.name : undefined;
            })()}
            sets={setsByItem.get(it.id) ?? []}
            unit={unit}
            activeSetId={active?.id ?? null}
            suggestion={dismissed.includes(it.id) ? null : (suggestions.get(it.id) ?? null)}
            pain={(() => {
              const ex = exMap.get(it.exercise_id);
              return ex
                ? painAdvice({
                    exercise: ex,
                    reports: pain.filter((p) => p.session_id !== session.id),
                    today,
                    library: [...exMap.values()],
                  })
                : null;
            })()}
            overlap={(() => {
              const ex = exMap.get(it.exercise_id);
              return ex
                ? yesterdayOverlap({
                    exercise: ex,
                    today: session.local_date,
                    recent: recentExercises,
                  })
                : null;
            })()}
            volumeNote={volumeNote(it.exercise_id)}
            warmNote={
              it.warmup_sets > 0
                ? `Aquecimento obrigatório: ${warmupRule(it.warmup_sets, warmStyle)}.`
                : null
            }
            onMenu={() => setSheet({ kind: 'menu', itemId: it.id })}
            onHowTo={
              hasHowTo(it.exercise_id)
                ? () => setSheet({ kind: 'howto', itemId: it.id })
                : undefined
            }
            onSelectSet={(s) =>
              s.completed_at == null ? setActiveSetId(s.id) : setSheet({ kind: 'set', setId: s.id })
            }
            onToggleKind={(s) => void toggleKind(s.id)}
            onDone={(s) => {
              if (s.completed_at != null) return setSheet({ kind: 'set', setId: s.id });
              const time = exMap.get(it.exercise_id)?.measure === 'time';
              // Nothing to record yet: open it in the steppers instead of saving an empty set.
              if ((time ? s.seconds : s.reps) == null) return setActiveSetId(s.id);
              void complete(s, {
                load_kg: s.load_kg,
                reps: s.reps,
                seconds: s.seconds,
                kind: s.kind,
              });
            }}
            onDismiss={async (sug) => {
              setDismissed((d) => [...d, it.id]);
              if (sug.based_on && (sug.kind === 'increase' || sug.kind === 'decrease')) {
                const ex = exMap.get(it.exercise_id);
                const updates = lastTimeUpdates(
                  sug,
                  setsByItem.get(it.id) ?? [],
                  ex?.measure ?? 'weight_reps',
                );
                for (const { id, ...values } of updates) {
                  await updateSet(id, values);
                }
                // Turned down: the editor and the focus show last time's values again.
                const ids = new Set(updates.map((u) => u.id));
                setDrafts((d) =>
                  Object.fromEntries(Object.entries(d).filter(([id]) => !ids.has(id))),
                );
              }
            }}
            onUnskip={() => void unskipItem(it.id, today)}
          />
        ))}
        <div className="actions">
          <Button variant="tint" icon={Plus} onClick={() => setSheet({ kind: 'add' })}>
            Adicionar exercício
          </Button>
          <Button variant="outline" onClick={() => setSheet({ kind: 'finish' })}>
            Encerrar treino
          </Button>
        </div>
      </main>

      <div className="hb-dock" role="region" aria-label="Série atual">
        <RestTimer session={session} />
        {effortSetId ? (
          <EffortPrompt
            set={sets.find((s) => s.id === effortSetId)}
            onPick={async (rir) => {
              await setEffort(effortSetId, rir);
              setEffortSetId(null);
            }}
          />
        ) : null}
        {active && activeItem ? (
          <SetEditor
            key={active.id}
            set={active}
            ex={exMap.get(activeItem.exercise_id)}
            itemSets={setsByItem.get(activeItem.id) ?? []}
            unit={unit}
            draft={activeDraft ?? draftOf(active)}
            onDraft={(d) => setDrafts((all) => ({ ...all, [active.id]: d }))}
            onComplete={(values) => void complete(active, values)}
            onQuick={() => setSheet({ kind: 'quick', itemId: activeItem.id })}
          />
        ) : (
          <div className="stack-sm">
            <p className="t-regular t-muted" style={{ margin: 0 }}>
              {items.length ? 'Tudo feito por aqui.' : 'Adicione um exercício para começar.'}
            </p>
            <Button
              variant="primary"
              block
              onClick={() => setSheet(items.length ? { kind: 'finish' } : { kind: 'add' })}
            >
              {items.length ? 'Encerrar treino' : 'Adicionar exercício'}
            </Button>
          </div>
        )}
      </div>

      {focus ? (
        <FocusMode
          session={session}
          set={active ?? undefined}
          draft={activeDraft}
          ex={activeItem ? exMap.get(activeItem.exercise_id) : undefined}
          itemSets={activeItem ? (setsByItem.get(activeItem.id) ?? []) : []}
          unit={unit}
          doneWork={doneWork}
          effortSet={effortSetId ? sets.find((s) => s.id === effortSetId) : undefined}
          onEffort={async (rir) => {
            if (!effortSetId) return;
            await setEffort(effortSetId, rir);
            setEffortSetId(null);
          }}
          onComplete={(values) => {
            if (active) void complete(active, values);
          }}
          onRest={(change) => void changeRest(session.id, change)}
          onAdjust={() => setFocus(false)}
          onFinish={() => setSheet({ kind: 'finish' })}
          onExit={() => {
            setFocus(false);
            setPrefs({ focusMode: false });
          }}
        />
      ) : null}

      <SessionSheets
        sheet={sheet}
        setSheet={setSheet}
        session={session}
        items={items}
        sets={sets}
        exMap={exMap}
        unit={unit}
        today={today}
        quickText={quickText}
        setQuickText={setQuickText}
        onFinished={(recordsCount) => {
          toast.show(
            recordsCount
              ? `Treino salvo. ${recordsCount} ${recordsCount === 1 ? 'recorde' : 'recordes'}.`
              : 'Treino salvo',
          );
          navigate(`/historico/treino/${session.id}`, { replace: true });
        }}
        onDiscarded={() => {
          toast.show('Treino descartado');
          navigate('/', { replace: true });
        }}
        onOrderChanged={() => setActiveSetId(null)}
      />
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Workout clock, from the stored start: right after a reload or a locked phone too. */
function Elapsed({ startedAt, doneWork }: { startedAt: number; doneWork: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  return (
    <span className="session-clock">
      <span
        role="timer"
        aria-label={`Tempo de treino: ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`}
        className="session-clock-time"
        data-testid="session-clock"
      >
        <Icon icon={Timer} size={14} />
        {clock(now - startedAt)}
      </span>
      <span className="t-caption">
        {doneWork} {doneWork === 1 ? 'série feita' : 'séries feitas'}
      </span>
    </span>
  );
}

function ItemCard({
  item,
  ex,
  original,
  partner,
  sets,
  unit,
  activeSetId,
  suggestion,
  pain,
  overlap,
  volumeNote,
  warmNote,
  onMenu,
  onHowTo,
  onSelectSet,
  onToggleKind,
  onDone,
  onDismiss,
  onUnskip,
}: {
  item: SessionItemRow;
  ex: ExerciseRow | undefined;
  original: ExerciseRow | undefined;
  /** Name of the other exercise of the bi-set. */
  partner?: string | undefined;
  sets: SetRow[];
  unit: Unit;
  activeSetId: string | null;
  suggestion: Suggestion | null;
  pain: ReturnType<typeof painAdvice>;
  overlap: string | null;
  volumeNote: string | null;
  warmNote: string | null;
  onMenu: () => void;
  /** Only when the exercise has tips to show. */
  onHowTo?: (() => void) | undefined;
  onSelectSet: (s: SetRow) => void;
  onToggleKind: (s: SetRow) => void;
  onDone: (s: SetRow) => void;
  onDismiss: (s: Suggestion) => void;
  onUnskip: () => void;
}) {
  const time = ex?.measure === 'time';
  const target = `${item.planned_sets}x ${item.target_min}${item.target_max !== item.target_min ? `-${item.target_max}` : ''}${time ? ' s' : ''}`;
  const skipped = item.status === 'skipped';
  let workIndex = 0;
  let warmIndex = 0;
  const anyDone = sets.some((s) => s.completed_at != null);
  return (
    <section className="hb-widget" aria-label={ex?.name ?? 'Exercício'} data-testid="item-card">
      <div className="hb-widget-head">
        <Disc icon={Dumbbell} pastel={ex ? GROUP_PASTEL[ex.primary_group] : 'neutral'} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="hb-widget-title" style={{ margin: 0 }}>
            {ex?.name ?? 'Exercício'}
          </h2>
          <div className="hb-widget-sub">
            {ex ? <span className="ex-focus">{exerciseFocus(ex)}</span> : null}
            {partner ? (
              <span className="ss-line" data-testid="superset-line">
                <span className="ss-chip">Bi-set</span>com {partner.toLowerCase()}
              </span>
            ) : null}
            {target} · descanso {partner ? 'depois do par' : `${item.rest_sec} s`}
            {original ? ` · no lugar de ${original.name.toLowerCase()}` : ''}
          </div>
          {onHowTo ? (
            <button
              type="button"
              className="howto-btn"
              aria-label={`Como fazer ${ex?.name.toLowerCase() ?? 'o exercício'}`}
              onClick={onHowTo}
            >
              <Icon icon={CirclePlay} size={16} />
              Como fazer
            </button>
          ) : null}
        </div>
        <IconButton
          icon={Ellipsis}
          label={`Opções de ${ex?.name ?? 'exercício'}`}
          onClick={onMenu}
        />
      </div>
      <div className="hb-widget-body stack-sm">
        {skipped ? (
          <div className="row">
            <span className="t-regular t-muted" style={{ flex: 1 }}>
              Pulado{item.skip_reason ? `: ${item.skip_reason}` : ''}.
            </span>
            <button type="button" className="hb-btn-link" onClick={onUnskip}>
              <Icon icon={Undo2} size={18} />
              Voltar exercício
            </button>
          </div>
        ) : (
          <>
            {pain && !anyDone ? (
              <div className="hb-advice" role="note">
                <Icon icon={TriangleAlert} />
                <span>{pain.text}</span>
              </div>
            ) : null}
            {volumeNote ? (
              <div className="hb-advice" role="note">
                <Icon icon={Info} />
                <span>{volumeNote}</span>
              </div>
            ) : null}
            {warmNote && sets.some((x) => x.kind === 'warmup' && x.completed_at == null) ? (
              <div className="hb-advice" role="note" data-testid="warmup-note">
                <Icon icon={Flame} />
                <span>
                  {warmNote}
                  {sets.some((x) => x.kind === 'warmup' && x.load_kg == null)
                    ? ' Sem carga de referência ainda: calcule sobre a carga que você pretende usar hoje.'
                    : ''}
                </span>
              </div>
            ) : null}
            {overlap && !anyDone ? (
              <div className="hb-advice" role="note">
                <Icon icon={TriangleAlert} />
                <span>{overlap}</span>
              </div>
            ) : null}
            {suggestion ? (
              <SuggestionLine s={suggestion} onDismiss={() => onDismiss(suggestion)} />
            ) : null}
            {ex?.note ? (
              <p className="t-caption" style={{ margin: 0 }}>
                Sua nota: {ex.note}
              </p>
            ) : null}
            {item.note ? (
              <p className="t-caption" style={{ margin: 0 }}>
                Nota de hoje: {item.note}
              </p>
            ) : null}
            {item.pain_joint ? (
              <p className="t-caption" style={{ margin: 0 }}>
                Dor marcada: {JOINT_LABEL[item.pain_joint]}
              </p>
            ) : null}
            <div className="stack-sm" style={{ gap: 2 }}>
              {sets.map((s) => {
                const label =
                  s.kind === 'warmup' ? `Aquec. ${++warmIndex}` : `Série ${++workIndex}`;
                const done = s.completed_at != null;
                const shown = setText(s, ex, unit);
                // What this set had last time, when the plan asks for something else.
                const last =
                  !done && s.kind === 'work' && suggestion?.based_on
                    ? lastTimeFill(suggestion, workIndex - 1)
                    : null;
                const lastText =
                  last && last.value != null
                    ? setText(
                        {
                          load_kg: last.load_kg,
                          reps: ex?.measure === 'time' ? null : last.value,
                          seconds: ex?.measure === 'time' ? last.value : null,
                        },
                        ex,
                        unit,
                      )
                    : null;
                return (
                  <div
                    key={s.id}
                    className={`hb-setrow ${done ? 'is-done' : ''} ${s.id === activeSetId ? 'is-active' : ''}`}
                    data-testid="set-row"
                    data-kind={s.kind}
                    data-done={done}
                  >
                    <button
                      type="button"
                      className={`hb-kind ${s.kind === 'warmup' ? 'is-warmup' : 'is-work'}`}
                      aria-label={`${label}: ${s.kind === 'warmup' ? 'aquecimento' : 'trabalho'}. Tocar alterna`}
                      onClick={() => onToggleKind(s)}
                    >
                      {s.kind === 'warmup' ? <Icon icon={Flame} size={16} /> : null}
                      {label}
                    </button>
                    <button
                      type="button"
                      className={`hb-setrow-values${lastText && lastText !== shown ? ' has-last' : ''}`}
                      onClick={() => onSelectSet(s)}
                    >
                      {shown}
                      {lastText && lastText !== shown ? (
                        <span className="hb-setrow-last">antes {lastText}</span>
                      ) : null}
                    </button>
                    <span className="hb-setrow-effort">
                      {s.kind === 'work' ? (effortLabel(s.rir) ?? '') : ''}
                    </span>
                    <button
                      type="button"
                      className={`hb-donebtn ${done ? 'is-done' : ''}`}
                      aria-label={
                        done ? `${label} feita. Editar` : `Concluir ${label.toLowerCase()}`
                      }
                      aria-pressed={done}
                      onClick={() => onDone(s)}
                    >
                      <Icon icon={Check} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SuggestionLine({ s, onDismiss }: { s: Suggestion; onDismiss: () => void }) {
  const icon: LucideIcon =
    s.kind === 'increase' || s.kind === 'progress_variation'
      ? TrendingUp
      : s.kind === 'decrease'
        ? TrendingDown
        : s.kind === 'first_time' || s.kind === 'retrain'
          ? Info
          : Equal;
  return (
    <div className="hb-advice hb-advice-brand" data-testid="suggestion" data-kind={s.kind}>
      <Icon icon={icon} />
      <div className="stack-sm" style={{ gap: 2, flex: 1 }}>
        <strong className="t-strong">{s.goal}</strong>
        <span className="t-muted">{s.reason}</span>
        {s.confidence === 'low' ? (
          <span className="t-muted">Confiança menor: registre o esforço desta vez.</span>
        ) : null}
      </div>
      <button
        type="button"
        className="hb-btn-link"
        onClick={onDismiss}
        aria-label="Ignorar sugestão"
      >
        Ignorar
      </button>
    </div>
  );
}

function SetEditor({
  set,
  ex,
  itemSets,
  unit,
  draft,
  onDraft,
  onComplete,
  onQuick,
}: {
  set: SetRow;
  ex: ExerciseRow | undefined;
  itemSets: SetRow[];
  unit: Unit;
  draft: SetDraft;
  onDraft: (d: SetDraft) => void;
  onComplete: (v: {
    load_kg: number | null;
    reps: number | null;
    seconds: number | null;
    kind: SetRow['kind'];
  }) => void;
  onQuick: () => void;
}) {
  const time = ex?.measure === 'time';
  const bodyweight = !!ex?.bodyweight || ex?.measure === 'reps';
  // Empty set (first time): the draft starts from the last set done in this exercise today.
  const { kind, load, value, showLoad } = draft;
  const change = (next: Partial<SetDraft>) => onDraft({ ...draft, ...next });
  const step =
    unit === 'kg'
      ? (ex?.increment_kg ?? 2.5)
      : Math.max(2.5, Math.round(((ex?.increment_kg ?? 2.5) * 2.2046) / 2.5) * 2.5);
  const pos = itemSets.filter((s) => s.kind === kind).findIndex((s) => s.id === set.id) + 1;
  const total = itemSets.filter((s) => s.kind === kind).length;

  return (
    <div className="stack-sm" data-testid="set-editor">
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <button
          type="button"
          className={`hb-kind ${kind === 'warmup' ? 'is-warmup' : 'is-work'}`}
          aria-label={`Tipo: ${kind === 'warmup' ? 'aquecimento' : 'trabalho'}. Tocar alterna`}
          onClick={() => change({ kind: kind === 'warmup' ? 'work' : 'warmup' })}
        >
          {kind === 'warmup' ? <Icon icon={Flame} size={16} /> : null}
          {kind === 'warmup' ? 'Aquec.' : 'Trabalho'}
        </button>
        <p
          className="t-label"
          style={{
            margin: 0,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ex?.name ?? 'Exercício'}
          <span className="t-caption" style={{ display: 'block' }}>
            {kind === 'warmup' ? 'Aquecimento' : 'Série'} {Math.max(pos, 1)} de {Math.max(total, 1)}
          </span>
        </p>
        <button type="button" className="hb-btn-link" onClick={onQuick}>
          <Icon icon={Keyboard} size={18} />
          Digitar
        </button>
      </div>
      <div className="field-grid">
        {showLoad ? (
          <Stepper
            label={bodyweight ? `Carga extra (${unit})` : `Carga (${unit})`}
            value={load}
            onChange={(n) => change({ load: n })}
            step={step}
            max={unit === 'kg' ? 1000 : 2200}
            decimals={1}
          />
        ) : (
          <button
            type="button"
            className="hb-btn hb-btn-outline"
            style={{ alignSelf: 'end', minHeight: 60 }}
            onClick={() => change({ showLoad: true })}
          >
            <Icon icon={Plus} />
            Carga extra
          </button>
        )}
        <Stepper
          label={time ? 'Segundos' : 'Repetições'}
          value={value}
          onChange={(n) => change({ value: n })}
          step={time ? 5 : 1}
          max={time ? 3600 : 200}
        />
      </div>
      <Button
        variant="primary"
        block
        icon={Check}
        disabled={value == null || value <= 0}
        onClick={() => onComplete(setValuesToSave({ load, value, showLoad, kind }, ex, unit))}
      >
        Concluir série
      </Button>
    </div>
  );
}

function EffortPrompt({ set, onPick }: { set: SetRow | undefined; onPick: (rir: number) => void }) {
  if (!set || set.kind !== 'work') return null;
  return (
    <div className="stack-sm" style={{ gap: 4 }} data-testid="effort-prompt">
      <span className="t-caption">Como foi a série? Um toque.</span>
      <div className="hb-seg" role="group" aria-label="Esforço da série">
        {EFFORT_OPTIONS.map((o) => (
          <button
            key={o.rir}
            type="button"
            aria-pressed={set.rir === o.rir}
            onClick={() => onPick(o.rir)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Counts from the stored start time, never from a ticking counter. */
function RestTimer({ session }: { session: SessionRow }) {
  const start = session.rest_started_at;
  const duration = session.rest_duration_sec ?? 90;
  const [now, setNow] = useState(Date.now());
  const signaled = useRef<number | null>(null);
  useEffect(() => {
    if (start == null) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [start]);
  const remaining = start == null ? 0 : start + duration * 1000 - now;
  const over = start != null && remaining <= 0;
  // On screen at the end: the chime is enough, no notification on top of it.
  useEffect(() => {
    if (
      start != null &&
      remaining > 0 &&
      remaining <= 4000 &&
      document.visibilityState === 'visible'
    )
      void cancelRestAlert();
  }, [start, remaining]);
  useEffect(() => {
    if (over && start != null && signaled.current !== start) {
      signaled.current = start;
      // Only chime if we are around when it ends, not minutes later.
      if (remaining > -10_000) restOverSignal();
    }
  }, [over, start, remaining]);
  if (start == null) return null;
  const overdue = Math.abs(remaining) / 1000;
  if (over && overdue > 600) return null;
  return (
    <div
      className={`hb-rest ${over ? 'is-over' : ''}`}
      role="timer"
      aria-label="Descanso"
      data-testid="rest-timer"
    >
      <div>
        <div className="hb-rest-label">{over ? 'Descanso terminou' : 'Descanso'}</div>
        <div className="hb-rest-time" aria-live="off">
          {over ? `+${fmtClock(overdue)}` : fmtClock(remaining / 1000)}
        </div>
      </div>
      <div className="hb-rest-actions">
        {!over ? (
          <>
            {/* Shorter or longer than planned, 15 s at a time, without stopping the count. */}
            <Button
              variant="outline"
              aria-label="Tirar 15 segundos do descanso"
              onClick={() => void changeRest(session.id, -15)}
            >
              -15 s
            </Button>
            <Button
              variant="outline"
              aria-label="Somar 15 segundos ao descanso"
              onClick={() => void changeRest(session.id, 15)}
            >
              +15 s
            </Button>
          </>
        ) : null}
        <Button variant="tint" onClick={() => void changeRest(session.id, 'skip')}>
          {over ? 'Fechar' : 'Pular'}
        </Button>
      </div>
      <div className="hb-rest-bar" aria-hidden="true">
        <span
          style={{
            width: `${over ? 100 : Math.min(100, (1 - remaining / (duration * 1000)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

const SKIP_REASONS = ['Já feito ontem', 'Sem tempo', 'Aparelho ocupado', 'Dor ou desconforto'];
const SWAP_REASONS = ['Aparelho ocupado', 'Sem o equipamento', 'Desconforto', 'Preferência'];

function SessionSheets({
  sheet,
  setSheet,
  session,
  items,
  sets,
  exMap,
  unit,
  today,
  quickText,
  setQuickText,
  onFinished,
  onDiscarded,
  onOrderChanged,
}: {
  sheet: SheetState;
  setSheet: (s: SheetState) => void;
  session: SessionRow;
  items: SessionItemRow[];
  sets: SetRow[];
  exMap: Map<string, ExerciseRow>;
  unit: Unit;
  today: string;
  quickText: string;
  setQuickText: (t: string) => void;
  onFinished: (records: number) => void;
  onDiscarded: () => void;
  /** The order changed: the next set follows the new order. */
  onOrderChanged: () => void;
}) {
  const toast = useToast();
  const health = useHealthOn();
  const close = () => setSheet(null);
  const item = sheet && 'itemId' in sheet ? items.find((i) => i.id === sheet.itemId) : undefined;
  const ex = item ? exMap.get(item.exercise_id) : undefined;
  const [reason, setReason] = useState<string | null>(null);
  const [swapTo, setSwapTo] = useState<ExerciseRow | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setReason(null);
    setSwapTo(null);
    setNote(
      sheet?.kind === 'note'
        ? (item?.note ?? '')
        : sheet?.kind === 'session-note'
          ? (session.note ?? '')
          : '',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  if (!sheet) return null;

  if (sheet.kind === 'menu' && item) {
    const pendingCount = sets.filter((s) => s.item_id === item.id && s.completed_at == null).length;
    // Equipment busy: one tap to the end, or to right now.
    const open = (i: SessionItemRow) =>
      i.status !== 'skipped' && sets.some((s) => s.item_id === i.id && s.completed_at == null);
    const partner = (i: SessionItemRow) => !!item.superset && i.superset === item.superset;
    const current = items.find(open);
    const canNow = open(item) && !!current && current.id !== item.id && !partner(current);
    const canLater =
      open(item) && items.slice(items.indexOf(item) + 1).some((i) => open(i) && !partner(i));
    const reorder = (where: 'agora' | 'fim') => async () => {
      await moveWorkoutItem(item.id, where);
      onOrderChanged();
      close();
      toast.show(
        where === 'fim'
          ? `${ex?.name ?? 'Exercício'} vai para o fim`
          : `${ex?.name ?? 'Exercício'} agora`,
      );
    };
    return (
      <Sheet open onClose={close} title={ex?.name ?? 'Exercício'}>
        <ActionList
          actions={[
            ...(canNow
              ? [
                  {
                    icon: ArrowUpToLine,
                    label: 'Fazer agora',
                    hint: 'Passa para a frente do que está em andamento',
                    onSelect: () => void reorder('agora')(),
                  },
                ]
              : []),
            ...(canLater
              ? [
                  {
                    icon: ArrowDownToLine,
                    label: 'Deixar para o fim',
                    hint: 'Aparelho ocupado? Volta depois dos outros',
                    onSelect: () => void reorder('fim')(),
                  },
                ]
              : []),
            {
              icon: Replace,
              label: 'Substituir exercício',
              hint: 'O original fica no histórico',
              onSelect: () => setSheet({ kind: 'substitute', itemId: item.id }),
            },
            item.status === 'skipped'
              ? {
                  icon: Undo2,
                  label: 'Voltar exercício',
                  onSelect: () => void unskipItem(item.id, today).then(close),
                }
              : {
                  icon: SkipForward,
                  label: 'Pular exercício',
                  hint: 'Com motivo, se quiser',
                  onSelect: () => setSheet({ kind: 'skip', itemId: item.id }),
                },
            {
              icon: Keyboard,
              label: 'Digitar séries',
              hint: 'Ex.: 6kg 15 15 15 pesado',
              onSelect: () => setSheet({ kind: 'quick', itemId: item.id }),
            },
            {
              icon: Plus,
              label: 'Mais uma série',
              onSelect: () => void addSet(item.id).then(close),
            },
            ...(pendingCount
              ? [
                  {
                    icon: Minus,
                    label: 'Uma série a menos',
                    onSelect: () => void removePendingSet(item.id).then(close),
                  },
                ]
              : []),
            // Pain is health data: only with consent.
            ...(health
              ? [
                  {
                    icon: Bandage,
                    label: 'Marcar dor',
                    hint: 'Entra nas próximas sugestões',
                    onSelect: () => setSheet({ kind: 'pain', itemId: item.id }),
                  },
                ]
              : []),
            {
              icon: StickyNote,
              label: 'Nota do exercício',
              onSelect: () => setSheet({ kind: 'note', itemId: item.id }),
            },
            {
              icon: TrendingUp,
              label: 'Ver histórico',
              hint: 'As últimas vezes e a evolução, sem sair do treino',
              onSelect: () => setSheet({ kind: 'history', itemId: item.id }),
            },
          ]}
        />
      </Sheet>
    );
  }

  if (sheet.kind === 'howto' && ex) return <HowToSheet exercise={ex} onClose={close} />;
  if (sheet.kind === 'history' && ex)
    return <HistorySheet exercise={ex} sessionId={session.id} unit={unit} onClose={close} />;

  if (sheet.kind === 'substitute' && item && ex) {
    return (
      <Sheet
        open
        onClose={close}
        title={swapTo ? 'Por que a troca?' : `Trocar ${ex.name.toLowerCase()}`}
        actions={
          swapTo ? (
            <Button
              variant="primary"
              block
              onClick={async () => {
                await substituteExercise(item.id, swapTo.id, reason, today);
                toast.show(`${ex.name} virou ${swapTo.name.toLowerCase()}`);
                close();
              }}
            >
              Trocar exercício
            </Button>
          ) : undefined
        }
      >
        {swapTo ? (
          <div className="stack">
            <p className="t-regular" style={{ margin: 0 }}>
              {ex.name} vira <strong className="t-strong">{swapTo.name}</strong>.
            </p>
            <ReasonChips
              options={SWAP_REASONS}
              value={reason}
              onChange={setReason}
              label="Motivo da troca"
            />
          </div>
        ) : (
          <SubstituteList
            exercise={ex}
            excludeIds={items.map((i) => i.exercise_id)}
            emptyText="Nenhum parecido fora do que já está no treino."
            onPick={setSwapTo}
          />
        )}
      </Sheet>
    );
  }

  if (sheet.kind === 'skip' && item) {
    return (
      <Sheet
        open
        onClose={close}
        title={`Pular ${ex?.name.toLowerCase() ?? 'exercício'}`}
        actions={
          <Button
            variant="primary"
            block
            onClick={async () => {
              await skipItem(item.id, reason);
              toast.show('Exercício pulado');
              close();
            }}
          >
            Pular exercício
          </Button>
        }
      >
        <ReasonChips
          options={SKIP_REASONS}
          value={reason}
          onChange={setReason}
          label="Motivo (opcional)"
          allowCustom
        />
      </Sheet>
    );
  }

  if (sheet.kind === 'pain' && item) {
    return (
      <Sheet open onClose={close} title="Onde dói?">
        <p className="t-regular t-muted" style={{ marginTop: 0 }}>
          Nas próximas sessões eu sugiro trocar ou cortar o que carrega essa articulação.
        </p>
        <div className="hb-choices" role="group" aria-label="Articulação">
          {JOINTS.map((j: Joint) => (
            <button
              key={j}
              type="button"
              className="hb-choice"
              aria-pressed={item.pain_joint === j}
              onClick={async () => {
                await markPain(item.id, j, today);
                toast.show(`Dor no ${JOINT_LABEL[j]} marcada`);
                close();
              }}
            >
              {JOINT_LABEL[j].charAt(0).toUpperCase() + JOINT_LABEL[j].slice(1)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  if ((sheet.kind === 'note' && item) || sheet.kind === 'session-note') {
    return (
      <Sheet
        open
        onClose={close}
        title={sheet.kind === 'note' ? 'Nota do exercício' : 'Nota do treino'}
        actions={
          <Button
            variant="primary"
            block
            onClick={async () => {
              if (sheet.kind === 'note' && item) await setItemNote(item.id, note);
              else await setSessionNote(session.id, note);
              close();
            }}
          >
            Salvar nota
          </Button>
        }
      >
        <div className="hb-note" style={{ minHeight: 0 }}>
          <label className="hb-sr" htmlFor="note-text">
            Nota
          </label>
          <textarea
            id="note-text"
            value={note}
            maxLength={500}
            placeholder="Como foi, ajuste do banco, pegada"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Sheet>
    );
  }

  if (sheet.kind === 'quick' && item) {
    const candidates = items
      .map((i) => exMap.get(i.exercise_id))
      .filter((e): e is ExerciseRow => !!e);
    const parsed = quickText.trim()
      ? parseQuickEntry(quickText, {
          current: ex ?? null,
          candidates: [...candidates, ...exMap.values()],
        })
      : null;
    const targetItem = parsed?.exercise_id
      ? items.find((i) => i.exercise_id === parsed.exercise_id)
      : item;
    return (
      <Sheet
        open
        onClose={close}
        title="Digitar séries"
        actions={
          <>
            <Button
              variant="primary"
              block
              disabled={!parsed?.ok}
              onClick={async () => {
                if (!parsed?.ok) return;
                let itemId = targetItem?.id;
                if (!itemId && parsed.exercise_id)
                  itemId = await addExercise(session.id, parsed.exercise_id, today);
                if (!itemId) return;
                await applyParsedSets(itemId, parsed.sets);
                setQuickText('');
                toast.show(
                  `${parsed.sets.length} ${parsed.sets.length === 1 ? 'série salva' : 'séries salvas'}`,
                );
                close();
              }}
            >
              Salvar séries
            </Button>
            {parsed && !parsed.ok ? (
              <Button variant="tint" block onClick={close}>
                Preencher nos botões
              </Button>
            ) : null}
          </>
        }
      >
        <div className="stack">
          <div className="hb-field">
            <label className="hb-label" htmlFor="quick-entry">
              Do jeito que você fala
            </label>
            <input
              id="quick-entry"
              className="hb-input"
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              placeholder="6kg 15 15 15 pesado"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
            />
            <span className="t-caption">
              Exemplos: 12,5kg 3x10 · prancha 40s 3x · 4kg 2x15 aquecimento
            </span>
          </div>
          {parsed ? (
            parsed.ok ? (
              <div
                className="hb-advice hb-advice-brand"
                aria-live="polite"
                data-testid="quick-preview"
              >
                <Icon icon={Check} />
                <span>{parsed.preview}</span>
              </div>
            ) : (
              <div className="hb-advice" aria-live="polite">
                <Icon icon={TriangleAlert} />
                <span>
                  Não entendi{' '}
                  {parsed.unknown.length ? `"${parsed.unknown.join(' ')}"` : 'as séries'}. O texto
                  fica guardado; use os botões se preferir.
                </span>
              </div>
            )
          ) : null}
        </div>
      </Sheet>
    );
  }

  if (sheet.kind === 'set') {
    const s = sets.find((x) => x.id === sheet.setId);
    if (!s) return null;
    const sx = exMap.get(s.exercise_id);
    return <SetEditSheet set={s} ex={sx} unit={unit} onClose={close} />;
  }

  if (sheet.kind === 'add') {
    return (
      <Sheet open onClose={close} title="Adicionar exercício">
        <ExercisePicker
          excludeIds={items.map((i) => i.exercise_id)}
          onPick={async (e) => {
            await addExercise(session.id, e.id, today);
            toast.show(`${e.name} adicionado`);
            close();
          }}
        />
      </Sheet>
    );
  }

  if (sheet.kind === 'session-menu') {
    return (
      <Sheet open onClose={close} title={session.title}>
        <ActionList
          actions={[
            { icon: Plus, label: 'Adicionar exercício', onSelect: () => setSheet({ kind: 'add' }) },
            {
              icon: StickyNote,
              label: 'Nota do treino',
              onSelect: () => setSheet({ kind: 'session-note' }),
            },
            {
              icon: Check,
              label: 'Encerrar treino',
              hint: 'Mesmo que mais cedo, nada se perde',
              onSelect: () => setSheet({ kind: 'finish' }),
            },
          ]}
        />
      </Sheet>
    );
  }

  if (sheet.kind === 'finish') {
    const done = sets.filter((s) => s.completed_at != null);
    const pendingItems = items.filter(
      (i) =>
        i.status !== 'skipped' && !sets.some((s) => s.item_id === i.id && s.completed_at != null),
    ).length;
    return (
      <Sheet
        open
        onClose={close}
        title="Encerrar treino?"
        actions={
          <>
            {done.length ? (
              <Button
                variant="primary"
                block
                onClick={async () => {
                  const res = await finishSession(session.id);
                  onFinished(res.records.length);
                }}
              >
                Encerrar treino
              </Button>
            ) : (
              <Button
                variant="primary"
                block
                onClick={async () => {
                  await discardSession(session.id);
                  onDiscarded();
                }}
              >
                Descartar treino
              </Button>
            )}
            <Button variant="tint" block onClick={close}>
              Continuar treinando
            </Button>
          </>
        }
      >
        <p className="t-regular" style={{ margin: 0 }}>
          {done.length
            ? `${done.length} ${done.length === 1 ? 'série feita' : 'séries feitas'}.${pendingItems ? ` ${pendingItems} ${pendingItems === 1 ? 'exercício ficou' : 'exercícios ficaram'} sem série e entram como não feitos.` : ''}`
            : 'Nenhuma série feita ainda. Descartar não deixa rastro no histórico.'}
        </p>
      </Sheet>
    );
  }

  return null;
}

function ReasonChips({
  options,
  value,
  onChange,
  label,
  allowCustom,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  allowCustom?: boolean;
}) {
  const custom = value != null && !options.includes(value);
  return (
    <div className="stack-sm">
      <span className="hb-label">{label}</span>
      <div className="hb-choices" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className="hb-choice"
            aria-pressed={value === o}
            onClick={() => onChange(value === o ? null : o)}
          >
            {o}
          </button>
        ))}
      </div>
      {allowCustom ? (
        <input
          className="hb-input"
          aria-label="Outro motivo"
          placeholder="Outro motivo"
          maxLength={120}
          value={custom ? (value ?? '') : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      ) : null}
    </div>
  );
}

/** The exercise's past sessions and progress, without leaving the workout. */
function HistorySheet({
  exercise,
  sessionId,
  unit,
  onClose,
}: {
  exercise: ExerciseRow;
  sessionId: string;
  unit: Unit;
  onClose: () => void;
}) {
  const sessions = useSessions();
  const items = useAllItems();
  const sets = useSetsForExercises([exercise.id]);
  const logs =
    sessions && items
      ? buildExerciseLogs(exercise.id, sessions, items, sets, { excludeSessionId: sessionId })
      : [];
  return (
    <Sheet open onClose={onClose} title={exercise.name}>
      {logs.length ? (
        <ExerciseProgress exercise={exercise} unit={unit} logs={logs} />
      ) : (
        <Empty icon={TrendingUp}>Primeira vez neste exercício: o histórico começa hoje.</Empty>
      )}
    </Sheet>
  );
}
