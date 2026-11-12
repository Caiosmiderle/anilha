import { useMemo, useState } from 'react';
import type { DayAdjustment, PlannedItem } from '../../engine/adjust';
import { describeChange } from '../../engine/adjust';
import { capitalize } from '../../engine/dates';
import {
  ALL_EQUIPMENT,
  EQUIPMENT_LABEL,
  GROUP_LABEL,
  JOINTS,
  JOINT_LABEL,
} from '../../engine/taxonomy';
import type {
  Equipment,
  ExerciseRow,
  Joint,
  MuscleGroup,
  OverrideAction,
  ProfileRow,
} from '../../engine/types';
import { applyAdjustment } from '../../data/today';
import { setDayOverride } from '../../data/ops';
import { Sheet, useToast } from '../../ui/overlays';
import { Button, Choices, Segmented } from '../../ui/primitives';

export type AdjustKind = 'time' | 'focus' | 'no_equipment' | 'spare_joint';

const TITLES: Record<AdjustKind, string> = {
  time: 'Quanto tempo você tem?',
  focus: 'Focar em qual grupo?',
  no_equipment: 'Sem qual equipamento?',
  spare_joint: 'Poupar qual articulação?',
};

/** One-tap change to today's workout. The engine recalculates and shows what changed. */
export function AdjustSheet({
  kind,
  onClose,
  base,
  library,
  profile,
  today,
}: {
  kind: AdjustKind;
  onClose: () => void;
  base: PlannedItem[];
  library: ExerciseRow[];
  profile: ProfileRow | null | undefined;
  today: string;
}) {
  const toast = useToast();
  const [value, setValue] = useState<string>(
    kind === 'time'
      ? '30'
      : kind === 'focus'
        ? 'costas'
        : kind === 'no_equipment'
          ? 'barra'
          : 'ombro',
  );
  const adj: DayAdjustment = useMemo(() => {
    switch (kind) {
      case 'time':
        return { type: 'time', minutes: Number(value) };
      case 'focus':
        return { type: 'focus', group: value as MuscleGroup };
      case 'no_equipment':
        return { type: 'no_equipment', equipment: value as Equipment };
      default:
        return { type: 'spare_joint', joint: value as Joint };
    }
  }, [kind, value]);
  const result = useMemo(
    () => applyAdjustment(base, adj, library, profile),
    [base, adj, library, profile],
  );

  async function apply() {
    await setDayOverride(today, kind as OverrideAction, value);
    toast.show('Treino de hoje ajustado');
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={TITLES[kind]}
      actions={
        <Button variant="primary" block onClick={() => void apply()}>
          Ajustar treino de hoje
        </Button>
      }
    >
      <div className="stack">
        {kind === 'time' ? (
          <Segmented
            label="Minutos"
            value={value}
            options={['30', '45', '60'].map((m) => ({ value: m, label: `${m} min` }))}
            onChange={setValue}
          />
        ) : null}
        {kind === 'focus' ? (
          <Choices
            label="Grupo"
            options={(Object.keys(GROUP_LABEL) as MuscleGroup[]).map((g) => ({
              value: g,
              label: GROUP_LABEL[g],
            }))}
            selected={[value as MuscleGroup]}
            onToggle={setValue}
          />
        ) : null}
        {kind === 'no_equipment' ? (
          <Choices
            label="Equipamento"
            options={ALL_EQUIPMENT.filter((e) => e !== 'peso_corporal').map((e) => ({
              value: e,
              label: EQUIPMENT_LABEL[e],
            }))}
            selected={[value as Equipment]}
            onToggle={setValue}
          />
        ) : null}
        {kind === 'spare_joint' ? (
          <Choices
            label="Articulação"
            options={JOINTS.map((j) => ({ value: j, label: capitalize(JOINT_LABEL[j]) }))}
            selected={[value as Joint]}
            onToggle={setValue}
          />
        ) : null}
        <div className="hb-advice hb-advice-brand" aria-live="polite">
          <div className="stack-sm" style={{ gap: 4 }}>
            <strong className="t-strong">{result.summary || 'Nada muda.'}</strong>
            {result.changes.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {result.changes.map((c, i) => (
                  <li key={i}>{describeChange(c, library)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
