import { useState } from 'react';
import { deleteSet, uncompleteSet, updateSet } from '../../data/ops';
import { kgToUnit, roundLoad, unitToKg } from '../../engine/format';
import { EFFORT_OPTIONS } from '../../engine/taxonomy';
import type { ExerciseRow, SetRow, Unit } from '../../engine/types';
import { Sheet } from '../../ui/overlays';
import { Button, Segmented, Stepper, TextArea } from '../../ui/primitives';

/**
 * Edit one set: kind, load, reps or seconds, effort, note; or delete it. Used during
 * the workout and on a finished one, where the records of the exercise are recalculated.
 */
export function SetEditSheet({
  set,
  ex,
  unit,
  onClose,
  finished = false,
}: {
  set: SetRow;
  ex: ExerciseRow | undefined;
  unit: Unit;
  onClose: () => void;
  /** A set of a finished workout: no "undo done", and records are recalculated. */
  finished?: boolean;
}) {
  const time = ex?.measure === 'time';
  const [load, setLoad] = useState<number | null>(
    set.load_kg != null ? roundLoad(kgToUnit(set.load_kg, unit)) : null,
  );
  const [value, setValue] = useState<number | null>(time ? set.seconds : set.reps);
  const [rir, setRir] = useState<number | null>(set.rir);
  const [kind, setKind] = useState(set.kind);
  const [note, setNote] = useState(set.note ?? '');
  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar série"
      actions={
        <>
          <Button
            variant="primary"
            block
            onClick={async () => {
              await updateSet(set.id, {
                kind,
                load_kg: load != null ? Math.round(unitToKg(load, unit) * 100) / 100 : null,
                reps: time ? null : value,
                seconds: time ? value : null,
                rir: kind === 'warmup' ? null : rir,
                note: note.trim() || null,
              });
              onClose();
            }}
          >
            Salvar série
          </Button>
          <div className="actions">
            {set.completed_at != null && !finished ? (
              <Button variant="ghost" onClick={() => void uncompleteSet(set.id).then(onClose)}>
                Desmarcar feita
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => void deleteSet(set.id).then(onClose)}>
              Apagar série
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <Segmented
          label="Tipo da série"
          value={kind}
          options={[
            { value: 'warmup', label: 'Aquecimento' },
            { value: 'work', label: 'Trabalho' },
          ]}
          onChange={setKind}
        />
        <div className="field-grid">
          <Stepper
            label={`Carga (${unit})`}
            value={load}
            onChange={setLoad}
            step={unit === 'kg' ? (ex?.increment_kg ?? 2.5) : 5}
            decimals={1}
            max={unit === 'kg' ? 1000 : 2200}
          />
          <Stepper
            label={time ? 'Segundos' : 'Repetições'}
            value={value}
            onChange={setValue}
            step={time ? 5 : 1}
            max={time ? 3600 : 200}
          />
        </div>
        {kind === 'work' ? (
          <div className="stack-sm">
            <span className="hb-label">Esforço</span>
            <div className="hb-seg" role="group" aria-label="Esforço">
              {EFFORT_OPTIONS.map((o) => (
                <button
                  key={o.rir}
                  type="button"
                  aria-pressed={rir === o.rir}
                  onClick={() => setRir(rir === o.rir ? null : o.rir)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <TextArea label="Nota da série" value={note} onChange={setNote} maxLength={300} />
      </div>
    </Sheet>
  );
}
