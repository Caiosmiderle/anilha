import {
  Ban,
  BatteryCharging,
  BellRing,
  CircleCheck,
  Clock,
  Dumbbell,
  Flag,
  Focus,
  Footprints,
  Moon,
  Play,
  Sparkles,
  TriangleAlert,
  Undo2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { lazyScreen } from '../lib/lazyScreen';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useActiveSession,
  useCurrentPlan,
  useDeloadAdvice,
  useExercises,
  usePlans,
  useProfile,
  useRecords,
  useReturnMode,
  useRuns,
  useSessions,
  useToday,
} from '../data/hooks';
import {
  acceptDeload,
  DEFAULT_REMINDERS,
  dismissDeload,
  endDeload,
  setDayOverride,
  startSession,
  updateProfile,
} from '../data/ops';
import { useTodayData } from '../data/today';
import {
  weekRecognitions,
  weekReport,
  weeklySummary,
  weeksInARow,
  type Recognition,
} from '../engine/adherence';
import {
  addDays,
  capitalize,
  formatDDMM,
  formatLongDay,
  onWeekday,
  weekday,
  weekStart,
  WEEKDAY_LETTER,
  WEEKDAY_NAMES,
} from '../engine/dates';
import { activityOf, cardioTitle, countedCardio } from '../engine/cardio';
import { fmtNum } from '../engine/format';
import { runFitness, runSession, type RunSession } from '../engine/running';
import { CARDIO_ICON } from '../ui/cardioIcons';
import { planDayFor, type DayRecommendation } from '../engine/recommend';
import { GROUP_PASTEL, RUN_PASTEL, SPLITS } from '../engine/taxonomy';
import type { ExerciseRow, PlanRow, RecordRow, RunRow, SessionRow } from '../engine/types';
import { useHealthOn } from '../sync/consent';
import { backendConfigured } from '../lib/env';
import { canOfferReminders, enablePush, minutesBefore } from '../lib/push';
import { InboxBell, SyncBadge } from '../ui/nav';
import { Wordmark } from '../ui/brand';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Icon, LoadingCard, Widget } from '../ui/primitives';
import type { AdjustKind } from './sheets/AdjustSheet';
import { PlanDaySheet } from './parts/PlanDaySheet';
import { StreakFlame } from './parts/StreakFlame';

