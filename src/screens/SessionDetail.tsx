import {
  ArrowRight,
  Dumbbell,
  Equal,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Share2,
  SkipForward,
  StickyNote,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccount } from '../app/account';
import type { SavedAnalysis } from '../analysis/local';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAllItems,
  useAllSets,
  useExerciseMap,
  useItems,
  useProfile,
  useRecords,
  useReturnMode,
  useSession,
  useSessions,
  useSets,
  useToday,
} from '../data/hooks';
import { capitalize, formatLongDay } from '../engine/dates';
import { fmtDuration, fmtLoad, fmtNum } from '../engine/format';
import { buildExerciseLogs } from '../engine/history';
import { suggestNext, type Suggestion } from '../engine/progression';
import { effortLabel, GROUP_PASTEL, JOINT_LABEL, SPLITS, type Pastel } from '../engine/taxonomy';
import type { ExerciseRow, SessionItemRow, SetRow, Unit } from '../engine/types';
import { Button, Chip, Disc, Empty, Icon, IconButton, LoadingCard, Widget } from '../ui/primitives';
import { setText } from '../data/display';
import { canRepeat, SessionActionsSheet, useRepeatSession } from './parts/SessionActions';
import { SetEditSheet } from './parts/SetEditSheet';
import { ShareCardSheet } from './parts/ShareCardSheet';
import { addDoneSet } from '../data/ops';
import { shareCardData, type ShareCardData } from '../lib/shareCard';
import { AnalysisCard } from '../analysis/AnalysisCard';

