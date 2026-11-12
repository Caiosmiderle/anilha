import {
  ChartLine,
  Dumbbell,
  History as HistoryIcon,
  Pencil,
  Repeat,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { lazyScreen } from '../lib/lazyScreen';
import { Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useAllItems,
  useAllSets,
  useExerciseMap,
  usePlans,
  useProfile,
  useRecords,
  useReturnMode,
  useRuns,
  useSessions,
  useToday,
} from '../data/hooks';
import { fmtPct, weekReport, type WeekReport } from '../engine/adherence';
import {
  addDays,
  capitalize,
  formatDDMM,
  WEEKDAY_SHORT,
  weekday,
  weekStart,
} from '../engine/dates';
import { activityOf, cardioName, countedCardio, distanceText, paceText } from '../engine/cardio';
import { fmtDuration, fmtLoad, fmtNum, plural } from '../engine/format';
import { CARDIO_ICON } from '../ui/cardioIcons';
import { buildExerciseLogs } from '../engine/history';
import { planForDay } from '../engine/recommend';
import { RETURN_VOLUME_CAP } from '../engine/returnMode';
import { SPLITS, VOLUME_GROUP_LABEL } from '../engine/taxonomy';
import type { ExerciseRow, RunRow, SessionRow, Unit, VolumeGroup } from '../engine/types';
import { weeklyGroupSets } from '../engine/volume';
import { BarList } from '../ui/charts';
import { ExerciseProgress } from './parts/ExerciseProgress';
import { MonthCalendar, type DayMarks } from './parts/MonthCalendar';
import { Disc, Empty, LoadingCard, Meter, Segmented, Widget } from '../ui/primitives';
import { useLongPress } from '../ui/longPress';
import { canRepeat, SessionActionsSheet, useRepeatSession } from './parts/SessionActions';
import { SwipeRow } from '../ui/swipe';

const BodyTab = lazyScreen(
  () => import('./parts/BodyTab'),
  (m) => m.BodyTab,
);
const RunSheet = lazyScreen(
  () => import('./sheets/RunSheet'),
  (m) => m.RunSheet,
);
const RunActionsSheet = lazyScreen(
  () => import('./sheets/RunSheet'),
  (m) => m.RunActionsSheet,
);

type Tab = 'treinos' | 'progresso' | 'semanas' | 'corpo';

export default function History() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab | null) ?? 'treinos';
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="page-sub">O que foi feito, o que evoluiu e como andam as semanas.</p>
          <Link to="/historico/calendario" className="hb-btn-link">
            Calendário
          </Link>
        </div>
      </header>
      <Segmented<Tab>
        label="Seção do histórico"
        value={tab}
        options={[
          { value: 'treinos', label: 'Treinos' },
          { value: 'progresso', label: 'Progresso' },
          { value: 'semanas', label: 'Semanas' },
          { value: 'corpo', label: 'Corpo' },
        ]}
        onChange={(t) => setParams({ aba: t }, { replace: true })}
      />
      {tab === 'treinos' ? (
        <Workouts />
      ) : tab === 'progresso' ? (
        <Progress />
      ) : tab === 'corpo' ? (
        <Suspense fallback={<LoadingCard lines={3} />}>
          <BodyTab />
        </Suspense>
      ) : (
        <Weeks />
      )}
    </>
  );
}