const StartSheet = lazyScreen(
  () => import('./sheets/StartSheet'),
  (m) => m.StartSheet,
);
const RunSheet = lazyScreen(
  () => import('./sheets/RunSheet'),
  (m) => m.RunSheet,
);
const AdjustSheet = lazyScreen(
  () => import('./sheets/AdjustSheet'),
  (m) => m.AdjustSheet,
);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Today() {
  const today = useToday();
  const profile = useProfile();
  const data = useTodayData(today);
  const active = useActiveSession();
  const ret = useReturnMode(today);
  const navigate = useNavigate();
  const toast = useToast();
  const library = useExercises();
  const runs = useRuns();
  const sessions = useSessions();
  const { plan: currentPlan } = useCurrentPlan(today);
  const [sheet, setSheet] = useState<'start' | 'run' | 'cardio' | 'chooser' | AdjustKind | null>(
    null,
  );
  const [starting, setStarting] = useState(false);
  // Shortcut of the app icon: ?atalho=treino starts the day's workout, ?atalho=corrida
  // opens the run sheet. Read once, then the address goes back to plain Today.
  const [params, setParams] = useSearchParams();
  const shortcut = params.get('atalho');
  const startRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!shortcut || !data.loaded || active === undefined) return;
    setParams({}, { replace: true });
    if (shortcut === 'corrida') setSheet('run');
    else if (shortcut === 'treino') {
      if (active) navigate(`/treino/${active.id}`);
      else startRef.current();
    }
  }, [shortcut, data.loaded, active, setParams, navigate]);
  const name = profile?.display_name?.split(' ')[0] || profile?.onboarding?.first_name || '';

  if (!data.loaded || active === undefined) {
    return (
      <>
        <PageHead name={name} today={today} />
        <LoadingCard lines={4} />
        <LoadingCard lines={2} />
      </>
    );
  }

  const rec = data.rec;
  // A run day says what to run: from the person's level, history and race.
  const onboarding = profile?.onboarding;
  const run =
    rec?.kind === 'run' && !rec.today_done
      ? runSession({
          type: rec.run_type ?? 'leve',
          today,
          level: onboarding?.level ?? 'intermediario',
          returning: ret.active,
          race: onboarding?.race,
          fitness: runFitness(onboarding?.run_mark, runs ?? [], today),
          runs: runs ?? [],
        })
      : null;
  startRef.current = () => {
    if (rec?.kind === 'gym') void startRecommended();
    else setSheet('start');
  };
  async function startRecommended() {
    if (!rec) return;
    if (!data.routine || data.items.length === 0) {
      setSheet('start');
      return;
    }
    setStarting(true);
    try {
      const id = await startSession({
        title: data.routine.name,
        split_key: data.routine.split_key,
        routine_id: data.routine.id,
        source: 'routine',
        items: data.items,
        adjustments: data.adjusted?.summary ? [data.adjusted.summary] : [],
        today,
      });
      navigate(`/treino/${id}`);
    } finally {
      setStarting(false);
    }
  }

  const showReturnNotice =
    ret.active && ret.started_on && profile?.return_notice_seen !== ret.started_on;

  return (
    <>
      <PageHead name={name} today={today} />

      {showReturnNotice ? (
        <div
          className="hb-advice"
          style={{ background: 'var(--pastel-butter)', color: 'var(--banner-ink)' }}
          role="note"
        >
          <Icon icon={Clock} />
          <div className="stack-sm" style={{ gap: 4 }}>
            <strong>Modo retorno até {ret.ends_on ? formatDDMM(ret.ends_on) : ''}</strong>
            <span>
              Nas primeiras 4 semanas, até 10 séries por grupo na semana e cada série parando com 2
              a 3 repetições na reserva.
            </span>
            <button
              type="button"
              className="hb-btn-link"
              style={{ color: 'var(--banner-ink)' }}
              onClick={() => void updateProfile({ return_notice_seen: ret.started_on })}
            >
              Entendi
            </button>
          </div>
        </div>
      ) : null}

      {active ? (
        <Widget
          icon={Play}
          pastel={active.split_key ? SPLITS[active.split_key].pastel : 'neutral'}
          title="Treino em andamento"
          sub={active.title}
          foot={
            <Button variant="primary" block onClick={() => navigate(`/treino/${active.id}`)}>
              Continuar treino
            </Button>
          }
        />
      ) : null}

      <div className="grid-2">
        <div className="stack">
          <DeloadCard today={today} />
          {rec ? (
            <RecommendationCard
              data={data}
              run={run}
              hasActive={!!active}
              starting={starting}
              onStart={() => void startRecommended()}
              onChoose={() => setSheet('start')}
              onRun={() => setSheet('run')}
              onCardio={() => setSheet('cardio')}
            />
          ) : null}
          {rec &&
          !active &&
          sessions &&
          runs &&
          !sessions.some((s) => s.status === 'done') &&
          runs.length === 0 ? (
            <FirstSteps
              kind={rec.kind}
              exercises={data.items.length}
              minutes={profile?.onboarding?.minutes ?? null}
              nextDay={nextPlannedDay(currentPlan, today)}
            />
          ) : null}
          {!active ? (
            <AdjustChips
              data={data}
              onPick={(k) => setSheet(k)}
              onRun={async () => {
                await setDayOverride(today, 'run');
                toast.show('Hoje vira corrida');
              }}
              onRest={async () => {
                await setDayOverride(today, 'rest');
                toast.show('Hoje é descanso');
              }}
              onUndo={async () => {
                await setDayOverride(today, null);
                toast.show('Ajuste desfeito');
              }}
            />
          ) : null}
          <WeekCard today={today} />
        </div>
        <div className="stack">
          <ReminderOffer today={today} />
          <Recognitions today={today} />
        </div>
      </div>

      <Suspense fallback={null}>
        {sheet === 'start' ? (
          <StartSheet
            open
            onClose={() => setSheet(null)}
            today={today}
            onCardio={() => setSheet('cardio')}
          />
        ) : null}
        {sheet === 'run' || sheet === 'cardio' ? (
          <RunSheet
            open
            onClose={() => setSheet(null)}
            today={today}
            defaultType={rec?.run_type ?? 'leve'}
            defaultActivity={sheet === 'run' ? 'corrida' : undefined}
          />
        ) : null}
        {sheet === 'time' ||
        sheet === 'focus' ||
        sheet === 'no_equipment' ||
        sheet === 'spare_joint' ? (
          <AdjustSheet
            kind={sheet}
            onClose={() => setSheet(null)}
            base={data.routine ? data.items : []}
            library={library}
            profile={profile}
            today={today}
          />
        ) : null}
      </Suspense>
    </>
  );
}