/** One finished session: what was planned, swapped, skipped, done, and what comes next time. */
export default function SessionDetail() {
  const { id } = useParams();
  const { db } = useAccount();
  const analysis = useLiveQuery(
    async () => (await db.meta.get(`analysis:${id}`))?.value as SavedAnalysis | undefined,
    [db, id],
  );
  // Only hide a duplicate when this exercise has a numeric preview in the saved card.
  const previewItemIDs = new Set(
    analysis?.reply.proximaVez
      ? analysis.context.items
          .filter((item) => item.next)
          .map((item) => analysis.binding.items[item.slot]?.id)
      : [],
  );
  const session = useSession(id);
  const items = useItems(id);
  const sets = useSets(id);
  const exMap = useExerciseMap();
  const profile = useProfile();
  const allSessions = useSessions();
  const allItems = useAllItems();
  const allSets = useAllSets();
  const records = useRecords();
  const today = useToday();
  const ret = useReturnMode(today);
  const navigate = useNavigate();
  const repeat = useRepeatSession();
  const [sheet, setSheet] = useState<'menu' | 'delete' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // The image to post is a test for the admin until it opens to everyone.
  const [shareCard, setShareCard] = useState<ShareCardData | null>(null);
  const unit: Unit = profile?.unit ?? 'kg';

  const next = useMemo(() => {
    const out = new Map<string, Suggestion>();
    if (!allSessions || !allItems || !allSets || !session) return out;
    for (const it of items) {
      if (it.status !== 'done') continue;
      const ex = exMap.get(it.exercise_id);
      if (!ex) continue;
      const logs = buildExerciseLogs(ex.id, allSessions, allItems, allSets);
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
  }, [allSessions, allItems, allSets, session, items, exMap, today, ret.active, unit]);

  if (session === undefined) return <LoadingCard lines={5} />;
  if (session === null || session.deleted)
    return <Empty icon={Dumbbell}>Treino não encontrado.</Empty>;

  const setsByItem = new Map<string, SetRow[]>();
  for (const s of sets) setsByItem.set(s.item_id, [...(setsByItem.get(s.item_id) ?? []), s]);
  const sessionRecords = records.filter((r) => r.session_id === session.id);
  const duration = session.ended_at
    ? Math.round((session.ended_at - session.started_at) / 1000)
    : null;
  const workDone = sets.filter((s) => s.kind === 'work' && s.completed_at != null).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">{session.title}</h1>
          <p className="page-sub">
            {capitalize(formatLongDay(session.local_date))}
            {duration ? ` · ${fmtDuration(duration)}` : ''}
            {session.detail === 'full'
              ? ` · ${workDone} ${workDone === 1 ? 'série' : 'séries'}`
              : ''}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Disc
            icon={Dumbbell}
            pastel={session.split_key ? SPLITS[session.split_key].pastel : 'neutral'}
          />
          <IconButton
            icon={MoreHorizontal}
            label="Opções do treino"
            onClick={() => setSheet('menu')}
          />
        </div>
      </header>

      {session.status === 'active' ? (
        <Button variant="primary" block onClick={() => navigate(`/treino/${session.id}`)}>
          Continuar treino
        </Button>
      ) : null}

      {sessionRecords.length ? (
        <section className="hb-recog p-butter" aria-label="Recordes deste treino">
          <h2 className="hb-recog-title">
            {sessionRecords.length === 1 ? 'Recorde neste treino' : 'Recordes neste treino'}
          </h2>
          <p className="hb-recog-value">{sessionRecords.length}</p>
          <p className="hb-recog-detail">
            {sessionRecords
              .map(
                (r) =>
                  `${r.exercise_name}: ${r.unit === 'kg' ? fmtLoad(r.value, unit) : fmtNum(r.value)}${r.kind === 'e1rm' ? ' de 1RM estimado' : ''}`,
              )
              .join('. ')}
            .
          </p>
        </section>
      ) : null}

      {session.detail === 'summary' ? (
        <p className="t-regular t-muted" style={{ margin: 0 }}>
          Registro resumido: só o tipo e a data, sem detalhe de séries.
        </p>
      ) : null}
      {session.status === 'done' && session.detail === 'full' ? (
        <AnalysisCard key={session.id} sessionID={session.id} />
      ) : null}
      {session.adjustments.length ? (
        <p className="t-caption" style={{ margin: 0 }}>
          Ajustado: {session.adjustments.join(' ')}
        </p>
      ) : null}
      {session.note ? (
        <div className="hb-note" style={{ minHeight: 0 }}>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Icon icon={StickyNote} />
            <p className="t-regular" style={{ margin: 0 }}>
              {session.note}
            </p>
          </div>
        </div>
      ) : null}

      <div className="stack">
        {items.map((it) => (
          <ItemSummary
            key={it.id}
            item={it}
            sets={setsByItem.get(it.id) ?? []}
            exName={exMap.get(it.exercise_id)?.name ?? it.exercise_id}
            originalName={
              it.original_exercise_id
                ? (exMap.get(it.original_exercise_id)?.name ?? it.original_exercise_id)
                : null
            }
            pastel={GROUP_PASTEL[exMap.get(it.exercise_id)?.primary_group ?? 'core']}
            ex={exMap.get(it.exercise_id)}
            unit={unit}
            next={previewItemIDs.has(it.id) ? null : (next.get(it.id) ?? null)}
            editable={session.status === 'done'}
            onEditSet={(s) => setEditing(s.id)}
            onAddSet={async () => {
              const id = await addDoneSet(it.id);
              if (id) setEditing(id);
            }}
          />
        ))}
        {items.length === 0 && session.detail === 'full' ? (
          <Empty icon={Dumbbell}>Nenhum exercício neste treino.</Empty>
        ) : null}
      </div>

      <div className="actions">
        {session.status === 'done' && session.detail === 'full' && workDone > 0 ? (
          <Button
            variant="tint"
            icon={Share2}
            onClick={() =>
              setShareCard(
                shareCardData({
                  session,
                  items,
                  sets,
                  exercises: exMap,
                  records: sessionRecords,
                  unit,
                }),
              )
            }
          >
            Compartilhar treino
          </Button>
        ) : null}
        {canRepeat(session) ? (
          <Button variant="tint" icon={Repeat} onClick={() => void repeat(session)}>
            Repetir este treino
          </Button>
        ) : null}
        <Button variant="ghost" icon={Trash2} onClick={() => setSheet('delete')}>
          Apagar treino
        </Button>
      </div>

      {editing && sets.find((x) => x.id === editing) ? (
        <SetEditSheet
          set={sets.find((x) => x.id === editing) as SetRow}
          ex={exMap.get((sets.find((x) => x.id === editing) as SetRow).exercise_id)}
          unit={unit}
          finished
          onClose={() => setEditing(null)}
        />
      ) : null}
      {shareCard ? (
        <ShareCardSheet
          card={shareCard}
          fileName={`anilha-treino-${session.local_date}.png`}
          onClose={() => setShareCard(null)}
        />
      ) : null}
      <SessionActionsSheet
        session={session}
        open={sheet !== null}
        confirmOnly={sheet === 'delete'}
        showOpen={false}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

function ItemSummary({
  item,
  sets,
  exName,
  originalName,
  pastel,
  ex,
  unit,
  next,
  editable,
  onEditSet,
  onAddSet,
}: {
  item: SessionItemRow;
  sets: SetRow[];
  exName: string;
  originalName: string | null;
  pastel: Pastel;
  ex: ExerciseRow | undefined;
  unit: Unit;
  next: Suggestion | null;
  /** Finished workout: tap a set to fix it, or add one that was forgotten. */
  editable: boolean;
  onEditSet: (s: SetRow) => void;
  onAddSet: () => void;
}) {
  const done = sets.filter((s) => s.completed_at != null).sort((a, b) => a.position - b.position);
  let w = 0;
  let a = 0;
  const statusChip =
    item.status === 'skipped' ? (
      <Chip>Pulado</Chip>
    ) : item.status === 'not_done' ? (
      <Chip>Não feito</Chip>
    ) : item.added ? (
      <Chip>Adicionado</Chip>
    ) : null;
  return (
    <Widget
      icon={Dumbbell}
      pastel={pastel}
      title={exName}
      sub={`Planejado ${item.planned_sets}x ${item.target_min}${item.target_max !== item.target_min ? `-${item.target_max}` : ''}${ex?.measure === 'time' ? ' s' : ''}`}
      action={statusChip}
    >
      <div className="stack-sm">
        {originalName ? (
          <p
            className="row-wrap t-regular"
            style={{ margin: 0, gap: 6 }}
            data-testid="substitution"
          >
            <span className="t-muted">{originalName}</span>
            <Icon icon={ArrowRight} size={16} />
            <span>{exName}</span>
            {item.substitution_reason ? (
              <span className="t-muted">({item.substitution_reason.toLowerCase()})</span>
            ) : null}
          </p>
        ) : null}
        {item.status === 'skipped' ? (
          <p className="row t-regular" style={{ margin: 0, gap: 6 }} data-testid="skip-reason">
            <Icon icon={SkipForward} size={16} />
            Pulado{item.skip_reason ? `: ${item.skip_reason}` : ', sem motivo'}.
          </p>
        ) : null}
        {item.pain_joint ? (
          <p className="t-regular" style={{ margin: 0 }}>
            Dor marcada no {JOINT_LABEL[item.pain_joint]}.
          </p>
        ) : null}
        {item.note ? (
          <p className="t-regular t-muted" style={{ margin: 0 }}>
            Nota: {item.note}
          </p>
        ) : null}
        {done.length ? (
          <ul
            className="stack-sm t-regular"
            style={{ listStyle: 'none', margin: 0, padding: 0, gap: 4 }}
          >
            {done.map((s) => {
              const label = s.kind === 'warmup' ? `Aquec. ${++a}` : `Série ${++w}`;
              const content = (
                <>
                  <span className="t-caption" style={{ width: 64 }}>
                    {label}
                  </span>
                  <span className="t-num" style={{ flex: 1 }}>
                    {setText(s, ex, unit)}
                  </span>
                  <span className="t-caption">
                    {s.kind === 'work' ? (effortLabel(s.rir) ?? 'sem esforço') : ''}
                  </span>
                  {editable ? <Icon icon={Pencil} size={16} className="t-muted" /> : null}
                </>
              );
              return (
                <li key={s.id}>
                  {editable ? (
                    <button
                      type="button"
                      className="done-set-row"
                      aria-label={`Corrigir ${label.toLowerCase()} de ${exName}: ${setText(s, ex, unit)}`}
                      onClick={() => onEditSet(s)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="row" style={{ gap: 12 }}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {editable && item.status !== 'skipped' ? (
          <button type="button" className="hb-btn-link" onClick={onAddSet}>
            <Icon icon={Plus} size={18} />
            Adicionar série
          </button>
        ) : null}
        {next ? (
          <div className="hb-advice hb-advice-brand" data-testid="next-time">
            <Icon
              icon={
                next.kind === 'increase' || next.kind === 'progress_variation'
                  ? TrendingUp
                  : next.kind === 'decrease'
                    ? TrendingDown
                    : next.kind === 'first_time' || next.kind === 'retrain'
                      ? Info
                      : Equal
              }
            />
            <div className="stack-sm" style={{ gap: 2 }}>
              <strong className="t-strong">Próxima vez: {next.goal}</strong>
              <span className="t-muted">{next.reason}</span>
              {next.confidence === 'low' ? (
                <span className="t-muted">Confiança menor: faltou o esforço.</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Widget>
  );
}