function Workouts() {
  const sessions = useSessions();
  const runs = useRuns();
  const plans = usePlans();
  const items = useAllItems();
  const sets = useAllSets();
  const today = useToday();
  const [editRun, setEditRun] = useState<RunRow | null>(null);
  const [runMenu, setRunMenu] = useState<{ run: RunRow; mode: 'menu' | 'delete' } | null>(null);
  const groups = useMemo(() => {
    if (!sessions || !runs || !plans) return null;
    const done = sessions.filter((s) => s.status === 'done');
    const entries = [
      ...done.map((s) => ({ kind: 'session' as const, day: s.local_date, at: s.started_at, s })),
      ...runs.map((r) => ({ kind: 'run' as const, day: r.local_date, at: 0, r })),
    ].sort((a, b) => b.day.localeCompare(a.day) || b.at - a.at);
    const byWeek = new Map<string, typeof entries>();
    for (const e of entries) {
      const w = weekStart(e.day);
      byWeek.set(w, [...(byWeek.get(w) ?? []), e]);
    }
    return [...byWeek.entries()].map(([w, list]) => ({
      week: w,
      list,
      report: weekReport({
        day: w,
        today,
        plan: planForDay(plans, w),
        gymDates: done.map((s) => s.local_date),
        runDates: countedCardio(runs, (x) => planForDay(plans, x)?.run_per_week ?? 0).map(
          (r) => r.local_date,
        ),
      }),
    }));
  }, [sessions, runs, plans, today]);

  if (!groups) return <LoadingCard lines={4} />;
  if (groups.length === 0) return <Empty icon={HistoryIcon}>Nenhum treino registrado ainda.</Empty>;

  const marks = new Map<string, DayMarks>();
  for (const g of groups)
    for (const e of g.list) {
      const m = marks.get(e.day) ?? { gym: 0, cardio: 0 };
      if (e.kind === 'session') m.gym += 1;
      else m.cardio += 1;
      marks.set(e.day, m);
    }

  const countFor = (s: SessionRow) => {
    const its = (items ?? []).filter((i) => i.session_id === s.id);
    const work = (sets ?? []).filter((x) => x.session_id === s.id && x.kind === 'work').length;
    const skipped = its.filter((i) => i.status === 'skipped').length;
    if (s.detail === 'summary') return 'Registro resumido';
    const done = its.filter((i) => i.status === 'done').length;
    const time = s.ended_at
      ? `${fmtDuration(Math.round((s.ended_at - s.started_at) / 1000))} · `
      : '';
    return `${time}${done} ${plural(done, 'exercício', 'exercícios')} · ${work} ${plural(work, 'série', 'séries')}${skipped ? ` · ${skipped} ${plural(skipped, 'pulado', 'pulados')}` : ''}`;
  };

  const rowFor = (e: (typeof groups)[number]['list'][number]) =>
    e.kind === 'session' ? (
      <SessionLink key={e.s.id} session={e.s} sub={countFor(e.s)} />
    ) : (
      <RunListRow
        key={e.r.id}
        run={e.r}
        onOpen={() => setEditRun(e.r)}
        onMenu={() => setRunMenu({ run: e.r, mode: 'menu' })}
        onDelete={() => setRunMenu({ run: e.r, mode: 'delete' })}
      />
    );

  return (
    <div className="stack">
      <MonthCalendar
        today={today}
        marks={marks}
        renderDay={(day) => (
          <div className="hb-list">
            {groups.flatMap((g) => g.list.filter((e) => e.day === day)).map(rowFor)}
          </div>
        )}
      />
      {groups.map((g) => (
        <section key={g.week} className="stack-sm" aria-label={`Semana de ${formatDDMM(g.week)}`}>
          <div className="row">
            <h2 className="section-title" style={{ flex: 1 }}>
              Semana de {formatDDMM(g.week)}
            </h2>
            <WeekStatus report={g.report} />
          </div>
          <div className="hb-widget">
            <div className="hb-list">{g.list.map(rowFor)}</div>
          </div>
        </section>
      ))}
      <Suspense fallback={null}>
        {editRun ? (
          <RunSheet open onClose={() => setEditRun(null)} today={today} run={editRun} />
        ) : null}
        {runMenu ? (
          <RunActionsSheet
            run={runMenu.run}
            initial={runMenu.mode}
            today={today}
            onClose={() => setRunMenu(null)}
          />
        ) : null}
      </Suspense>
    </div>
  );
}

function WeekStatus({ report }: { report: WeekReport }) {
  const map: Record<WeekReport['status'], { text: string; color: string }> = {
    cumprida: { text: 'Plano cumprido', color: 'var(--accent-teal)' },
    desvio: { text: 'Desvio do plano', color: 'var(--accent-orange)' },
    parcial: { text: 'Parcial', color: 'var(--ink-subtle)' },
    em_andamento: { text: 'Em andamento', color: 'var(--brand-500)' },
    sem_plano: { text: 'Sem plano', color: 'var(--ink-subtle)' },
  };
  const m = map[report.status];
  return (
    <span className="hb-status">
      <i style={{ background: m.color }} aria-hidden="true" />
      {m.text}
    </span>
  );
}

