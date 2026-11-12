import { Dumbbell, HeartPulse, Plus, Repeat } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../../app/account';
import { useRoutineItems, useRoutines } from '../../data/hooks';
import { itemsFromLastSession, startSession } from '../../data/ops';
import { plannedFromRoutine } from '../../data/today';
import { formatDDMM } from '../../engine/dates';
import { isPlanRoutine } from '../../engine/routines';
import { SPLITS } from '../../engine/taxonomy';
import type { SessionRow } from '../../engine/types';
import { Sheet, useToast } from '../../ui/overlays';
import { Disc } from '../../ui/primitives';

/** Start from a routine, by repeating the last session of a type, or blank. */
export function StartSheet({
  open,
  onClose,
  today,
  onCardio,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  /** Cardio instead of lifting: opens the cardio log. */
  onCardio?: () => void;
}) {
  const { db } = useAccount();
  const routines = useRoutines();
  const routineItems = useRoutineItems();
  const navigate = useNavigate();
  const toast = useToast();
  const lastByType =
    useLiveQuery(async () => {
      const done = (
        await db.sessions
          .filter((s) => !s.deleted && s.status === 'done' && s.detail === 'full' && !!s.split_key)
          .toArray()
      ).sort((a, b) => b.started_at - a.started_at);
      const seen = new Map<string, SessionRow>();
      for (const s of done) if (s.split_key && !seen.has(s.split_key)) seen.set(s.split_key, s);
      return [...seen.values()].slice(0, 4);
    }, [db]) ?? [];

  async function go(run: () => Promise<string>) {
    const id = await run();
    onClose();
    navigate(`/treino/${id}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Iniciar treino">
      <div className="stack">
        {[
          { title: 'Do plano', list: routines.filter(isPlanRoutine) },
          { title: 'Seus treinos', list: routines.filter((r) => !isPlanRoutine(r)) },
        ].map((group) =>
          group.list.length ? (
            <div className="stack-sm" key={group.title}>
              <span className="t-label t-muted">{group.title}</span>
              <div className="hb-widget">
                <div className="hb-list">
                  {group.list.map((r) => {
                    const items = plannedFromRoutine(r, routineItems);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="hb-list-row"
                        onClick={() =>
                          void go(() =>
                            startSession({
                              title: r.name,
                              split_key: r.split_key,
                              routine_id: r.id,
                              source: 'routine',
                              items,
                              today,
                            }),
                          )
                        }
                      >
                        <Disc small icon={Dumbbell} pastel={SPLITS[r.split_key].pastel} />
                        <span className="hb-list-main">
                          <span className="hb-list-title" style={{ display: 'block' }}>
                            {r.name}
                          </span>
                          <span className="hb-list-sub">{items.length} exercícios</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null,
        )}
        {lastByType.length ? (
          <div className="stack-sm">
            <span className="t-label t-muted">Repetir a última</span>
            <div className="hb-widget">
              <div className="hb-list">
                {lastByType.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="hb-list-row"
                    onClick={() =>
                      void go(async () => {
                        const items = await itemsFromLastSession(
                          s.split_key as NonNullable<SessionRow['split_key']>,
                        );
                        if (!items?.length) {
                          toast.show('Nada para repetir', { error: true });
                          throw new Error('vazio');
                        }
                        return startSession({
                          title: s.title,
                          split_key: s.split_key,
                          routine_id: s.routine_id,
                          source: 'repeat',
                          items,
                          today,
                        });
                      }).catch(() => undefined)
                    }
                  >
                    <Disc
                      small
                      icon={Repeat}
                      pastel={s.split_key ? SPLITS[s.split_key].pastel : 'neutral'}
                    />
                    <span className="hb-list-main">
                      <span className="hb-list-title" style={{ display: 'block' }}>
                        {s.title}
                      </span>
                      <span className="hb-list-sub">Como em {formatDDMM(s.local_date)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <div className="hb-widget">
          <div className="hb-list">
            <button
              type="button"
              className="hb-list-row"
              onClick={() =>
                void go(() =>
                  startSession({
                    title: 'Treino livre',
                    split_key: 'livre',
                    routine_id: null,
                    source: 'blank',
                    items: [],
                    today,
                  }),
                )
              }
            >
              <Disc small icon={Plus} pastel="neutral" />
              <span className="hb-list-main">
                <span className="hb-list-title" style={{ display: 'block' }}>
                  Treino em branco
                </span>
                <span className="hb-list-sub">Adicione exercícios enquanto treina</span>
              </span>
            </button>
            {onCardio ? (
              <button type="button" className="hb-list-row" onClick={onCardio}>
                <Disc small icon={HeartPulse} pastel="mint" />
                <span className="hb-list-main">
                  <span className="hb-list-title" style={{ display: 'block' }}>
                    Cardio
                  </span>
                  <span className="hb-list-sub">Corrida, bike, elíptico, natação e outros</span>
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
