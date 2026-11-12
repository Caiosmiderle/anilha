import { WEEKDAY_SHORT } from '../engine/dates';
import { EXERCISES_BY_ID } from '../engine/exercises';
import type { GeneratedItem } from '../engine/generator';
import type { ContextFicha } from './context';
import type { Proposal } from './execute';

type PreviewItem = ContextFicha['items'][number] &
  Partial<Pick<GeneratedItem, 'warmup_sets' | 'reason'>>;

function FichaDetails({
  name,
  items,
  origin,
  reason,
}: {
  name: string;
  items: PreviewItem[];
  origin: string;
  reason?: string;
}) {
  return (
    <details className="agent-proposal-details">
      <summary>Ver detalhes de {name}</summary>
      <p className="agent-card-text">Origem da proposta: {origin}.</p>
      {reason ? <p className="agent-card-text">{reason}</p> : null}
      <ol className="agent-exercises">
        {items.map((item, i) => {
          const exercise = EXERCISES_BY_ID.get(item.exercise_id);
          return (
            <li key={i}>
              <strong>{exercise?.name ?? item.exercise_id}</strong>{' '}
              <span className="t-muted">
                {item.sets} séries de {item.target_min}-{item.target_max}{' '}
                {exercise?.measure === 'time' ? 's' : 'repetições'}
                {' · Descanso: '}
                {item.rest_sec} s{' · Aquecimento: '}
                {item.warmup_sets ?? 0} séries
              </span>
              {item.reason ? <p className="agent-card-text">{item.reason}</p> : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/** Read directly from the proposal that Salvar applies, without preparing any writes. */
export function ProposalDetails({ proposal: p }: { proposal: Proposal }) {
  if (p.kind === 'plano') {
    return (
      <>
        {p.plan.routines.map((routine) => (
          <FichaDetails
            key={routine.split_key}
            name={routine.name}
            items={routine.items}
            reason={routine.reason}
            origin="gerador de planos do Anilha"
          />
        ))}
        <details className="agent-proposal-details">
          <summary>Ver semana e aplicação do plano</summary>
          <p className="agent-card-text">
            As fichas do plano anterior serão arquivadas. As fichas pessoais, prontas e recebidas
            continuam disponíveis.
          </p>
          <ul className="agent-exercises">
            {p.plan.days.map((day) => (
              <li key={day.weekday}>
                {WEEKDAY_SHORT[day.weekday]}:{' '}
                {day.kind === 'gym'
                  ? p.plan.rules.rotation
                    ? 'Academia, próxima ficha do rodízio'
                    : (p.plan.routines.find((r) => r.split_key === day.split_key)?.name ??
                      'Academia')
                  : day.kind === 'run'
                    ? `Corrida${day.run_type ? ` (${day.run_type === 'longo' ? 'longa' : day.run_type === 'intervalado' ? 'intervalada' : 'leve'})` : ''}`
                    : 'Descanso'}
                {day.kind !== 'rest' ? `, ${day.time}` : ''}
              </li>
            ))}
          </ul>
          {p.plan.rules.rotation?.length ? (
            <p className="agent-card-text">
              Ordem das fichas:{' '}
              {p.plan.rules.rotation
                .map((split) => p.plan.routines.find((r) => r.split_key === split)?.name ?? split)
                .join(', ')}
              .
            </p>
          ) : null}
          {p.plan.reasons.map((reason, i) => (
            <p key={i} className="agent-card-text">
              {reason}
            </p>
          ))}
        </details>
      </>
    );
  }
  if (p.kind === 'nova') {
    return (
      <FichaDetails
        name={p.ficha.name}
        items={p.ficha.items}
        origin="montada com o assistente do Anilha"
        reason={
          p.replaces
            ? `A ficha ${p.replaces.name} será arquivada. A nova ficha mantém sua participação no plano.`
            : 'Ficha pessoal adicional, fora da programação semanal do plano.'
        }
      />
    );
  }
  return null;
}