/**
 * Offered once to whoever has a plan and no reminder (the sign-up offers it too):
 * 30 minutes before the workout, and the week's summary on Sunday. Either answer is
 * remembered in the profile, so other phones do not ask again.
 */
function ReminderOffer({ today }: { today: string }) {
  const profile = useProfile();
  const { plan } = useCurrentPlan(today);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = profile?.reminders ?? DEFAULT_REMINDERS;
  if (!profile || !plan || r.enabled || r.offered || !backendConfigured()) return null;
  if (!canOfferReminders()) return null;
  const at = minutesBefore(
    profile.onboarding?.time ?? plan.days.find((d) => d.kind === 'gym')?.time ?? '06:00',
  );
  return (
    <Widget
      icon={BellRing}
      pastel="butter"
      title="Lembrete do treino"
      sub={`30 minutos antes, às ${at}, e o resumo da semana no domingo à noite`}
    >
      <div className="row health-choice">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            // The browser asks for notifications only inside the tap: before any await.
            const push = enablePush();
            setBusy(true);
            void (async () => {
              const res = await push;
              await updateProfile({
                reminders: { ...r, enabled: res.ok, weekly: res.ok, gym_time: at, offered: true },
              });
              if (res.ok) toast.show('Lembrete ligado');
              else toast.show(res.message ?? 'Sem lembrete por enquanto', { error: true });
              setBusy(false);
            })();
          }}
        >
          Ligar lembrete
        </Button>
        <Button
          variant="tint"
          disabled={busy}
          onClick={() => void updateProfile({ reminders: { ...r, offered: true } })}
        >
          Agora não
        </Button>
      </div>
    </Widget>
  );
}

function PageHead({ name, today }: { name: string; today: string }) {
  return (
    <>
      <div className="mobile-brand">
        <Wordmark />
        <span className="row" style={{ gap: 4 }}>
          <SyncBadge />
          <InboxBell />
        </span>
      </div>
      <header className="page-head">
        <div>
          <div className="page-title-row">
            <h1 className="page-title">
              {greeting()}
              {name ? `, ${name}` : ''}
            </h1>
            <StreakFlame today={today} />
          </div>
          <p className="page-sub">{capitalize(formatLongDay(today))}</p>
        </div>
      </header>
    </>
  );
}

/** The next day of the plan with a workout or a run, after today: 'na quarta'. */
function nextPlannedDay(plan: PlanRow | null, today: string): string | null {
  if (!plan) return null;
  for (let i = 1; i <= 7; i += 1) {
    const day = addDays(today, i);
    const planned = planDayFor(plan, day);
    if (planned && planned.kind !== 'rest') return onWeekday(weekday(day));
  }
  return null;
}

/**
 * Until the first workout: what is going to happen, in a few lines. One day after launch,
 * 7 of 8 accounts had a plan and only 2 had trained; this is for the other 5.
 */
