import { Gauge } from 'lucide-react';
import { useState } from 'react';
import { useProfile, useRuns } from '../../data/hooks';
import { updateProfile } from '../../data/ops';
import { formatDDMM } from '../../engine/dates';
import { fmtNum } from '../../engine/format';
import { raceKm } from '../../engine/race';
import { fmtPace, fmtRaceTime, paceZones, predictSeconds, runFitness } from '../../engine/running';
import type { PlanRow, RunMark } from '../../engine/types';
import { useToast } from '../../ui/overlays';
import { Button, Widget } from '../../ui/primitives';
import { MarkSheet } from '../sheets/MarkSheet';

/**
 * The paces of each kind of run, from a recent mark or a hard run of the history. Without
 * either, the runs go by effort and the card says how to get paces.
 */
export function PacesCard({ plan, today }: { plan: PlanRow; today: string }) {
  const profile = useProfile();
  const runs = useRuns();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const onboarding = profile?.onboarding ?? null;
  if (!onboarding || plan.run_per_week === 0) return null;

  const mark = onboarding.run_mark ?? null;
  const fitness = runFitness(mark, runs ?? [], today);
  const zones = fitness ? paceZones(fitness.vdot) : null;
  const race = onboarding.race && onboarding.race.date >= today ? onboarding.race : null;

  async function saveMark(next: RunMark) {
    if (!onboarding) return;
    await updateProfile({ onboarding: { ...onboarding, run_mark: next } });
    setEditing(false);
    toast.show('Tempo salvo. Os ritmos foram atualizados');
  }

  return (
    <>
      <Widget
        icon={Gauge}
        pastel="sky"
        title="Seus ritmos"
        sub={
          fitness
            ? `${fitness.source === 'marca' ? 'Pelo tempo' : 'Pela corrida forte'} de ${fmtNum(fitness.km)} km em ${fmtRaceTime(fitness.seconds)} (${formatDDMM(fitness.date)})`
            : 'Sem tempo recente: as corridas vão pelo esforço'
        }
        foot={
          <Button variant="tint" onClick={() => setEditing(true)}>
            {mark ? 'Mudar tempo recente' : 'Informar tempo recente'}
          </Button>
        }
      >
        {zones && fitness ? (
          <dl className="paces" data-testid="paces">
            <dt>Leve</dt>
            <dd>
              {fmtPace(zones.easy[0]).replace('/km', '')} a {fmtPace(zones.easy[1])}
            </dd>
            <dt>Limiar</dt>
            <dd>{fmtPace(zones.threshold)}</dd>
            <dt>Intervalado</dt>
            <dd>{fmtPace(zones.interval)}</dd>
            {race ? (
              <>
                <dt>Previsão na prova de {race.distance_km} km</dt>
                <dd>
                  {fmtRaceTime(predictSeconds(fitness.vdot, raceKm(race.distance_km)))} (
                  {fmtPace(
                    predictSeconds(fitness.vdot, raceKm(race.distance_km)) /
                      raceKm(race.distance_km),
                  )}
                  )
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="t-regular" style={{ margin: 0 }}>
            Informe o tempo de uma prova ou de um teste correndo forte, ou registre uma corrida com
            esforço 8 ou mais: daí saem os ritmos do leve, do limiar e do intervalado.
          </p>
        )}
      </Widget>
      {editing ? (
        <MarkSheet
          mark={mark}
          today={today}
          onSave={(m) => saveMark(m)}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