function Progress() {
  const sessions = useSessions();
  const items = useAllItems();
  const sets = useAllSets();
  const exMap = useExerciseMap();
  const records = useRecords();
  const profile = useProfile();
  const today = useToday();
  const ret = useReturnMode(today);
  const unit: Unit = profile?.unit ?? 'kg';
  const withHistory = useMemo(() => {
    if (!sets || !sessions) return [];
    // Exercises with the most sessions first, loaded ones before bodyweight.
    const sessionsOf = new Map<string, Set<string>>();
    const loaded = new Set<string>();
    for (const s of sets) {
      if (s.kind !== 'work') continue;
      const set = sessionsOf.get(s.exercise_id) ?? new Set<string>();
      set.add(s.session_id);
      sessionsOf.set(s.exercise_id, set);
      if ((s.load_kg ?? 0) > 0) loaded.add(s.exercise_id);
    }
    return [...sessionsOf.entries()]
      .sort((a, b) => b[1].size - a[1].size || Number(loaded.has(b[0])) - Number(loaded.has(a[0])))
      .map(([id]) => exMap.get(id))
      .filter((e): e is ExerciseRow => !!e);
  }, [sets, sessions, exMap]);
  const [chosen, setChosen] = useState<string | null>(null);
  const exercise = withHistory.find((e) => e.id === chosen) ?? withHistory[0];

  const volume = useMemo(() => {
    if (!sets || !sessions) return new Map<VolumeGroup, number>();
    const dayBySession = new Map(sessions.map((s) => [s.id, s.local_date]));
    return weeklyGroupSets(
      today,
      sets
        .filter((s) => dayBySession.has(s.session_id))
        .map((s) => ({
          local_date: dayBySession.get(s.session_id) as string,
          exercise_id: s.exercise_id,
          kind: s.kind,
        })),
      exMap,
    );
  }, [sets, sessions, exMap, today]);

  if (!sets || !sessions || !items) return <LoadingCard lines={4} />;

  return (
    <div className="stack">
      {exercise ? (
        <ExerciseProgress
          key={exercise.id}
          exercise={exercise}
          options={withHistory}
          onChoose={setChosen}
          unit={unit}
          logs={buildExerciseLogs(exercise.id, sessions, items, sets)}
        />
      ) : (
        <Widget icon={ChartLine} pastel="sky" title="Progresso por exercício">
          <p className="empty-line">Registre séries para ver a evolução.</p>
        </Widget>
      )}
      <Widget
        title="Séries por grupo nesta semana"
        sub={
          ret.active
            ? `Modo retorno: limite de ${RETURN_VOLUME_CAP} por grupo`
            : 'Só séries de trabalho'
        }
      >
        {volume.size ? (
          <BarList
            unit=""
            rows={[...volume.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([g, n]) => ({ label: VOLUME_GROUP_LABEL[g], value: n }))}
            limit={ret.active ? RETURN_VOLUME_CAP : undefined}
            limitLabel={ret.active ? `Linha tracejada: ${RETURN_VOLUME_CAP} séries` : undefined}
          />
        ) : (
          <p className="empty-line">Nenhuma série de trabalho nesta semana.</p>
        )}
      </Widget>
      <Widget icon={TrendingUp} pastel="butter" title="Recordes">
        {records.length ? (
          <ul className="stack-sm t-regular" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {records.slice(0, 12).map((r) => (
              <li key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  {r.exercise_name}
                  <span className="t-caption" style={{ display: 'block' }}>
                    {r.kind === 'e1rm'
                      ? '1RM estimado'
                      : r.kind === 'carga'
                        ? 'Carga'
                        : r.kind === 'marco'
                          ? 'Marco'
                          : capitalize(r.kind)}{' '}
                    em {formatDDMM(r.local_date)}
                  </span>
                </span>
                <strong className="t-strong t-num">
                  {r.unit === 'kg'
                    ? fmtLoad(r.value, unit)
                    : r.unit === 'km'
                      ? `${fmtNum(r.value)} km`
                      : `${fmtNum(r.value)} ${r.unit === 's' ? 's' : 'reps'}`}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-line">
            Nenhum recorde ainda. A primeira sessão de cada exercício é a base.
          </p>
        )}
      </Widget>
    </div>
  );
}

function Weeks() {
  const sessions = useSessions();
  const runs = useRuns();
  const plans = usePlans();
  const today = useToday();
  const weeks = useMemo(() => {
    if (!sessions || !runs || !plans) return null;
    const gym = sessions.filter((s) => s.status === 'done').map((s) => s.local_date);
    const run = countedCardio(runs, (w) => planForDay(plans, w)?.run_per_week ?? 0).map(
      (r) => r.local_date,
    );
    const out: (WeekReport & { cardio: string })[] = [];
    let w = weekStart(today);
    for (let i = 0; i < 12; i += 1) {
      const r = weekReport({
        day: w,
        today,
        plan: planForDay(plans, w),
        gymDates: gym,
        runDates: run,
      });
      // Another cardio that week fills the run days too: then the line says cardio.
      const end = addDays(w, 6);
      const other = runs.some(
        (x) => x.local_date >= w && x.local_date <= end && activityOf(x) !== 'corrida',
      );
      if (r.done_gym || r.done_run || r.planned_gym || i === 0)
        out.push({ ...r, cardio: other ? 'Cardio' : 'Corrida' });
      w = addDays(w, -7);
    }
    return out;
  }, [sessions, runs, plans, today]);
  if (!weeks) return <LoadingCard lines={4} />;
  return (
    <div className="hb-widget">
      <div className="hb-list">
        {weeks.map((r) => (
          <div
            key={r.week_start}
            className="hb-list-row"
            style={{ alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }}
          >
            <div className="hb-list-main stack-sm" style={{ gap: 6 }}>
              <div className="row">
                <span className="hb-list-title" style={{ flex: 1 }}>
                  {formatDDMM(r.week_start)} a {formatDDMM(r.week_end)}
                </span>
                <WeekStatus report={r} />
              </div>
              <span className="hb-list-sub">
                Academia {r.done_gym} de {r.planned_gym} · {r.cardio}{' '}
                {r.planned_run ? `${r.done_run} de ${r.planned_run}` : r.done_run} · {r.rest_days}{' '}
                {r.rest_days === 1 ? 'dia' : 'dias'} de descanso
              </span>
              {r.planned_gym + r.planned_run > 0 ? (
                <div className="row" style={{ gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Meter value={r.pct} label={`Plano cumprido: ${fmtPct(r.pct)}`} />
                  </div>
                  <span className="t-caption t-num">{fmtPct(r.pct)}</span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A row of the history. Tap opens it; hold (or right click) opens its menu; slide right to
 * repeat it, left to delete it (still asked).
 */
function SessionLink({ session, sub }: { session: SessionRow; sub: string }) {
  const [menu, setMenu] = useState<'menu' | 'delete' | null>(null);
  const press = useLongPress(() => setMenu('menu'));
  const repeat = useRepeatSession();
  return (
    <SwipeRow
      start={
        canRepeat(session)
          ? { label: 'Repetir', icon: Repeat, tone: 'brand', onAction: () => void repeat(session) }
          : null
      }
      end={{ label: 'Apagar', icon: Trash2, tone: 'danger', onAction: () => setMenu('delete') }}
    >
      <Link to={`/historico/treino/${session.id}`} className="hb-list-row" {...press}>
        <Disc
          small
          icon={Dumbbell}
          pastel={session.split_key ? SPLITS[session.split_key].pastel : 'neutral'}
        />
        <span className="hb-list-main">
          <span className="hb-list-title" style={{ display: 'block' }}>
            {session.title}
          </span>
          <span className="hb-list-sub">
            {WEEKDAY_SHORT[weekday(session.local_date)]}, {formatDDMM(session.local_date)} · {sub}
          </span>
        </span>
      </Link>
      {menu ? (
        <SessionActionsSheet
          session={session}
          open
          confirmOnly={menu === 'delete'}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </SwipeRow>
  );
}

/** A run of the history. Tap edits it; hold opens its menu; slide right to edit, left to delete. */
function RunListRow({
  run,
  onOpen,
  onMenu,
  onDelete,
}: {
  run: RunRow;
  onOpen: () => void;
  onMenu: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(onMenu);
  return (
    <SwipeRow
      start={{ label: 'Editar', icon: Pencil, tone: 'brand', onAction: onOpen }}
      end={{ label: 'Apagar', icon: Trash2, tone: 'danger', onAction: onDelete }}
    >
      <button type="button" className="hb-list-row" onClick={onOpen} {...press}>
        <Disc small icon={CARDIO_ICON[activityOf(run)]} pastel="mint" />
        <span className="hb-list-main">
          <span className="hb-list-title" style={{ display: 'block' }}>
            {cardioName(run)}
            {run.source === 'crunning' ? ' do CRUNNING' : ''}
          </span>
          <span className="hb-list-sub">
            {[
              `${WEEKDAY_SHORT[weekday(run.local_date)]}, ${formatDDMM(run.local_date)}`,
              distanceText(run),
              fmtDuration(run.duration_sec),
              paceText(run),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
    </SwipeRow>
  );
}
