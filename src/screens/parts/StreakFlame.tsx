import { Flame } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOverrides, usePlans, useRuns, useSessions } from '../../data/hooks';
import { dayStreak, STREAK_MIN_DAYS } from '../../engine/adherence';
import { Sheet } from '../../ui/overlays';
import { Button, Icon } from '../../ui/primitives';

/**
 * The flame next to the greeting: days in a row following the plan, from 5 on. Gray while
 * today's workout is still missing. A tap explains how it counts. No notification, no
 * punishment: a rest day of the plan counts and a rest marked on a training day pauses.
 */
export function StreakFlame({ today }: { today: string }) {
  const plans = usePlans();
  const sessions = useSessions();
  const runs = useRuns();
  const overrides = useOverrides();
  const [open, setOpen] = useState(false);
  const streak = useMemo(() => {
    if (!plans || !sessions || !runs) return null;
    const activeDates = [
      ...sessions.filter((s) => s.status === 'done').map((s) => s.local_date),
      ...runs.map((r) => r.local_date),
    ];
    return dayStreak({ today, plans, activeDates, overrides });
  }, [plans, sessions, runs, overrides, today]);
  if (!streak || streak.days < STREAK_MIN_DAYS) return null;

  const pending = streak.todayPending;
  return (
    <>
      <button
        type="button"
        className="streak-pill"
        data-pending={pending}
        aria-label={`${streak.days} dias seguidos no plano${pending ? ', falta o treino de hoje' : ''}`}
        onClick={() => setOpen(true)}
      >
        <Icon icon={Flame} size={18} />
        <span aria-hidden="true">{streak.days}</span>
      </button>
      {open ? (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title={`${streak.days} dias seguidos no plano`}
          actions={
            <Button variant="tint" block onClick={() => setOpen(false)}>
              Fechar
            </Button>
          }
        >
          <div className="stack-sm t-regular">
            <p style={{ margin: 0 }}>
              Conta os dias em que você seguiu o plano: treinou no dia de treino ou descansou no dia
              de descanso. Treinar num dia de descanso também conta.
            </p>
            <p style={{ margin: 0 }}>
              Precisa descansar num dia de treino? Em Hoje, toque em Hoje é descanso: a sequência
              pausa e não zera.
            </p>
            <p style={{ margin: 0 }}>Um treino do plano que passa sem registro zera a conta.</p>
            {pending ? (
              <p style={{ margin: 0 }} className="t-muted">
                O treino de hoje ainda falta: o dia entra na conta quando você registrar.
              </p>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
