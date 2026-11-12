import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newId, save } from '../data/store';
import { capitalize } from '../engine/dates';
import {
  ALL_EQUIPMENT,
  DEFAULT_PATTERN,
  EQUIPMENT_LABEL,
  GROUP_LABEL,
  JOINTS,
  JOINT_LABEL,
} from '../engine/taxonomy';
import type { Equipment, Joint, Measure, Muscle, MuscleGroup } from '../engine/types';
import { Sheet, useToast } from '../ui/overlays';
import { Button, Choices, ErrorText, Segmented, Select, Switch, TextField } from '../ui/primitives';
import { ExercisePicker } from './sheets/ExercisePicker';

const DEFAULT_MUSCLE: Record<MuscleGroup, Muscle> = {
  costas: 'costas',
  peito: 'peito',
  pernas: 'quadriceps',
  ombros: 'ombro_lateral',
  bracos: 'biceps',
  core: 'abdomen',
};

export default function Library() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Exercícios</h1>
          <p className="page-sub">
            Toque num exercício para ver o histórico, o incremento e sua nota.
          </p>
        </div>
      </header>
      <Button variant="tint" icon={Plus} onClick={() => setCreating(true)}>
        Criar exercício
      </Button>
      <ExercisePicker onPick={(e) => navigate(`/exercicios/${e.id}`)} />
      {creating ? (
        <CreateSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/exercicios/${id}`)}
        />
      ) : null}
    </>
  );
}

function CreateSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<MuscleGroup>('costas');
  const [equipment, setEquipment] = useState<Equipment>('halteres');
  const [measure, setMeasure] = useState<Measure>('weight_reps');
  const [compound, setCompound] = useState(false);
  const [joints, setJoints] = useState<Joint[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return setError('Dê um nome');
    const id = `custom-${newId()}`;
    await save('exercises', {
      id,
      deleted: false,
      name: name.trim().slice(0, 80),
      primary_group: group,
      secondary_groups: [],
      muscles: [DEFAULT_MUSCLE[group]],
      secondary_muscles: [],
      equipment,
      measure,
      increment_kg: equipment === 'maquina' || equipment === 'polia' ? 2.5 : 2,
      joints,
      compound,
      bodyweight: measure !== 'weight_reps',
      pattern: DEFAULT_PATTERN[group],
      progression_hint: null,
      note: null,
      builtin: false,
      archived: false,
    });
    toast.show('Exercício criado');
    onClose();
    onCreated(id);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Criar exercício"
      actions={
        <Button variant="primary" block onClick={() => void create()}>
          Criar exercício
        </Button>
      }
    >
      <div className="stack">
        <TextField
          label="Nome"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Remada na máquina Matrix"
        />
        <Select<MuscleGroup>
          label="Grupo principal"
          value={group}
          options={(Object.keys(GROUP_LABEL) as MuscleGroup[]).map((g) => ({
            value: g,
            label: GROUP_LABEL[g],
          }))}
          onChange={setGroup}
        />
        <Select<Equipment>
          label="Equipamento"
          value={equipment}
          options={ALL_EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABEL[e] }))}
          onChange={setEquipment}
        />
        <div className="stack-sm">
          <span className="hb-label">Como medir</span>
          <Segmented<Measure>
            label="Como medir"
            value={measure}
            options={[
              { value: 'weight_reps', label: 'Carga e reps' },
              { value: 'reps', label: 'Só reps' },
              { value: 'time', label: 'Tempo' },
            ]}
            onChange={setMeasure}
          />
        </div>
        <Switch
          label="Exercício composto"
          hint="Vários músculos e articulações: entra primeiro no treino."
          checked={compound}
          onChange={setCompound}
        />
        <div className="stack-sm">
          <span className="hb-label">Articulações que ele carrega</span>
          <Choices
            label="Articulações"
            options={JOINTS.map((j) => ({ value: j, label: capitalize(JOINT_LABEL[j]) }))}
            selected={joints}
            onToggle={(j) =>
              setJoints(joints.includes(j) ? joints.filter((x) => x !== j) : [...joints, j])
            }
          />
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </Sheet>
  );
}
