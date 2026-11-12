import { Flag, Footprints } from 'lucide-react';
import { useState } from 'react';
import { useProfile, useRuns } from '../../data/hooks';
import { updateProfile } from '../../data/ops';
import { formatDDMM, onWeekday } from '../../engine/dates';
import { fmtNum } from '../../engine/format';
import {
  RACE_RULES,
  raceCountdown,
  raceLabel,
  raceSchedule,
  recentLongestRun,
  safeLongRun,
  type RaceWeekKind,
} from '../../engine/race';
import type { PlanDay, PlanRow, Race } from '../../engine/types';
import { useToast } from '../../ui/overlays';
import { Button, Icon, Widget } from '../../ui/primitives';
import { RaceSheet } from '../sheets/RaceSheet';
import { savePlan } from './PlanDaySheet';

const KIND_NOTE: Record<Exclude<RaceWeekKind, 'race'>, string> = {
  base: '',
  build: '',
  cutback: ', semana mais leve',
  peak: ', o maior do ciclo',
  taper: ', reta final',
};

/**
 * Target race on Plan: the countdown and the long run of each week until it. Shown when
 * the plan has runs or a race is set.
 */
export function RaceCard({ plan, today }: { plan: PlanRow; today: string }) {
  const profile = useProfile();
  const runs = useRuns();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const onboarding = profile?.onboarding ?? null;
  const race = onboarding?.race ?? null;
  if (!onboarding || (!race && plan.run_per_week === 0)) return null;

  const hasLong = plan.days.some((d) => d.kind === 'run' && d.run_type === 'longo');

  async function saveRace(picked: Race | null) {
    if (!onboarding) return;
    // The cycle starts in the week the race is set, from the longest run of the 30 days before.
    const next = picked ? { ...picked, from: today } : null;
    await updateProfile({ onboarding: { ...onboarding, race: next } });
    // A race needs a long run in the week: the last run of the week becomes one.
    let made: PlanDay | null = null;
    if (next && !hasLong) {
      const runDays = plan.days.filter((d) => d.kind === 'run');
      made = runDays[runDays.length - 1] ?? null;
      const day = made;
      if (day)
        await savePlan(
          plan,
          {
            days: plan.days.map((d) =>
              d.weekday === day.weekday ? { ...d, run_type: 'longo' as const } : d,
            ),
          },
          today,
        );
    }
    setEditing(false);
    toast.show(
      !next
        ? 'Prova tirada'
        : made
          ? `Prova salva. A corrida ${onWeekday(made.weekday)} virou longa`
          : 'Prova salva',
    );
  }

  const start = race ? recentLongestRun(runs ?? [], race.from ?? today) : null;
  const weeks = race ? raceSchedule(race, today, start) : [];
  const now = weeks[0];
  // The whole cycle, from the week the race was set: how far the long run gets.
  const cycleTop = race
    ? Math.max(
        0,
        ...raceSchedule(race, race.from ?? today, start)
          .filter((w) => w.kind !== 'race')
          .map((w) => w.long_km),
      )
    : 0;
  const peak = race ? RACE_RULES[race.distance_km].peak : 0;
  const recent = recentLongestRun(runs ?? [], today);
  const cap = safeLongRun(recent);
  const capped = !!now && now.kind !== 'race' && cap != null && now.long_km > cap;
  const top = Math.max(1, ...weeks.map((w) => w.long_km));

  return (
    <>
      <Widget
        icon={Flag}
        pastel="mint"
        title={race ? `Prova de ${raceLabel(race.distance_km)}` : 'Prova alvo'}
        sub={
          race
            ? raceCountdown(race, today)
            : 'Tem prova marcada? O longão de cada semana sobe até ela.'
        }
        foot={
          race ? (
            <>
              <Button variant="tint" onClick={() => setEditing(true)}>
                Mudar prova
              </Button>
              <Button variant="ghost" onClick={() => void saveRace(null)}>
                Tirar prova
              </Button>
            </>
          ) : (
            <Button variant="tint" icon={Flag} onClick={() => setEditing(true)}>
              Definir prova
            </Button>
          )
        }
      >
        {race && now ? (
          <div className="stack-sm" data-testid="race-card">
            <div
              className="race-bars"
              role="img"
              aria-label={`Longão por semana até a prova: ${weeks.map((w) => fmtNum(w.long_km)).join(', ')} km`}
            >
              {weeks.map((w, i) => (
                <span
                  key={w.week}
                  className={`race-bar${i === 0 ? ' is-now' : ''}`}
                  data-kind={w.kind}
                  style={{ height: `${Math.max(8, (w.long_km / top) * 100)}%` }}
                  title={`${formatDDMM(w.week)}: ${fmtNum(w.long_km)} km`}
                />
              ))}
            </div>
            <div className="row t-caption" aria-hidden="true">
              <span>Esta semana</span>
              <span className="spacer" />
              <span>Prova</span>
            </div>
            <p className="t-regular" style={{ margin: 0 }}>
              {now.kind === 'race'
                ? 'Semana da prova: corridas leves e curtas.'
                : capped
                  ? `Longão desta semana: ${fmtNum(cap ?? 0)} km. O ciclo pede ${fmtNum(now.long_km)}, mas seu maior longão dos últimos 30 dias foi de ${fmtNum(recent ?? 0)} km, e passar de 10 % a mais aumenta o risco de lesão.`
                  : `Longão desta semana: ${fmtNum(now.long_km)} km${KIND_NOTE[now.kind]}.`}
            </p>
            {cycleTop > 0 && cycleTop < peak ? (
              <p className="t-caption" style={{ margin: 0 }}>
                Até a prova, o longão chega a {fmtNum(cycleTop)} km. Os {fmtNum(peak)} km do ciclo
                completo pediriam subir mais de 10 % por semana, o que aumenta o risco de lesão.
              </p>
            ) : null}
            {plan.run_per_week === 0 ? (
              <div className="hb-advice" role="note">
                <Icon icon={Footprints} />
                <span>
                  Sem corrida no plano. Refaça o plano com dias de corrida para treinar a prova.
                </span>
              </div>
            ) : null}
            {!hasLong && plan.run_per_week > 0 ? (
              <div className="hb-advice" role="note">
                <Icon icon={Footprints} />
                <span>
                  Nenhuma corrida longa no plano. Toque num dia de corrida na semana acima e escolha
                  Longa.
                </span>
              </div>
            ) : null}
          </div>
        ) : race ? (
          <p className="t-regular" style={{ margin: 0 }}>
            Como foi? Defina a próxima prova ou tire esta.
          </p>
        ) : null}
      </Widget>
      {editing ? (
        <RaceSheet
          race={race}
          today={today}
          onSave={(r) => saveRace(r)}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
