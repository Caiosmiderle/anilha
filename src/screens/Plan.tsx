import { CalendarCheck, Dumbbell, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentPlan, useRoutineItems, useRoutines, useToday } from '../data/hooks';
import { formatDDMM, WEEKDAY_NAMES } from '../engine/dates';
import { legsBeforeRunDays } from '../engine/planEdit';
import { isPlanRoutine } from '../engine/routines';
import { fichaLetter, SPLITS } from '../engine/taxonomy';
import { Button, Empty, Icon, LoadingCard, Segmented, Switch, Widget } from '../ui/primitives';
import { PlanDaySheet, savePlan } from './parts/PlanDaySheet';
import { PacesCard } from './parts/PacesCard';
import { RaceCard } from './parts/RaceCard';
import { Trainings } from './parts/Trainings';
import { WeekPlan } from './parts/WeekPlan';

type Tab = 'semana' | 'treinos';

/**
 * Plano: two tabs. Semana, the week with the real ficha of each day, the race and the
 * rules; Treinos, the plan's fichas apart from the person's own, and the archived ones.
 */
export default function Plan() {
  const today = useToday();
  const { plan, loaded } = useCurrentPlan(today);
  const routines = useRoutines();
  const items = useRoutineItems();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'treinos' ? 'treinos' : 'semana';
  const [editDay, setEditDay] = useState<number | null>(null);
  if (!loaded) return <LoadingCard lines={6} />;

  const violations = plan ? legsBeforeRunDays(plan.days) : [];
  const rotation = plan?.rules.rotation?.length ? plan.rules.rotation : null;
  // The plan's fichas (in rotation order when there is one), to open each one from the week.
  const fichas = rotation
    ? rotation
        .map((split) => routines.find((r) => r.split_key === split && isPlanRoutine(r)))
        .filter((r) => !!r)
    : routines.filter(isPlanRoutine);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Plano</h1>
          <p className="page-sub">
            {plan
              ? `Em vigor desde ${formatDDMM(plan.active_from)}`
              : 'Você ainda não tem um plano.'}
          </p>
        </div>
      </header>

      <Segmented<Tab>
        label="Parte do plano"
        value={tab}
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'treinos', label: 'Treinos' },
        ]}
        onChange={(v) => setParams(v === 'treinos' ? { aba: 'treinos' } : {}, { replace: true })}
      />

      {tab === 'treinos' ? (
        <Trainings plan={plan} />
      ) : plan ? (
        <div className="grid-2">
          <div className="stack">
            <WeekPlan plan={plan} today={today} onEdit={setEditDay} />
            {fichas.length ? (
              <Widget
                icon={Repeat}
                pastel="butter"
                title={rotation ? 'Rodízio de fichas' : 'Fichas do plano'}
                sub={rotation ? 'As letras da semana acima' : undefined}
              >
                <div className="stack-sm">
                  <div className="hb-list" style={{ margin: '-16px -20px 0' }}>
                    {fichas.map((r) => {
                      const n = items.filter((i) => i.routine_id === r.id).length;
                      return (
                        <Link key={r.id} to={`/plano/rotina/${r.id}`} className="hb-list-row">
                          <span
                            className={`weekstrip-tile is-small p-${SPLITS[r.split_key].pastel}`}
                            aria-hidden="true"
                          >
                            {fichaLetter(rotation, r.split_key) ?? (
                              <Icon icon={Dumbbell} size={16} />
                            )}
                          </span>
                          <span className="hb-list-main">
                            <span className="hb-list-title" style={{ display: 'block' }}>
                              {r.name}
                            </span>
                            <span className="hb-list-sub">
                              {n} {n === 1 ? 'exercício' : 'exercícios'}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  {rotation ? (
                    <p className="t-caption" style={{ margin: 0 }}>
                      Cada dia de academia é a próxima ficha. Faltou um dia, o rodízio espera.
                    </p>
                  ) : null}
                </div>
              </Widget>
            ) : null}
            <RaceCard plan={plan} today={today} />
            <PacesCard plan={plan} today={today} />
            {violations.length && plan.rules.no_legs_before_run ? (
              <div className="hb-advice" role="note">
                <Icon icon={TriangleAlert} />
                <span>
                  Perna na {violations.map((d) => WEEKDAY_NAMES[d.weekday]).join(' e ')}, véspera de
                  corrida. Sua regra diz que não.
                </span>
              </div>
            ) : null}
          </div>
          <div className="stack">
            <Widget title="Regras">
              <Switch
                label="Perna nunca na véspera de corrida"
                hint={
                  rotation
                    ? 'Se a ficha da vez for perna e amanhã tiver corrida, vai a seguinte.'
                    : 'Corrida antes de perna pode.'
                }
                checked={plan.rules.no_legs_before_run}
                onChange={(v) =>
                  void savePlan(plan, { rules: { ...plan.rules, no_legs_before_run: v } }, today)
                }
              />
            </Widget>
            {plan.reasons.length ? (
              <details className="hb-widget plan-why">
                <summary className="hb-list-row">
                  <span className="hb-list-main">
                    <span className="hb-list-title" style={{ display: 'block' }}>
                      Por que este plano
                    </span>
                    <span className="hb-list-sub">
                      {plan.reasons.length} motivos, da divisão ao volume
                    </span>
                  </span>
                </summary>
                <ul className="stack-sm t-regular plan-why-list">
                  {plan.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <Button
              variant="primary"
              icon={RefreshCw}
              onClick={() => navigate('/voce/treino?acao=novo-plano')}
            >
              Gerar plano novo
            </Button>
            <Button variant="outline" onClick={() => navigate('/voce/treino')}>
              Editar perfil de treino
            </Button>
            <p className="t-caption" style={{ margin: 0 }}>
              Os dois caminhos usam o mesmo formulário. Você pode salvar só o perfil ou confirmar um
              plano novo. Seus treinos próprios ficam.
            </p>
          </div>
        </div>
      ) : (
        <Empty icon={CalendarCheck}>
          Sem plano ainda.{' '}
          <Link to="/comecar" className="hb-btn-link">
            Montar meu plano
          </Link>
        </Empty>
      )}

      {editDay != null && plan ? (
        <PlanDaySheet
          plan={plan}
          weekday={editDay}
          today={today}
          onClose={() => setEditDay(null)}
        />
      ) : null}
    </>
  );
}
