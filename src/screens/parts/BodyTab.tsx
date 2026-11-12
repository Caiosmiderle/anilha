import { ChevronRight, Plus, Ruler, Weight } from 'lucide-react';
import { useState } from 'react';
import { useBodyLogs, useProfile, useToday } from '../../data/hooks';
import { deleteBodyLog, saveBodyLog } from '../../data/ops';
import { bodyTrend } from '../../engine/body';
import { useHealthOn } from '../../sync/consent';
import { formatDDMM, isValidDay } from '../../engine/dates';
import { fmtLoad, fmtNum, kgToUnit, roundLoad, unitToKg } from '../../engine/format';
import type { BodyLogRow, Unit } from '../../engine/types';
import { LineChart } from '../../ui/charts';
import { Sheet, useToast } from '../../ui/overlays';
import {
  Button,
  Disc,
  Empty,
  ErrorText,
  Icon,
  LoadingCard,
  Stepper,
  TextField,
  Widget,
} from '../../ui/primitives';
import { HealthOffCard } from './HealthConsent';

/** Body weight and waist: the weekly average, the pace per week and what it means. */
export function BodyTab() {
  const logs = useBodyLogs();
  const profile = useProfile();
  const today = useToday();
  const [editing, setEditing] = useState<BodyLogRow | 'new' | null>(null);
  // The newest first; older ones a tap away, so every record can still be corrected.
  const [shown, setShown] = useState(12);
  const health = useHealthOn();
  const unit: Unit = profile?.unit ?? 'kg';
  // Weight and waist are health data: only with consent (LGPD art. 11).
  if (!health) return <HealthOffCard />;
  if (!logs) return <LoadingCard lines={3} />;
  const t = bodyTrend(logs, profile?.onboarding?.goal, today);
  const weightPoints = t.weeks
    .filter((w) => w.weight_kg != null)
    .slice(-12)
    .map((w) => ({ day: w.week, value: roundLoad(kgToUnit(w.weight_kg as number, unit)) }));
  const thisWeek = t.weeks[t.weeks.length - 1];

  return (
    <div className="stack">
      <Button variant="tint" icon={Plus} onClick={() => setEditing('new')}>
        Registrar peso e medidas
      </Button>
      {logs.length === 0 ? (
        <Empty icon={Weight}>
          Pese de manhã, no mesmo horário, uma ou duas vezes por semana. A média da semana vale mais
          que um dia.
        </Empty>
      ) : (
        <div className="grid-2">
          <div className="stack">
            {t.latest?.weight_kg != null ? (
              <Widget
                icon={Weight}
                pastel="neutral"
                title="Peso"
                sub={`Último em ${formatDDMM(t.latest.local_date)}`}
              >
                <div className="stack">
                  <dl className="field-grid t-regular" style={{ margin: 0 }}>
                    <div>
                      <dt className="t-caption">Último</dt>
                      <dd className="t-strong t-num body-big" style={{ margin: 0 }}>
                        {fmtLoad(t.latest.weight_kg, unit)}
                      </dd>
                    </div>
                    {t.rate_pct_week != null ? (
                      <div>
                        <dt className="t-caption">Ritmo por semana</dt>
                        <dd className="t-strong t-num body-big" style={{ margin: 0 }}>
                          {t.rate_pct_week > 0 ? '+' : ''}
                          {fmtNum(t.rate_pct_week)}%
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {thisWeek?.weight_kg != null ? (
                    <p className="t-caption" style={{ margin: 0 }}>
                      Média da semana: {fmtLoad(thisWeek.weight_kg, unit)}
                    </p>
                  ) : null}
                  {t.advice ? (
                    <div className="hb-advice" role="note" data-testid="body-advice">
                      <span>{t.advice}</span>
                    </div>
                  ) : null}
                  {weightPoints.length >= 2 ? (
                    <LineChart main={weightPoints} mainLabel="Média da semana" unit={unit} />
                  ) : null}
                </div>
              </Widget>
            ) : null}
            {t.latest && logs.some((l) => l.waist_cm != null) ? (
              <Widget icon={Ruler} pastel="neutral" title="Cintura">
                <dl className="field-grid t-regular" style={{ margin: 0 }}>
                  <div>
                    <dt className="t-caption">Última</dt>
                    <dd className="t-strong t-num body-big" style={{ margin: 0 }}>
                      {fmtNum(Number(logs.find((l) => l.waist_cm != null)?.waist_cm))} cm
                    </dd>
                  </div>
                  {t.waist_change_cm != null ? (
                    <div>
                      <dt className="t-caption">Nas últimas semanas</dt>
                      <dd className="t-strong t-num body-big" style={{ margin: 0 }}>
                        {t.waist_change_cm > 0 ? '+' : ''}
                        {fmtNum(t.waist_change_cm)} cm
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </Widget>
            ) : null}
          </div>
          <Widget title="Registros" sub="Toque para corrigir">
            <div className="hb-list" style={{ margin: '-16px -20px' }}>
              {logs.slice(0, shown).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="hb-list-row"
                  onClick={() => setEditing(l)}
                >
                  <Disc small icon={Weight} pastel="neutral" />
                  <span className="hb-list-main">
                    <span className="hb-list-title" style={{ display: 'block' }}>
                      {[
                        l.weight_kg != null ? fmtLoad(Number(l.weight_kg), unit) : null,
                        l.waist_cm != null ? `cintura ${fmtNum(Number(l.waist_cm))} cm` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="hb-list-sub">{formatDDMM(l.local_date)}</span>
                  </span>
                  <Icon icon={ChevronRight} className="t-muted" />
                </button>
              ))}
              {logs.length > shown ? (
                <button
                  type="button"
                  className="hb-list-row"
                  onClick={() => setShown((n) => n + 12)}
                >
                  <span className="hb-list-main">
                    <span className="hb-list-title">
                      Mostrar mais {Math.min(12, logs.length - shown)} de {logs.length - shown}{' '}
                      anteriores
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          </Widget>
        </div>
      )}
      {editing ? (
        <BodySheet
          log={editing === 'new' ? null : editing}
          last={logs[0] ?? null}
          unit={unit}
          today={today}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function BodySheet({
  log,
  last,
  unit,
  today,
  onClose,
}: {
  log: BodyLogRow | null;
  last: BodyLogRow | null;
  unit: Unit;
  today: string;
  onClose: () => void;
}) {
  const toast = useToast();
  // A new entry starts from the last one: on the scale it is usually a few hundred grams off.
  const base = log ?? last;
  const [day, setDay] = useState(log?.local_date ?? today);
  const [weight, setWeight] = useState<number | null>(
    base?.weight_kg != null ? roundLoad(kgToUnit(Number(base.weight_kg), unit)) : null,
  );
  const [waist, setWaist] = useState<number | null>(
    log?.waist_cm != null ? Number(log.waist_cm) : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!isValidDay(day) || day > today) return setError('Data inválida');
    if (weight == null && waist == null) return setError('Preencha o peso ou a cintura');
    const kg = weight != null ? Math.round(unitToKg(weight, unit) * 100) / 100 : null;
    if (kg != null && (kg < 20 || kg > 400)) return setError('Peso fora do normal');
    if (waist != null && (waist < 30 || waist > 250)) return setError('Cintura fora do normal');
    await saveBodyLog({ id: log?.id, local_date: day, weight_kg: kg, waist_cm: waist });
    toast.show('Registrado');
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={log ? 'Corrigir registro' : 'Peso e medidas'}
      actions={
        <>
          <Button variant="primary" block onClick={() => void submit()}>
            Salvar
          </Button>
          {log ? (
            <Button
              variant="ghost"
              block
              onClick={async () => {
                await deleteBodyLog(log.id);
                toast.show('Registro apagado');
                onClose();
              }}
            >
              Apagar registro
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <div className="field-grid">
          <Stepper
            label={`Peso (${unit})`}
            value={weight}
            onChange={setWeight}
            step={unit === 'kg' ? 0.1 : 0.2}
            decimals={1}
            max={unit === 'kg' ? 400 : 880}
          />
          <Stepper
            label="Cintura (cm)"
            value={waist}
            onChange={setWaist}
            step={0.5}
            decimals={1}
            max={250}
          />
        </div>
        <p className="t-caption" style={{ margin: 0 }}>
          Cintura na altura do umbigo, sem apertar. Pode deixar em branco.
        </p>
        <TextField
          label="Data"
          type="date"
          max={today}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}
