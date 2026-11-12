import { ArrowDown, ArrowUp, Equal } from 'lucide-react';
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
  return `${s.kind === 'warmup' ? 'Aquecimento. ' : ''}${analysisSetText(s)}. ${s.rir == null ? 'Esforço sem registro' : `RIR ${s.rir}`}`;
}
function Delta({ value, label }: { value: number | null; label: string }) {
  const Arrow = value == null || value === 0 ? Equal : value > 0 ? ArrowUp : ArrowDown;
  return (
    <p>
      {label}{' '}
      {value == null ? (
        'Sem comparação'
      ) : (
        <>
          <Arrow size={16} aria-hidden="true" />{' '}
          <span>
            {value > 0 ? 'Aumentou' : value < 0 ? 'Diminuiu' : 'Igual'} {fmtNum(Math.abs(value))}
          </span>
        </>
      )}
    </p>
  );
}
export function EvolutionCard({ rows }: { rows: ExerciseEvolution[] }) {
  return (
    <Widget
      title="Evolução"
      sub="Séries de hoje e última vez em qualquer ficha. RIR é a reserva de repetições. Comparações e recordes usam séries de trabalho."
    >
      <div className="stack" data-testid="evolution-card">
        {rows.map((row, n) => (
          <section className="stack-sm" key={n} aria-label={row.exercise}>
            <h3 className="t-heading-sm">{row.exercise}</h3>
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
            <Delta label="Carga máxima, kg." value={row.max_load_delta} />
            {!row.same_load.length ? (
              <Delta label="Repetições ou segundos na mesma carga." value={null} />
            ) : null}
            {row.same_load.map((r, index) => (
              <Delta
                key={index}
                label={`Melhor série, ${row.today.some((s) => s.seconds != null) ? 'segundos' : 'repetições'} com ${r.load_kg == null ? 'peso corporal' : fmtLoad(r.load_kg, 'kg')}.`}
                value={r.delta}
              />
            ))}
            <Delta label="Volume de trabalho, kg x rep." value={row.volume_delta} />
            {row.volume != null ? (
              <p>Hoje {fmtNum(row.volume)} kg x rep.</p>
            ) : (
              <p>Volume indisponível para estas séries.</p>
            )}
            {row.load_record ? (
              <p className="hb-advice hb-advice-brand">
                Recorde pessoal de carga. {fmtLoad(row.max_load!, 'kg')}
              </p>
            ) : null}
            {row.reps_records.map((r, index) => (
              <p key={index} className="hb-advice hb-advice-brand">
                Recorde pessoal de repetições.{' '}
                {analysisSetText({ load_kg: r.load_kg, reps: r.reps, seconds: null })}
              </p>
            ))}
          </section>
        ))}
      </div>
    </Widget>
  );
}
