import { ClipboardList, CloudOff } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../app/account';
import { EXERCISES_BY_ID } from '../engine/exercises';
import { GROUP_LABEL } from '../engine/taxonomy';
import {
  addLibraryRoutine,
  libraryRoutineId,
  useLibrary,
  type LibraryRoutine,
} from '../sync/library';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Chip, Empty, ErrorText, LoadingCard, Widget } from '../ui/primitives';
import { RoutineItems } from './parts/RoutineItems';

/** The muscle groups a ficha works, in the order they first appear. */
function groupsOf(r: LibraryRoutine): string {
  const groups: string[] = [];
  for (const it of r.items) {
    const g =
      EXERCISES_BY_ID.get(it.exercise_id)?.primary_group ??
      r.exercises.find((e) => e.id === it.exercise_id)?.primary_group;
    const label = g ? GROUP_LABEL[g] : null;
    if (label && !groups.includes(label)) groups.push(label);
  }
  return groups.join(', ').toLowerCase();
}

/**
 * Ready-made fichas from the Anilha team. Adding one puts it in Plano, Treinos, as a
 * routine of yours to change at will; the plan and its rotation stay as they are.
 */
export default function ReadyRoutines() {
  const library = useLibrary();
  const { db } = useAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const mine = useLiveQuery(
    async () =>
      new Set(
        (await db.routines.filter((r) => !r.deleted && !r.archived).toArray()).map((r) => r.id),
      ),
    [db],
  );
  const [open, setOpen] = useState<LibraryRoutine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = library.data ?? [];
  const has = (r: LibraryRoutine) => mine?.has(libraryRoutineId(r.id)) ?? false;

  async function add(r: LibraryRoutine) {
    setBusy(true);
    setError(null);
    try {
      const id = await addLibraryRoutine(r);
      toast.show('Ficha adicionada aos seus treinos');
      setOpen(null);
      navigate(`/plano/rotina/${id}`);
    } catch {
      setError('Não deu para adicionar agora');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Fichas prontas</h1>
          <p className="page-sub">Montadas pelo Anilha. Adicione e ajuste do seu jeito.</p>
        </div>
      </header>
      {library.offline && !library.data ? (
        <Empty icon={CloudOff}>Sem conexão. As fichas aparecem quando voltar.</Empty>
      ) : !library.data ? (
        <LoadingCard lines={4} />
      ) : list.length === 0 ? (
        <Empty icon={ClipboardList}>Nenhuma ficha pronta por enquanto.</Empty>
      ) : (
        <div className="grid-2 ready-list">
          {list.map((r) => (
            <Widget
              key={r.id}
              icon={ClipboardList}
              pastel="sky"
              title={r.name}
              sub={`${r.items.length} exercícios · ${groupsOf(r)}`}
            >
              <div className="stack-sm" data-testid="ready-routine">
                {r.description ? (
                  <p className="t-regular" style={{ margin: 0 }}>
                    {r.description}
                  </p>
                ) : null}
                <div className="row health-choice">
                  <Button variant="tint" onClick={() => setOpen(r)}>
                    Ver exercícios
                  </Button>
                  {has(r) ? <Chip pastel="mint">Nas suas fichas</Chip> : null}
                </div>
              </div>
            </Widget>
          ))}
        </div>
      )}
      <p className="t-caption" style={{ margin: 0 }}>
        Fichas prontas não substituem a orientação de um profissional. Pare se sentir dor.
      </p>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.name ?? 'Ficha'}
        actions={
          open ? (
            has(open) ? (
              <Button
                variant="tint"
                block
                onClick={() => {
                  const id = libraryRoutineId(open.id);
                  setOpen(null);
                  navigate(`/plano/rotina/${id}`);
                }}
              >
                Abrir a ficha
              </Button>
            ) : (
              <Button variant="primary" block disabled={busy} onClick={() => void add(open)}>
                Adicionar às minhas fichas
              </Button>
            )
          ) : undefined
        }
      >
        {open ? (
          <div className="stack">
            {open.description ? (
              <p className="t-regular" style={{ margin: 0 }}>
                {open.description}
              </p>
            ) : null}
            <RoutineItems items={open.items} exercises={open.exercises} />
            <p className="t-caption" style={{ margin: 0 }}>
              Vira um treino seu, em Plano, Treinos. Seu plano e o rodízio não mudam.
            </p>
            {error ? <ErrorText>{error}</ErrorText> : null}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