function FirstSteps({
  kind,
  exercises,
  minutes,
  nextDay,
}: {
  kind: DayRecommendation['kind'];
  exercises: number;
  minutes: number | null;
  nextDay: string | null;
}) {
  const gym = [
    'Toque em Iniciar treino, aqui em cima: os exercícios vêm em ordem, com séries e repetições.',
    'Na primeira vez de cada exercício, escolha uma carga em que as repetições saiam com 2 ou 3 sobrando. Dali em diante, o app sugere a carga.',
    'Marque cada série com um toque. O descanso conta sozinho e avisa quando acabar.',
    'Encerre quando terminar, ou antes se precisar: o que foi feito fica salvo.',
  ];
  const run = [
    'Corra como está aqui em cima: cada parte com o ritmo ou o esforço.',
    'Na volta, toque em Registrar corrida: distância, tempo e esforço.',
    'Com um tempo recente em Plano, Seus ritmos, as próximas corridas ganham ritmo.',
  ];
  const steps = kind === 'gym' ? gym : kind === 'run' ? run : null;
  return (
    <Widget
      icon={Sparkles}
      pastel="lavender"
      title={kind === 'run' ? 'Sua primeira corrida' : 'Seu primeiro treino'}
      sub={
        kind === 'gym' && exercises
          ? `${exercises} exercícios${minutes ? `, uns ${minutes} min` : ''}`
          : undefined
      }
    >
      <div data-testid="first-steps">
        {steps ? (
          <ol className="stack-sm t-regular" style={{ margin: 0, paddingLeft: 20 }}>
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="t-regular" style={{ margin: 0 }}>
            Hoje é descanso no seu plano.
            {nextDay ? ` O primeiro treino é ${nextDay}.` : ''} Se quiser começar hoje, toque em
            Registrar treino.
          </p>
        )}
      </div>
    </Widget>
  );
}

function RecommendationCard({
  data,
  run,
  hasActive,
  starting,
  onStart,
  onChoose,
  onRun,
  onCardio,
}: {
  data: ReturnType<typeof useTodayData>;
  run: RunSession | null;
  hasActive: boolean;
  starting: boolean;
  onStart: () => void;
  onChoose: () => void;
  onRun: () => void;
  /** Any cardio: opens on the last one used on this phone. */
  onCardio: () => void;
}) {
  const rec = data.rec;
  // Hides the explanation only: the workout to start stays the one in the title.
  const [hidden, setHidden] = useState(false);
  if (!rec) return null;
  const icon: LucideIcon = rec.today_done
    ? CircleCheck
    : rec.kind === 'gym'
      ? Dumbbell
      : rec.kind === 'run'
        ? Footprints
        : Moon;
  const pastel =
    rec.kind === 'gym' && rec.split_key
      ? SPLITS[rec.split_key].pastel
      : rec.kind === 'run'
        ? RUN_PASTEL
        : 'neutral';
  const planned = rec.planned_today;
  const plannedText =
    planned?.kind === 'gym' && planned.split_key
      ? `Plano: ${SPLITS[planned.split_key].label.toLowerCase()} às ${planned.time}`
      : planned?.kind === 'gym'
        ? `Plano: academia às ${planned.time}`
        : planned?.kind === 'run'
          ? `Plano: corrida às ${planned.time}`
          : planned
            ? 'Plano: descanso'
            : 'Sem plano para hoje';
  const sub =
    rec.kind === 'gym' && data.items.length
      ? `${data.items.length} exercícios · ${plannedText}`
      : plannedText;
  const loadAlerts = rec.alerts.filter((a) => !rec.reason.includes(a.text));
  const alertList = loadAlerts.length ? (
    <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {loadAlerts.map((a) => (
        <li key={a.text} className="row t-regular" style={{ alignItems: 'flex-start', gap: 8 }}>
          <Icon icon={TriangleAlert} size={18} className="t-muted" />
          <span>{a.text}</span>
        </li>
      ))}
    </ul>
  ) : null;

  let foot: React.ReactNode = null;
  if (!hasActive) {
    if (rec.kind === 'gym') {
      foot = (
        <>
          <Button variant="primary" block onClick={onStart} disabled={starting}>
            {starting ? 'Preparando' : 'Iniciar treino'}
          </Button>
          <Button variant="tint" onClick={onChoose}>
            Escolher outro
          </Button>
        </>
      );
    } else if (rec.kind === 'run') {
      foot = (
        <>
          <Button variant="primary" block onClick={onRun}>
            Registrar corrida
          </Button>
          <Button variant="tint" onClick={onChoose}>
            Treinar academia
          </Button>
        </>
      );
    } else {
      foot = (
        <>
          <Button variant="outline" onClick={onChoose}>
            Registrar treino
          </Button>
          <Button variant="outline" onClick={onCardio}>
            Registrar cardio
          </Button>
        </>
      );
    }
  }

  return (
    <Widget
      icon={icon}
      pastel={pastel}
      title={run?.headline ?? rec.headline}
      sub={sub}
      foot={foot}
      id="recomendacao"
    >
      {hidden ? (
        <div className="stack-sm">
          {alertList}
          <button
            type="button"
            className="hb-btn-link"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setHidden(false)}
          >
            Mostrar explicação
          </button>
        </div>
      ) : (
        <div className="stack-sm">
          <p className="t-regular" style={{ margin: 0 }} data-testid="today-reason">
            {rec.reason}
          </p>
          {run ? (
            <>
              <ol className="run-steps" data-testid="run-steps">
                {run.steps.map((s) => (
                  <li key={s.label}>
                    <strong className="t-strong">{s.label}</strong>
                    <span>{s.detail}</span>
                  </li>
                ))}
              </ol>
              <div className="hb-advice hb-advice-brand" data-testid="run-why">
                <Icon icon={Flag} />
                <span>{run.why}</span>
              </div>
            </>
          ) : null}
          {rec.kind === 'light' ? (
            <p className="t-regular t-muted" style={{ margin: 0 }}>
              Algo leve: caminhada, mobilidade ou alongamento.
            </p>
          ) : null}
          {data.adjusted?.summary ? (
            <p className="t-regular t-muted" style={{ margin: 0 }}>
              Ajustado: {data.adjusted.summary}
            </p>
          ) : null}
          {alertList}
          {/* Rest day or workout already done: nothing to hide. */}
          {rec.kind !== 'rest' ? (
            <button
              type="button"
              className="hb-btn-link"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setHidden(true)}
            >
              Ocultar explicação
            </button>
          ) : null}
        </div>
      )}
    </Widget>
  );
}

