import {
  Archive,
  ArrowDownWideNarrow,
  Copy,
  Dumbbell,
  FileSpreadsheet,
  GripVertical,
  Plus,
  Replace,
  Send,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useIsAdmin } from '../sync/admin';
import { ReviewCard } from '../review/ReviewCard';
import { useNavigate, useParams } from 'react-router-dom';
import { useAccount } from '../app/account';
import { useLiveQuery } from 'dexie-react-hooks';
import { useExerciseMap, useProfile, useRoutineItems, useToday } from '../data/hooks';
import { newId, patch, save, saveMany, type Change } from '../data/store';
import { exerciseFocus, orderByGroup } from '../engine/focus';
import { brokenPairs, keepPairsTogether } from '../engine/superset';
import { restFor, targetFor } from '../engine/generator';
import { routineOrigin } from '../engine/routines';
import { fichasFileName, fichasXlsx } from '../lib/fichasSheet';
import { savedMessage, saveFile } from '../lib/files';
import { GROUP_PASTEL, SPLITS } from '../engine/taxonomy';
import type { ExerciseRow, RoutineItemRow, SplitKey } from '../engine/types';
import { Sheet, useToast } from '../ui/overlays';
import { useSortable } from '../ui/sortable';
import {
  Button,
  Disc,
  Empty,
  Icon,
  LoadingCard,
  Select,
  Stepper,
  Switch,
  TextField,
} from '../ui/primitives';
import { ExercisePicker } from './sheets/ExercisePicker';
import { SendRoutineSheet } from './sheets/SendRoutineSheet';
import { SubstituteList } from './parts/SubstituteList';

