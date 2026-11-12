import { Check, Minimize2, Pencil, Plus, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmtClock, fmtNum } from '../../engine/format';
import { EFFORT_OPTIONS } from '../../engine/taxonomy';
import type { ExerciseRow, SessionRow, SetRow, Unit } from '../../engine/types';
import { Icon } from '../../ui/primitives';
import { setStartValues, setValuesToSave, type SetDraft } from './setValues';

/** Ticks while mounted, and right away when the phone comes back from the lock screen. */
function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);
  return now;
}

/**
 * Focus mode, in the style of a running app: the clock and one big button. While resting,
 * the countdown and Pular descanso; otherwise the set to do in large type and Série feita,
 * which records what is shown. Ajustar goes back to the full screen to change the values.
 * The rest timer of the full screen keeps running underneath (chime and notification).
 */
export function FocusMode({
  session,
  set,
  draft,
  ex,
  itemSets,
  unit,
  doneWork,
  effortSet,
  onEffort,
  onComplete,
  onRest,
  onAdjust,
  onFinish,
  onExit,
}: {
  session: SessionRow;
  set: SetRow | undefined;
  /** What the editor holds for this set, typed but not saved: shown and saved as is. */
  draft?: SetDraft;
  ex: ExerciseRow | undefined;
  itemSets: SetRow[];
  unit: Unit;
  doneWork: number;
  /** A work set just done: one tap for how it went. */
  effortSet: SetRow | undefined;
  onEffort: (rir: number) => void;
  onComplete: (values: ReturnType<typeof setValuesToSave>) => void;
  onRest: (change: number | 'skip') => void;
  onAdjust: () => void;
  onFinish: () => void;
  onExit: () => void;
}) {
  const now = useNow(250);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onExit]);

  const restStart = session.rest_started_at;
  const restLeft =
    restStart == null ? 0 : restStart + (session.rest_duration_sec ?? 90) * 1000 - now;
  const resting = restStart != null && restLeft > 0;
  const time = ex?.measure === 'time';
  const start = set
    ? (draft ?? { ...setStartValues(set, itemSets, ex, unit), kind: set.kind })
    : null;
  const kindSets = set && start ? itemSets.filter((s) => s.kind === start.kind) : [];
  const pos = set ? kindSets.findIndex((s) => s.id === set.id) + 1 : 0;
  // "20 kg × 10", or "6 repetições" when there is no load to show.
  const what = start?.value
    ? start.showLoad && start.load
      ? `${fmtNum(start.load)} ${unit} × ${start.value}${time ? ' s' : ''}`
      : `${start.value} ${time ? 's' : start.value === 1 ? 'repetição' : 'repetições'}`
    : null;
  const setLine = set
    ? `${start?.kind === 'warmup' ? 'Aquecimento' : 'Série'} ${Math.max(pos, 1)} de ${Math.max(kindSets.length, 1)}`
    : '';

  return (
    <div className="focus-mode" role="region" aria-label="Modo foco">
      <header className="focus-top">
        <div className="focus-top-text">
          <strong>{session.title}</strong>
          <span className="focus-clock" role="timer" aria-label="Tempo de treino">
            {fmtClock((now - session.started_at) / 1000)}
          </span>
        </div>
        <button
          type="button"
          className="focus-icon"
          aria-label="Sair do modo foco"
          onClick={onExit}
        >
          <Icon icon={Minimize2} />
        </button>
      </header>

      <main className="focus-main">
        {resting ? (
          <>
            <span className="focus-label">Descanso</span>
            <span className="focus-big" role="timer" aria-label="Descanso restante">
              {fmtClock(restLeft / 1000)}
            </span>
            {set && ex ? (
              <span className="focus-sub">
                Próxima: {ex.name}
                {what ? `, ${what}` : ''}
              </span>
            ) : null}
          </>
        ) : set && ex ? (
          <>
            <span className="focus-label">{ex.name}</span>
            <span className="focus-big is-set" aria-label={`A fazer: ${what ?? 'anotar a série'}`}>
              {what ?? 'Anotar'}
            </span>
            <span className="focus-sub">
              {setLine} · {doneWork} {doneWork === 1 ? 'série feita' : 'séries feitas'}
            </span>
          </>
        ) : (
          <>
            <span className="focus-label">Tudo feito</span>
            <span className="focus-big">{doneWork}</span>
            <span className="focus-sub">{doneWork === 1 ? 'série feita' : 'séries feitas'}</span>
          </>
        )}

        {effortSet && effortSet.kind === 'work' ? (
          <div className="focus-effort" role="group" aria-label="Esforço da série">
            <span className="focus-sub">Como foi a última série?</span>
            <div className="hb-seg">
              {EFFORT_OPTIONS.map((o) => (
                <button
                  key={o.rir}
                  type="button"
                  aria-pressed={effortSet.rir === o.rir}
                  onClick={() => onEffort(o.rir)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="focus-bottom">
        <div className="focus-side">
          {resting ? (
            <button type="button" className="focus-small" onClick={() => onRest(15)}>
              <Icon icon={Plus} />
              <span>15 s</span>
            </button>
          ) : null}
        </div>
        {resting ? (
          <button type="button" className="focus-go" onClick={() => onRest('skip')}>
            <Icon icon={SkipForward} size={36} />
            <span>Pular descanso</span>
          </button>
        ) : set && start ? (
          <button
            type="button"
            className="focus-go"
            onClick={() =>
              start.value ? onComplete(setValuesToSave(start, ex, unit)) : onAdjust()
            }
          >
            <Icon icon={start.value ? Check : Pencil} size={36} />
            <span>{start.value ? 'Série feita' : 'Anotar série'}</span>
          </button>
        ) : (
          <button type="button" className="focus-go" onClick={onFinish}>
            <Icon icon={Check} size={36} />
            <span>Encerrar treino</span>
          </button>
        )}
        <div className="focus-side">
          {set ? (
            <button type="button" className="focus-small" onClick={onAdjust}>
              <Icon icon={Pencil} />
              <span>Ajustar</span>
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