function AdjustChips({
  data,
  onPick,
  onRun,
  onRest,
  onUndo,
}: {
  data: ReturnType<typeof useTodayData>;
  onPick: (k: AdjustKind) => void;
  onRun: () => void;
  onRest: () => void;
  onUndo: () => void;
}) {
  const health = useHealthOn();
  const chips: { label: string; icon: LucideIcon; run: () => void; pastel: string }[] =
    data.override
      ? [{ label: 'Desfazer ajuste', icon: Undo2, run: onUndo, pastel: 'var(--bg-subtle)' }]
      : [
          {
            label: 'Tenho pouco tempo',
            icon: Clock,
            run: () => onPick('time'),
            pastel: 'var(--pastel-sky)',
          },
          {
            label: 'Focar em um grupo',
            icon: Focus,
            run: () => onPick('focus'),
            pastel: 'var(--pastel-lavender)',
          },
          {
            label: 'Sem equipamento',
            icon: Wrench,
            run: () => onPick('no_equipment'),
            pastel: 'var(--pastel-peach)',
          },
          // A joint to spare tells about pain or injury: health data, only with consent.
          ...(health
            ? [
                {
                  label: 'Poupar articulação',
                  icon: Ban,
                  run: () => onPick('spare_joint'),
                  pastel: 'var(--pastel-pink)',
                },
              ]
            : []),
          {
            label: 'Trocar por corrida',
            icon: Footprints,
            run: onRun,
            pastel: 'var(--pastel-mint)',
          },
          { label: 'Hoje é descanso', icon: Moon, run: onRest, pastel: 'var(--bg-subtle)' },
        ];
  return (
    <section aria-label="Ajustar o dia" className="scroll-x">
      {chips.map((c) => (
        <button key={c.label} type="button" className="hb-qa" onClick={c.run}>
          <span className="hb-qa-icon" style={{ background: c.pastel }}>
            <Icon icon={c.icon} size={14} />
          </span>
          {c.label}
        </button>
      ))}
    </section>
  );
}

