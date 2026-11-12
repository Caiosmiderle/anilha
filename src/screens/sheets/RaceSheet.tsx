import { useState } from 'react';
import { addDays } from '../../engine/dates';
import { capitalizeFirst } from '../../engine/format';
import { RACE_DISTANCES, raceDateError, raceName } from '../../engine/race';
import type { Race, RaceDistance } from '../../engine/types';
import { Sheet } from '../../ui/overlays';
import { Button, Segmented, TextField } from '../../ui/primitives';

/** Distance and date of the target race. */
export function RaceSheet({
  race,
  today,
  onSave,
  onClose,
}: {
  race: Race | null;
  today: string;
  onSave: (race: Race) => Promise<void>;
  onClose: () => void;
}) {
  const [distance, setDistance] = useState<RaceDistance>(race?.distance_km ?? 10);
  const [date, setDate] = useState(race?.date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = raceDateError(date, today);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave({ distance_km: distance, date });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={race ? 'Mudar prova' : 'Prova alvo'}
      actions={
        <Button variant="primary" block onClick={() => void save()} disabled={saving}>
          {saving ? 'Salvando' : 'Salvar prova'}
        </Button>
      }
    >
      <div className="stack">
        <p className="t-caption" style={{ margin: 0 }}>
          O longão de cada semana sobe até a prova, com uma semana mais leve a cada 4 e a reta final
          menor, para chegar descansado.
        </p>
        <div className="stack-sm">
          <span className="hb-label">Distância</span>
          <Segmented<RaceDistance>
            label="Distância"
            value={distance}
            options={RACE_DISTANCES.map((d) => ({ value: d, label: `${d} km` }))}
            onChange={setDistance}
          />
          {raceName(distance) ? (
            <span className="t-caption">{capitalizeFirst(raceName(distance) ?? '')}</span>
          ) : null}
        </div>
        <TextField
          label="Data da prova"
          type="date"
          min={today}
          max={addDays(today, 365)}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
          error={error}
        />
      </div>
    </Sheet>
  );
}
