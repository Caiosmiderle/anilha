import {
  Archive,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  FileSpreadsheet,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../../app/account';
import { useExerciseMap, useRoutineItems, useToday } from '../../data/hooks';
import { newId, save, saveMany } from '../../data/store';
import { routineOrigin } from '../../engine/routines';
import { fichaLetter, SPLITS } from '../../engine/taxonomy';
import { fichasFileName, fichasFor, fichasXlsx } from '../../lib/fichasSheet';
import { savedMessage, saveFile } from '../../lib/files';
import type { PlanRow, RoutineRow } from '../../engine/types';
import { Sheet, useToast } from '../../ui/overlays';
import { Button, Disc, Icon, IconButton, Widget } from '../../ui/primitives';

/**
 * Treinos: the plan's fichas apart from the person's own. A new plan replaces only the
 * first group; created, ready-made and received ones stay. Archived ones come back with
 * one tap.
 */
export function Trainings({ plan }: { plan: PlanRow | null }) {
  const { db } = useAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const items = useRoutineItems();
  const exMap = useExerciseMap();
  const today = useToday();
  const [showArchived, setShowArchived] = useState(false);
  // Archived treinos to delete for good, after a confirmation.
  const [toDelete, setToDelete] = useState<RoutineRow[] | null>(null);
  const all =
    useLiveQuery(
      async () =>
        (await db.routines.filter((r) => !r.deleted).toArray()).sort(
          (a, b) => a.position - b.position,
        ),
      [db],
    ) ?? [];
  const rotation = plan?.rules.rotation?.length ? plan.rules.rotation : null;
  const active = all.filter((r) => !r.archived);
  const fromPlan = active.filter((r) => routineOrigin(r) === 'plano');
  const own = active.filter((r) => routineOrigin(r) !== 'plano');
  const archived = all.filter((r) => r.archived).sort((a, b) => b.updated_at - a.updated_at);
  const count = (r: RoutineRow) => items.filter((i) => i.routine_id === r.id).length;

  /** Every treino in use with exercises, the plan's first: one tab each. */
  async function exportSheet() {
    const fichas = fichasFor(active, items);
    const msg = savedMessage(
      await saveFile(fichasXlsx(fichas, exMap, today), fichasFileName(fichas, today)),
    );
    if (msg) toast.show(msg);
  }

  async function create() {
    const id = newId();
    await save('routines', {
      id,
      deleted: false,
      name: 'Novo treino',
      split_key: 'livre',
      position: active.length,
      reason: null,
      archived: false,
      origin: 'pessoa',
    });
    navigate(`/plano/rotina/${id}`);
  }

  async function restore(r: RoutineRow) {
    // An old plan's ficha comes back as the person's own, without the letter of the old
    // rotation: the plan in force has its own Ficha A, B, C.
    const old = routineOrigin(r) === 'plano';
    const name = old
      ? `${r.name.replace(/^Ficha [A-E]: /, '')} (plano anterior)`.slice(0, 80)
      : r.name;
    await save('routines', {
      ...r,
      name,
      archived: false,
      origin: old ? 'pessoa' : routineOrigin(r),
      position: active.length,
    });
    toast.show(`${name} voltou para Seus treinos`);
  }

  /** Gone for good, on every device. Workouts done with it stay in the history. */
  async function remove(list: RoutineRow[]) {
    const ids = new Set(list.map((r) => r.id));
    await saveMany([
      ...list.map((r) => ({ table: 'routines' as const, row: { ...r, deleted: true } })),
      ...items
        .filter((i) => ids.has(i.routine_id))
        .map((i) => ({ table: 'routine_items' as const, row: { ...i, deleted: true } })),
    ]);
    setToDelete(null);
    toast.show(
      list.length === 1 ? `${list[0]?.name} excluído` : `${list.length} treinos excluídos`,
    );
  }

  const row = (r: RoutineRow, sub: string) => {
    const letter = routineOrigin(r) === 'plano' ? fichaLetter(rotation, r.split_key) : null;
    return (
      <Link key={r.id} to={`/plano/rotina/${r.id}`} className="hb-list-row">
        {letter ? (
          <span
            className={`weekstrip-tile is-small p-${SPLITS[r.split_key].pastel}`}
            aria-hidden="true"
          >
            {letter}
          </span>
        ) : (
          <Disc small icon={Dumbbell} pastel={SPLITS[r.split_key].pastel} />
        )}
        <span className="hb-list-main">
          <span className="hb-list-title" style={{ display: 'block' }}>
            {r.name}
          </span>
          <span className="hb-list-sub">{sub}</span>
        </span>
      </Link>
    );
  };
  const exercises = (r: RoutineRow) => {
    const n = count(r);
    return `${n} ${n === 1 ? 'exercício' : 'exercícios'}`;
  };
  const ownSub = (r: RoutineRow) => {
    const origin = routineOrigin(r);
    return origin === 'pessoa' ? exercises(r) : `${exercises(r)} · ${r.reason ?? ''}`;
  };

  return (
    <div className="grid-2">
      <div className="stack">
        <Widget
          icon={Repeat}
          pastel="butter"
          title="Do seu plano"
          sub="Mudam quando você gera um plano novo"
        >
          {fromPlan.length ? (
            <div className="hb-list" style={{ margin: '-16px -20px' }}>
              {fromPlan.map((r) => row(r, exercises(r)))}
            </div>
          ) : (
            <p className="empty-line">O plano em vigor não tem fichas de academia.</p>
          )}
        </Widget>

        <Widget
          icon={Dumbbell}
          pastel="sky"
          title="Seus treinos"
          sub="Criados por você, prontos do Anilha ou recebidos. Ficam mesmo quando o plano muda."
        >
          {own.length ? (
            <div className="hb-list" style={{ margin: '-16px -20px' }}>
              {own.map((r) => row(r, ownSub(r)))}
            </div>
          ) : (
            <p className="empty-line">Nenhum ainda. Crie um ou pegue uma ficha pronta.</p>
          )}
        </Widget>
        <div className="actions">
          <Button variant="tint" icon={Plus} onClick={() => void create()}>
            Criar treino
          </Button>
          <Button
            variant="outline"
            icon={ClipboardList}
            onClick={() => navigate('/plano/fichas-prontas')}
          >
            Fichas prontas
          </Button>
          <Button variant="outline" icon={BookOpen} onClick={() => navigate('/exercicios')}>
            Ver exercícios
          </Button>
          {exMap.size > 0 && active.some((r) => count(r) > 0) ? (
            <Button variant="outline" icon={FileSpreadsheet} onClick={() => void exportSheet()}>
              Exportar planilha
            </Button>
          ) : null}
        </div>
      </div>

      <div className="stack">
        {archived.length ? (
          <section className="hb-widget">
            <button
              type="button"
              className="hb-list-row archived-toggle"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((v) => !v)}
            >
              <Disc small icon={Archive} pastel="neutral" />
              <span className="hb-list-main">
                <span className="hb-list-title" style={{ display: 'block' }}>
                  Arquivados
                </span>
                <span className="hb-list-sub">
                  {archived.length} {archived.length === 1 ? 'treino' : 'treinos'}: de planos
                  antigos e os que você arquivou
                </span>
              </span>
              <Icon
                icon={ChevronDown}
                className={`t-muted chevron${showArchived ? ' is-open' : ''}`}
              />
            </button>
            {showArchived ? (
              <div className="hb-list">
                {archived.map((r) => (
                  <div key={r.id} className="hb-list-row">
                    <span className="hb-list-main">
                      <span className="hb-list-title" style={{ display: 'block' }}>
                        {r.name}
                      </span>
                      <span className="hb-list-sub">
                        {exercises(r)}
                        {routineOrigin(r) === 'plano' ? ' · de um plano antigo' : ''}
                      </span>
                    </span>
                    <Button variant="outline" onClick={() => void restore(r)}>
                      Restaurar
                    </Button>
                    <IconButton
                      icon={Trash2}
                      label={`Excluir ${r.name}`}
                      onClick={() => setToDelete([r])}
                    />
                  </div>
                ))}
                {archived.length > 1 ? (
                  <div className="hb-list-row">
                    <button
                      type="button"
                      className="hb-btn-link"
                      onClick={() => setToDelete(archived)}
                    >
                      Excluir todos os arquivados
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <Sheet
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={
          toDelete?.length === 1
            ? `Excluir ${toDelete[0]?.name}?`
            : `Excluir ${toDelete?.length ?? 0} treinos arquivados?`
        }
        actions={
          <>
            <Button variant="danger" block onClick={() => toDelete && void remove(toDelete)}>
              Excluir de vez
            </Button>
            <Button variant="tint" block onClick={() => setToDelete(null)}>
              Voltar
            </Button>
          </>
        }
      >
        <p className="t-regular" style={{ margin: 0 }}>
          Some deste aparelho e dos outros, e não volta. Os treinos que você já fez com{' '}
          {toDelete?.length === 1 ? 'ele' : 'eles'} continuam no histórico.
        </p>
      </Sheet>
    </div>
  );
}
