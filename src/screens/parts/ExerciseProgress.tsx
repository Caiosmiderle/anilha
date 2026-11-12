import { ChartLine } from 'lucide-react';
import { formatDDMM } from '../../engine/dates';
import { fmtLoad, kgToUnit } from '../../engine/format';
import type { buildExerciseLogs } from '../../engine/history';
import { estimate1RM, sessionBest } from '../../engine/records';
import { GROUP_PASTEL } from '../../engine/taxonomy';
import type { ExerciseRow, Unit } from '../../engine/types';
import { LineChart } from '../../ui/charts';
import { Select, Widget } from '../../ui/primitives';

export function ExerciseProgress({
  exercise,
  options,
  onChoose,
  unit,
  logs,
}: {
  exercise: ExerciseRow;
  options?: ExerciseRow[];
  onChoose?: (id: string) => void;
  unit: Unit;
  logs: ReturnType<typeof buildExerciseLogs>;
}) {
  const bests = logs.map((l) => sessionBest(l, exercise));
  const time = exercise.measure === 'time';
  const loaded = bests.some((b) => b.max_load != null);
  const main = bests
    .map((b) => ({
      day: b.local_date,
      value: time
        ? (b.max_seconds ?? 0)
        : loaded
          ? Math.round(kgToUnit(b.max_load ?? 0, unit) * 10) / 10
          : (b.max_reps ?? 0),
    }))
    .filter((p) => p.value > 0);
  const compare = loaded
    ? bests
        .filter((b) => b.best_e1rm != null)
        .map((b) => ({
          day: b.local_date,
          value: Math.round(kgToUnit(b.best_e1rm ?? 0, unit) * 10) / 10,
        }))
    : undefined;
  const best = bests.reduce<(typeof bests)[number] | null>(
    (acc, b) => (!acc || (b.max_load ?? 0) > (acc.max_load ?? 0) ? b : acc),
    null,
  );
  const lastLog = logs[logs.length - 1];
  const last1rm = lastLog
    ? Math.max(
        0,
        ...lastLog.sets
          .filter((s) => s.kind === 'work' && s.load_kg && s.reps)
          .map((s) => estimate1RM(s.load_kg as number, s.reps as number) ?? 0),
      )
    : 0;
  const unitLabel = time ? 's' : loaded ? unit : 'reps';
  return (
    <Widget
      icon={ChartLine}
      pastel={GROUP_PASTEL[exercise.primary_group]}
      title={exercise.name}
      sub={`${logs.length} ${logs.length === 1 ? 'sessão' : 'sessões'}`}
    >
      <div className="stack">
        {options && onChoose ? (
          <Select
            label="Exercício"
            hideLabel
            value={exercise.id}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
            onChange={onChoose}
          />
        ) : null}
        {main.length < 2 ? (
          <p className="t-regular t-muted" style={{ margin: 0 }}>
            {main.length
              ? 'Uma sessão até agora. O gráfico aparece a partir da segunda.'
              : 'Sem séries de trabalho registradas.'}
          </p>
        ) : null}
        {main.length >= 2 ? (
          <LineChart
            main={main}
            compare={compare && compare.length > 1 ? compare : undefined}
            mainLabel={time ? 'Melhor tempo' : loaded ? 'Carga máxima' : 'Repetições máximas'}
            compareLabel="1RM est."
            unit={unitLabel}
          />
        ) : null}
        <dl className="field-grid t-regular" style={{ margin: 0 }}>
          {loaded && best?.max_load ? (
            <div>
              <dt className="t-caption">Carga máxima</dt>
              <dd className="t-strong t-num" style={{ margin: 0 }}>
                {fmtLoad(best.max_load, unit)}
              </dd>
            </div>
          ) : null}
          {loaded && last1rm > 0 ? (
            <div>
              <dt className="t-caption">1RM estimado (última)</dt>
              <dd className="t-strong t-num" style={{ margin: 0 }}>
                {fmtLoad(last1rm, unit)}
              </dd>
            </div>
          ) : null}
          {loaded && bests.length ? (
            <div>
              <dt className="t-caption">Volume da última</dt>
              <dd className="t-strong t-num" style={{ margin: 0 }}>
                {fmtLoad(bests[bests.length - 1]?.volume ?? 0, unit)}
              </dd>
            </div>
          ) : null}
          {lastLog ? (
            <div>
              <dt className="t-caption">Última vez</dt>
              <dd className="t-strong t-num" style={{ margin: 0 }}>
                {formatDDMM(lastLog.local_date)}
              </dd>
            </div>
          ) : null}
        </dl>
        {loaded && main.length >= 2 ? (
          <p className="t-caption" style={{ margin: 0 }}>
            Linha azul: carga máxima. Tracejada: 1RM estimado (Epley, até 12 repetições).
          </p>
        ) : null}
      </div>
    </Widget>
  );
}
