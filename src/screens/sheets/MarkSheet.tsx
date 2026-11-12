import { useState } from 'react';
import { addDays } from '../../engine/dates';
import { fmtRaceTime, markError, parseRaceTime } from '../../engine/running';
import type { RunMark } from '../../engine/types';
import { Sheet } from '../../ui/overlays';
import { Button, Segmented, TextField } from '../../ui/primitives';

const DISTANCES = [3, 5, 10, 21.0975, 42.195];
const label = (km: number) => (km > 21 && km < 22 ? '21 km' : km > 42 ? '42 km' : `${km} km`);

/** A recent race or time trial: distance, time and day. It sets the paces of the runs. */
export function MarkSheet({
  mark,
  today,
  onSave,
  onClose,
}: {
  mark: RunMark | null;
  today: string;
  onSave: (mark: RunMark) => Promise<void>;
  onClose: () => void;
}) {
  const [km, setKm] = useState(mark?.distance_km ?? 5);
  const [time, setTime] = useState(mark ? fmtRaceTime(mark.seconds) : '');
  const [date, setDate] = useState(mark?.date ?? today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const seconds = parseRaceTime(time);
    const problem = markError(km, seconds);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave({ distance_km: km, seconds: seconds as number, date: date || today });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Tempo recente"
      actions={
        <Button variant="primary" block onClick={() => void save()} disabled={saving}>
          {saving ? 'Salvando' : 'Salvar tempo'}
        </Button>
      }
    >
      <div className="stack">
        <p className="t-caption" style={{ margin: 0 }}>
          Uma prova ou um teste correndo forte, dos últimos 4 meses. Dele saem os ritmos de cada
          tipo de corrida.
        </p>
        <div className="stack-sm">
          <span className="hb-label">Distância</span>
          <Segmented<number>
            label="Distância"
            value={km}
            options={DISTANCES.map((d) => ({ value: d, label: label(d) }))}
            onChange={setKm}
          />
        </div>
        <TextField
          label="Tempo"
          inputMode="numeric"
          placeholder="25:30"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            setError(null);
          }}
          error={error}
          hint="Minutos e segundos, ou horas, minutos e segundos: 1:52:30."
        />
        <TextField
          label="Quando"
          type="date"
          min={addDays(today, -120)}
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
