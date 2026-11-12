import { ArrowDown, ArrowUp, Equal, Trophy } from 'lucide-react';
import { Widget } from '../ui/primitives';
import { fmtLoad, fmtNum } from '../engine/format';
import type { AnalysisSet } from './contract';
import type { ExerciseEvolution } from './evolution';

export function analysisSetText(s: Pick<AnalysisSet, 'load_kg' | 'reps' | 'seconds'>) {
  const value =
    s.seconds != null ? `${s.seconds} s` : s.reps != null ? `${s.reps} rep` : 'Sem repetições';
  return s.load_kg == null ? value : `${fmtLoad(s.load_kg, 'kg')} x ${value}`;
}
function series(s: AnalysisSet | undefined) {
  if (!s) return 'Sem série';
  return `${s.kind === 'warmup' ? 'Aquecimento · ' : ''}${analysisSetText(s)} · ${s.rir == null ? 'Esforço sem registro' : `RIR ${s.rir}`}`;
}
function Delta({ value, label }: { value: number | null; label: string }) {
  const Arrow = value == null || value === 0 ? Equal : value > 0 ? ArrowUp : ArrowDown;
  return (
    <p className="evolution-metric">
      <span>{label}</span>
      <span
        className="evolution-delta"
        data-direction={value == null || value === 0 ? 'equal' : value > 0 ? 'up' : 'down'}
        aria-label={
          value == null
            ? 'Sem comparação'
            : `${value > 0 ? 'Aumentou' : value < 0 ? 'Diminuiu' : 'Igual'} ${fmtNum(Math.abs(value))}`
        }
      >
        {value == null ? (
          'Sem comparação'
        ) : (
          <>
            <Arrow size={14} aria-hidden="true" />
            {value > 0 ? '+' : value < 0 ? '-' : ''}
            {fmtNum(Math.abs(value))}
          </>
        )}
      </span>
    </p>
  );
}
export function EvolutionCard({ rows }: { rows: ExerciseEvolution[] }) {
  return (
    <Widget
      title="Evolução"
      sub="Hoje e última vez em qualquer ficha. RIR indica repetições na reserva. Comparações e recordes usam séries de trabalho."
      className="evolution-widget"
    >
      <div className="stack" data-testid="evolution-card">
        {rows.map((row, n) => (
          <section className="stack-sm" key={n} aria-label={row.exercise}>
            <div className="evolution-heading">
              <h3 className="t-heading-sm">{row.exercise}</h3>
              {row.load_record ? (
                <span className="evolution-record">
                  <Trophy size={14} aria-hidden="true" />
                  Recorde pessoal de carga · {fmtLoad(row.max_load!, 'kg')}
                </span>
              ) : null}
              {row.reps_records.map((r, index) => (
                <span key={index} className="evolution-record">
                  <Trophy size={14} aria-hidden="true" />
                  Recorde pessoal de repetições ·{' '}
                  {analysisSetText({ load_kg: r.load_kg, reps: r.reps, seconds: null })}
                </span>
              ))}
            </div>
            <table style={{ width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th scope="col">Hoje</th>
                  <th scope="col">
                    {row.days_ago == null ? 'Primeira vez' : `Última vez há ${row.days_ago} dias`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: Math.max(1, row.today.length, row.previous.length) },
                  (_, index) => (
                    <tr key={index}>
                      <td
                        style={{
                          padding: '8px 4px',
                          verticalAlign: 'top',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {series(row.today[index])}
                      </td>
                      <td
                        style={{
                          padding: '8px 4px',
                          verticalAlign: 'top',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {series(row.previous[index])}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <Delta
              label={`Carga máx${row.max_load == null ? ' indisponível' : ` ${fmtLoad(row.max_load, 'kg')}`}`}
              value={row.max_load_delta}
            />
            {!row.same_load.length ? <Delta label="Mesma carga" value={null} /> : null}
            {row.same_load.map((r, index) => (
              <Delta
                key={index}
                label={`Melhor série com ${r.load_kg == null ? 'peso corporal' : fmtLoad(r.load_kg, 'kg')} (${row.today.some((s) => s.seconds != null) ? 's' : 'rep'})`}
                value={r.delta}
              />
            ))}
            <Delta
              label={
                row.volume == null ? 'Volume indisponível' : `Volume ${fmtNum(row.volume)} kg x rep`
              }
              value={row.volume_delta}
            />
          </section>
        ))}
      </div>
    </Widget>
  );
}