function WeekCard({ today }: { today: string }) {
  const { plan, loaded } = useCurrentPlan(today);
  const sessions = useSessions();
  const runs = useRuns();
  const [editing, setEditing] = useState<number | null>(null);
  // Until it all loads, no "0 de 0" for a moment.
  if (!loaded || !sessions || !runs) return <LoadingCard lines={2} />;
  const start = weekStart(today);
  const done = sessions.filter((s) => s.status === 'done');
  const report = weekReport({
    day: today,
    today,
    plan,
    gymDates: done.map((s) => s.local_date),
    runDates: countedCardio(runs, () => plan?.run_per_week ?? 0).map((r) => r.local_date),
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // Another cardio this week also fills the run days: then the line says cardio.
  const cardioWord = runs.some(
    (r) =>
      r.local_date >= start && r.local_date <= addDays(start, 6) && activityOf(r) !== 'corrida',
  )
    ? 'Cardio'
    : 'Corrida';
  return (
    <Widget
      title="Sua semana"
      sub={`${formatDDMM(start)} a ${formatDDMM(addDays(start, 6))}`}
      icon={Dumbbell}
      pastel="butter"
    >
      <div className="stack">
        <div className="hb-week">
          {days.map((d) => (
            <DayCell
              key={d}
              day={d}
              today={today}
              plan={plan}
              sessions={done}
              runs={runs}
              onOpen={plan ? () => setEditing(weekday(d)) : undefined}
            />
          ))}
        </div>
        <p className="t-regular" style={{ margin: 0 }} data-testid="week-text">
          Academia{' '}
          <strong className="t-strong t-num">
            {report.done_gym} de {report.planned_gym}
          </strong>
          {report.planned_run || report.done_run ? (
            <>
              {' · '}
              {cardioWord}{' '}
              <strong className="t-strong t-num">
                {report.planned_run
                  ? `${report.done_run} de ${report.planned_run}`
                  : report.done_run}
              </strong>
            </>
          ) : null}
          {report.status === 'cumprida' ? ' · plano cumprido' : ''}
        </p>
      </div>
      {editing != null && plan ? (
        <PlanDaySheet
          plan={plan}
          weekday={editing}
          today={today}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Widget>
  );
}

function DayCell({
  day,
  today,
  plan,
  sessions,
  runs,
  onOpen,
}: {
  day: string;
  today: string;
  plan: PlanRow | null;
  sessions: SessionRow[];
  runs: RunRow[];
  /** Opens the plan day: change it or swap it with another day. */
  onOpen?: (() => void) | undefined;
}) {
  const planned = planDayFor(plan, day);
  const s = sessions.find((x) => x.local_date === day);
  const r = runs.find((x) => x.local_date === day);
  let icon: LucideIcon = Moon;
  let cls = '';
  let style: React.CSSProperties | undefined;
  let label = 'descanso';
  if (s) {
    icon = Dumbbell;
    cls = 'is-done';
    style = { background: `var(--pastel-${s.split_key ? SPLITS[s.split_key].pastel : 'sky'})` };
    label = `feito: ${s.title}`;
    if (s.split_key && SPLITS[s.split_key].pastel === 'neutral')
      style = { background: 'var(--bg-subtle)' };
  } else if (r) {
    cls = 'is-done';
    style = { background: 'var(--pastel-mint)' };
    label = `feito: ${cardioTitle(r)}`;
    icon = CARDIO_ICON[activityOf(r)];
  } else if (planned?.kind === 'gym') {
    icon = Dumbbell;
    label = `planejado: ${planned.split_key ? SPLITS[planned.split_key].label : 'academia'}`;
  } else if (planned?.kind === 'run') {
    icon = Footprints;
    label = 'planejado: corrida';
  }
  const body = (
    <>
      <span aria-hidden="true">{WEEKDAY_LETTER[weekday(day)]}</span>
      <span className={`hb-day-dot ${cls}`} style={style} title={label}>
        <Icon icon={icon} size={16} label={onOpen ? undefined : `${formatDDMM(day)}: ${label}`} />
      </span>
      <span className="t-num" aria-hidden="true">
        {day.slice(8)}
      </span>
    </>
  );
  const cls2 = `hb-day ${day === today ? 'is-today' : ''}`;
  return onOpen ? (
    <button type="button" className={`${cls2} hb-day-btn`} onClick={onOpen}>
      {body}
      {/* Read instead of the letter and the number, which are hidden from screen readers. */}
      <span className="hb-sr">
        {`${capitalize(WEEKDAY_NAMES[weekday(day)] ?? '')}, ${formatDDMM(day)}: ${label}. Mudar no plano`}
      </span>
    </button>
  ) : (
    <div className={cls2}>{body}</div>
  );
}

function RecognitionCard({ r }: { r: Recognition }) {
  return (
    <section className={`hb-recog p-${r.pastel}`} aria-label={r.title}>
      <h2 className="hb-recog-title">{r.title}</h2>
      <p className="hb-recog-value">{r.value}</p>
      <p className="hb-recog-detail">{r.detail}</p>
    </section>
  );
}

function Recognitions({ today }: { today: string }) {
  const plans = usePlans();
  const sessions = useSessions();
  const runs = useRuns();
  const records = useRecords();
  const ret = useReturnMode(today);
  const library = useExercises();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const out = useMemo(() => {
    if (!plans || !sessions || !runs) return null;
    const gymDates = sessions.filter((s) => s.status === 'done').map((s) => s.local_date);
    const runDates = countedCardio(runs, (w) => plansFor(plans, w)?.run_per_week ?? 0).map(
      (r) => r.local_date,
    );
    const hour = new Date().getHours();
    const sundayEvening = weekday(today) === 6 && hour >= 18;
    const earlyWeek = weekday(today) <= 1;
    const refDay = sundayEvening ? today : earlyWeek ? addDays(weekStart(today), -1) : today;
    const plan = plansFor(plans, refDay);
    const report = weekReport({
      day: refDay,
      today: sundayEvening ? addDays(today, 1) : today,
      plan,
      gymDates,
      runDates,
    });
    const streak = weeksInARow(today, plans, gymDates, runDates);
    const cards: Recognition[] = weekRecognitions(report, streak);
    const recent = records.filter((r) => r.local_date >= addDays(today, -6));
    // Only the latest record: Today is about the day's workout; the rest is in Histórico.
    for (const rec of recent.slice(0, 1)) cards.push(recordCard(rec, library));
    const ws = weekStart(refDay);
    const weekRecords = records.filter(
      (r) => r.local_date >= ws && r.local_date <= addDays(ws, 6) && r.exercise_id,
    );
    const summary =
      sundayEvening || earlyWeek
        ? weeklySummary({
            report,
            records: weekRecords.map((r) => ({
              kind: r.kind,
              value: r.value,
              previous: r.value,
              unit: r.unit,
              local_date: r.local_date,
              session_id: r.session_id ?? '',
              exercise_name: r.exercise_name,
            })),
            runMilestones: [],
            nextWeekPlan: plansFor(plans, addDays(ws, 7)),
            returnMode: ret.active,
          })
        : null;
    return { cards, report, summary, previous: !sundayEvening && earlyWeek };
  }, [plans, sessions, runs, records, today, ret.active, library]);

  if (!out) return <LoadingCard lines={2} />;
  return (
    <>
      {out.report.status === 'desvio' ? (
        <div className="hb-advice" role="note" data-testid="deviation">
          <Icon icon={TriangleAlert} />
          <span>{out.report.text}</span>
        </div>
      ) : null}
      {out.cards.map((c) => (
        <RecognitionCard key={`${c.kind}-${c.title}-${c.value}`} r={c} />
      ))}
      {out.summary ? (
        <Widget
          title={out.previous ? 'Resumo da semana passada' : 'Resumo da semana'}
          sub={out.summary.done}
          action={
            <button type="button" className="hb-btn-link" onClick={() => setSummaryOpen(true)}>
              Ver
            </button>
          }
        />
      ) : null}
      {out.summary ? (
        <Sheet
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          title={out.previous ? 'Semana passada' : 'Sua semana'}
        >
          <div className="stack">
            <p className="t-regular" style={{ margin: 0 }}>
              {out.summary.done}
            </p>
            <div className="stack-sm">
              <span className="t-label">O que evoluiu</span>
              {out.summary.evolved.length ? (
                <ul className="t-regular" style={{ margin: 0, paddingLeft: 20 }}>
                  {out.summary.evolved.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-line" style={{ padding: 0 }}>
                  Nenhum recorde nesta semana.
                </p>
              )}
            </div>
            <div className="stack-sm">
              <span className="t-label">Foco da próxima semana</span>
              <p className="t-regular" style={{ margin: 0 }}>
                {out.summary.focus}
              </p>
            </div>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

function plansFor(plans: PlanRow[], day: string): PlanRow | null {
  const end = addDays(weekStart(day), 6);
  return (
    [...plans]
      .filter((p) => p.active_from <= end)
      .sort(
        (a, b) => b.active_from.localeCompare(a.active_from) || b.updated_at - a.updated_at,
      )[0] ?? null
  );
}

function recordCard(r: RecordRow, library: ExerciseRow[]): Recognition {
  if (r.kind === 'marco' || r.kind === 'distancia') {
    return {
      kind: 'corrida',
      title: r.exercise_name,
      value: `${fmtNum(r.value)} km`,
      detail: `Em ${formatDDMM(r.local_date)}.`,
      pastel: 'mint',
    };
  }
  const ex = library.find((e) => e.id === r.exercise_id);
  const unit = r.unit === 'kg' ? 'kg' : r.unit === 's' ? 's' : 'repetições';
  return {
    kind: 'recorde',
    title:
      r.kind === 'e1rm'
        ? `Força estimada: ${r.exercise_name.toLowerCase()}`
        : `Recorde: ${r.exercise_name.toLowerCase()}`,
    value: `${fmtNum(r.value)} ${unit}`,
    detail: `Em ${formatDDMM(r.local_date)}.`,
    pastel: ex ? GROUP_PASTEL[ex.primary_group] : 'sky',
  };
}

/**
 * Lighter week: suggested when fatigue shows, with the reason; while it runs, a
 * reminder and a way back. Declined, it stays quiet for two weeks.
 */
function DeloadCard({ today }: { today: string }) {
  const advice = useDeloadAdvice(today);
  const toast = useToast();
  if (!advice || advice.state === 'none') return null;
  if (advice.state === 'active') {
    return (
      <div className="hb-advice" role="note" data-testid="deload-active">
        <Icon icon={BatteryCharging} />
        <span>
          Semana leve até domingo: metade das séries, 10% menos carga e parando com 3 a 4 repetições
          na reserva.{' '}
          <button type="button" className="hb-btn-link" onClick={() => void endDeload()}>
            Voltar ao normal
          </button>
        </span>
      </div>
    );
  }
  return (
    <Widget
      icon={BatteryCharging}
      pastel="butter"
      title="Semana leve sugerida"
      sub={advice.reasons.join(' ')}
      foot={
        <>
          <Button
            variant="tint"
            onClick={async () => {
              await acceptDeload(today);
              toast.show('Semana leve até domingo');
            }}
          >
            Fazer esta semana leve
          </Button>
          <Button variant="ghost" onClick={() => void dismissDeload(today)}>
            Agora não
          </Button>
        </>
      }
    >
      <p className="t-regular" style={{ margin: 0 }} data-testid="deload-suggest">
        Mesmos treinos, metade das séries e 10% menos carga, parando com 3 a 4 repetições na
        reserva. Tira o cansaço acumulado; a progressão volta na semana seguinte.
      </p>
    </Widget>
  );
}