export default function RoutineEdit() {
  const { id } = useParams();
  const admin = useIsAdmin();
  const { db } = useAccount();
  const routine = useLiveQuery(
    async () => (id ? ((await db.routines.get(id)) ?? null) : null),
    [db, id],
  );
  const items = useRoutineItems(id);
  const exMap = useExerciseMap();
  const profile = useProfile();
  const today = useToday();
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<RoutineItemRow | null>(null);
  const [name, setName] = useState<string | null>(null);
  const sortable = useSortable(items.length, (from, to) => void move(from, to));

  // Names come from the exercise list: wait for it instead of showing ids for a moment.
  if (routine === undefined || (items.length > 0 && exMap.size === 0))
    return <LoadingCard lines={5} />;
  if (routine === null || routine.deleted)
    return <Empty icon={Dumbbell}>Treino não encontrado.</Empty>;

  /**
   * Another exercise in the same place of the ficha: sets, warm-up, position and bi-set stay;
   * reps and rest follow the new exercise, as in a generated plan.
   */
  async function swapExercise(item: RoutineItemRow, e: ExerciseRow) {
    const t = targetFor(e, {
      level: profile?.onboarding?.level ?? 'intermediario',
      returning: profile?.onboarding?.returning ?? false,
      goal: profile?.onboarding?.goal ?? 'hipertrofia',
    });
    await save('routine_items', {
      ...item,
      exercise_id: e.id,
      target_min: t.min,
      target_max: t.max,
      rest_sec: restFor(e, profile?.onboarding?.goal),
    });
    const old = exMap.get(item.exercise_id)?.name ?? 'Exercício';
    toast.show(`${old} virou ${e.name.toLowerCase()} na ficha`);
  }

  const fromPlan = routineOrigin(routine) === 'plano';

  /** A plan's ficha as the person's own: it stays when a new plan comes. */
  async function duplicate() {
    if (!routine) return;
    const id = newId();
    await saveMany([
      {
        table: 'routines',
        row: {
          id,
          deleted: false,
          name: `${routine.name.replace(/^Ficha [A-E]: /, '')} (meu)`.slice(0, 80),
          split_key: routine.split_key,
          position: routine.position + 100,
          reason: null,
          archived: false,
          origin: 'pessoa',
        },
      },
      ...items.map((it) => ({
        table: 'routine_items' as const,
        row: { ...it, id: newId(), routine_id: id },
      })),
    ]);
    toast.show('Cópia salva em Seus treinos');
    navigate(`/plano/rotina/${id}`, { replace: true });
  }

  /** One muscle at a time, the multi-joint lift first: same order as a generated plan. */
  async function sortByGroup() {
    const ordered = keepPairsTogether(orderByGroup(items, (it) => exMap.get(it.exercise_id)));
    await saveMany(
      ordered.map((row, position) => ({
        table: 'routine_items' as const,
        row: { ...row, position },
      })),
    );
    toast.show('Exercícios em ordem de grupo');
  }

  /** Dragged (or moved with the arrow keys) from one place of the list to another. */
  async function move(from: number, to: number) {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    // A bi-set only makes sense side by side: moving one away undoes it.
    const broken = brokenPairs(next);
    await saveMany(
      next
        .map((x, position) => ({ x, position }))
        .filter(
          ({ x, position }) =>
            x.position !== position || (x.superset != null && broken.has(x.superset)),
        )
        .map(({ x, position }) => ({
          table: 'routine_items' as const,
          row: {
            ...x,
            position,
            superset: x.superset && broken.has(x.superset) ? null : x.superset,
          },
        })),
    );
    if (broken.size) toast.show('Bi-set desfeito: os dois não estão mais juntos');
  }

  return (
    <>
      <header className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{routine.name}</h1>
          <p className="page-sub">
            {items.length} exercícios. Mudanças valem para os próximos treinos. O primeiro exercício
            com carga sempre começa com aquecimento.
          </p>
        </div>
      </header>
      {admin && !routine.archived && <ReviewCard key={routine.id} routineID={routine.id} />}

      <div className="hb-widget">
        <div className="hb-widget-body stack">
          <TextField
            label="Nome do treino"
            value={name ?? routine.name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name != null && name.trim() && name !== routine.name)
                void patch('routines', routine.id, { name: name.trim() });
            }}
          />
          <Select<SplitKey>
            label="Tipo de treino"
            value={routine.split_key}
            options={(Object.keys(SPLITS) as SplitKey[]).map((k) => ({
              value: k,
              label: SPLITS[k].label,
            }))}
            onChange={(split_key) => void patch('routines', routine.id, { split_key })}
          />
        </div>
      </div>

      {items.length ? (
        <div className="hb-widget">
          <div className="hb-list" ref={sortable.listRef}>
            {items.map((it, i) => {
              const ex = exMap.get(it.exercise_id);
              const time = ex?.measure === 'time';
              return (
                <div
                  key={it.id}
                  data-sortable
                  className={`hb-list-row routine-row sortable-row${sortable.rowClass(i)}`}
                  style={sortable.rowStyle(i)}
                >
                  {/* The whole row opens the editor; the handle at the side moves it. */}
                  <button
                    type="button"
                    className="routine-row-main"
                    aria-label={`Editar ${ex?.name ?? ''}`}
                    onClick={() => setEditing(it)}
                  >
                    <Disc
                      small
                      icon={Dumbbell}
                      pastel={ex ? GROUP_PASTEL[ex.primary_group] : 'neutral'}
                    />
                    <span className="hb-list-main">
                      <span className="hb-list-title" style={{ display: 'block' }}>
                        {ex?.name ?? it.exercise_id}
                      </span>
                      <span className="hb-list-sub" style={{ display: 'block' }}>
                        {ex ? <span className="ex-focus">{exerciseFocus(ex)}</span> : null}
                        {it.superset ? <span className="ss-chip">Bi-set</span> : null}
                        {it.sets}x {it.target_min}-{it.target_max}
                        {time ? ' s' : ''} · {it.rest_sec} s
                        {it.warmup_sets ? ` · ${it.warmup_sets} aquec.` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sort-handle"
                    aria-label={`Mover ${ex?.name ?? 'exercício'}: arraste, ou use as setas para cima e para baixo`}
                    {...sortable.handle(i)}
                  >
                    <Icon icon={GripVertical} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Empty icon={Dumbbell}>Treino sem exercícios.</Empty>
      )}

      {fromPlan ? (
        <div className="hb-advice" role="note">
          <Icon icon={Copy} />
          <span>
            Esta ficha é do seu plano: muda quando você gera um plano novo. Para guardar do seu
            jeito,{' '}
            <button type="button" className="hb-btn-link" onClick={() => void duplicate()}>
              duplicar como meu treino
            </button>
            .
          </span>
        </div>
      ) : null}
      <div className="actions">
        <Button variant="tint" icon={Plus} onClick={() => setAdding(true)}>
          Adicionar exercício
        </Button>
        {items.length > 1 ? (
          <Button variant="outline" icon={ArrowDownWideNarrow} onClick={() => void sortByGroup()}>
            Ordenar por grupo
          </Button>
        ) : null}
        {items.length ? (
          <Button variant="outline" icon={Send} onClick={() => setSending(true)}>
            Enviar para um amigo
          </Button>
        ) : null}
        {items.length ? (
          <Button
            variant="outline"
            icon={FileSpreadsheet}
            onClick={async () => {
              // Built inside the tap: the iPhone opens the share menu only from a tap.
              const fichas = [{ routine, items }];
              const msg = savedMessage(
                await saveFile(fichasXlsx(fichas, exMap, today), fichasFileName(fichas, today)),
              );
              if (msg) toast.show(msg);
            }}
          >
            Exportar planilha
          </Button>
        ) : null}
        <Button
          variant="ghost"
          icon={Archive}
          onClick={async () => {
            await patch('routines', routine.id, { archived: true });
            toast.show('Treino arquivado: dá para restaurar em Plano, Treinos');
            navigate('/plano?aba=treinos', { replace: true });
          }}
        >
          Arquivar treino
        </Button>
      </div>

      <SendRoutineSheet
        open={sending}
        onClose={() => setSending(false)}
        routine={routine}
        items={items}
      />

      {adding ? (
        <Sheet open onClose={() => setAdding(false)} title="Adicionar exercício">
          <ExercisePicker
            excludeIds={items.map((i) => i.exercise_id)}
            onPick={async (e) => {
              const t = targetFor(e, {
                level: profile?.onboarding?.level ?? 'intermediario',
                returning: profile?.onboarding?.returning ?? false,
                goal: profile?.onboarding?.goal ?? 'hipertrofia',
              });
              await save('routine_items', {
                id: newId(),
                deleted: false,
                routine_id: routine.id,
                position: items.reduce((m, x) => Math.max(m, x.position), -1) + 1,
                exercise_id: e.id,
                sets: 3,
                target_min: t.min,
                target_max: t.max,
                rest_sec: restFor(e, profile?.onboarding?.goal),
                warmup_sets: 0,
                note: null,
                reason: null,
              });
              setAdding(false);
              toast.show(`${e.name} adicionado`);
            }}
          />
        </Sheet>
      ) : null}

      {editing ? (
        <ItemSheet
          item={editing}
          items={items}
          exMap={exMap}
          name={exMap.get(editing.exercise_id)?.name ?? ''}
          time={exMap.get(editing.exercise_id)?.measure === 'time'}
          onClose={() => setEditing(null)}
          onSwap={async (e) => {
            await swapExercise(editing, e);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function ItemSheet({
  item,
  items,
  exMap,
  name,
  time,
  onClose,
  onSwap,
}: {
  item: RoutineItemRow;
  items: RoutineItemRow[];
  exMap: Map<string, ExerciseRow>;
  name: string;
  time: boolean;
  onClose: () => void;
  onSwap: (e: ExerciseRow) => Promise<void>;
}) {
  const [v, setV] = useState(item);
  const [swapping, setSwapping] = useState(false);
  // Bi-set with the exercise right below.
  const index = items.findIndex((x) => x.id === item.id);
  const below = items[index + 1];
  const belowEx = below ? exMap.get(below.exercise_id) : undefined;
  const ex = exMap.get(item.exercise_id);
  const [paired, setPaired] = useState(
    !!item.superset && !!below && below.superset === item.superset,
  );
  const sameMuscle = !!ex && !!belowEx && ex.primary_group === belowEx.primary_group;

  async function saveAll() {
    const min = Math.min(v.target_min, v.target_max);
    const max = Math.max(v.target_min, v.target_max);
    const changes: Change[] = [];
    const key = item.superset ?? item.id;
    if (paired && below) {
      changes.push({
        table: 'routine_items',
        row: { ...v, target_min: min, target_max: max, superset: key },
      });
      if (below.superset !== key)
        changes.push({ table: 'routine_items', row: { ...below, superset: key } });
    } else {
      changes.push({
        table: 'routine_items',
        row: { ...v, target_min: min, target_max: max, superset: paired ? key : null },
      });
      // Unpaired: the partner goes back to a normal exercise.
      if (item.superset)
        for (const other of items)
          if (other.id !== item.id && other.superset === item.superset)
            changes.push({ table: 'routine_items', row: { ...other, superset: null } });
    }
    await saveMany(changes);
  }
  const set = <K extends keyof RoutineItemRow>(k: K, val: RoutineItemRow[K]) =>
    setV((x) => ({ ...x, [k]: val }));
  if (swapping && ex)
    return (
      <Sheet open onClose={onClose} title={`Trocar ${name.toLowerCase()}`}>
        <SubstituteList
          exercise={ex}
          excludeIds={items.map((i) => i.exercise_id)}
          emptyText="Nenhum parecido fora do que já está na ficha."
          onPick={(e) => void onSwap(e)}
        />
      </Sheet>
    );
  return (
    <Sheet
      open
      onClose={onClose}
      title={name}
      actions={
        <>
          <Button
            variant="primary"
            block
            onClick={async () => {
              await saveAll();
              onClose();
            }}
          >
            Salvar exercício
          </Button>
          <Button
            variant="ghost"
            icon={Trash2}
            onClick={async () => {
              await saveMany([
                { table: 'routine_items', row: { ...item, deleted: true } },
                // The partner goes back to a normal exercise.
                ...items
                  .filter((o) => o.id !== item.id && item.superset && o.superset === item.superset)
                  .map((o) => ({ table: 'routine_items' as const, row: { ...o, superset: null } })),
              ]);
              onClose();
            }}
          >
            Tirar do treino
          </Button>
        </>
      }
    >
      {ex ? (
        <div className="stack-sm" style={{ marginBottom: 'var(--space-4)' }}>
          <Button variant="outline" icon={Replace} onClick={() => setSwapping(true)}>
            Trocar exercício
          </Button>
          <span className="t-caption">
            Parecidos do mesmo grupo, com o porquê de cada um. Vale para os próximos treinos.
          </span>
        </div>
      ) : null}
      <div className="field-grid">
        <Stepper
          label="Séries"
          value={v.sets}
          min={1}
          max={10}
          onChange={(n) => set('sets', n ?? 1)}
        />
        <Stepper
          label="Aquecimento"
          value={v.warmup_sets}
          min={0}
          max={3}
          onChange={(n) => set('warmup_sets', n ?? 0)}
        />
        <Stepper
          label={time ? 'Mínimo (s)' : 'Mínimo de reps'}
          value={v.target_min}
          min={1}
          max={time ? 600 : 50}
          step={time ? 5 : 1}
          onChange={(n) => set('target_min', n ?? 1)}
        />
        <Stepper
          label={time ? 'Máximo (s)' : 'Máximo de reps'}
          value={v.target_max}
          min={1}
          max={time ? 600 : 50}
          step={time ? 5 : 1}
          onChange={(n) => set('target_max', n ?? 1)}
        />
        <Stepper
          label="Descanso (s)"
          value={v.rest_sec}
          min={0}
          max={300}
          step={15}
          onChange={(n) => set('rest_sec', n ?? 60)}
        />
      </div>
      {below && belowEx ? (
        <div className="stack-sm" style={{ marginTop: 'var(--space-4)' }}>
          <Switch
            label={`Bi-set com ${belowEx.name.toLowerCase()}`}
            hint="Alterna as séries dos dois, sem descanso no meio; descansa depois do par."
            checked={paired}
            onChange={setPaired}
          />
          {paired && sameMuscle ? (
            <div className="hb-advice" role="note">
              <span>
                Os dois trabalham o mesmo grupo: em bi-set rende menos. Pares opostos, como peito e
                costas ou bíceps e tríceps, funcionam melhor.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
