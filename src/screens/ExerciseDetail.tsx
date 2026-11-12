import { Archive, CirclePlay, Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAllItems, useAllSets, useExerciseMap, useProfile, useSessions } from '../data/hooks';
import { patch } from '../data/store';
import { capitalize } from '../engine/dates';
import { fmtNum } from '../engine/format';
import { buildExerciseLogs } from '../engine/history';
import { exerciseFocus } from '../engine/focus';
import { EQUIPMENT_LABEL, GROUP_LABEL, GROUP_PASTEL, JOINT_LABEL } from '../engine/taxonomy';
import type { Unit } from '../engine/types';
import { useToast } from '../ui/overlays';
import { Button, Chip, Empty, Icon, LoadingCard, Stepper, Widget } from '../ui/primitives';
import { hasHowTo } from '../content/howto';
import { levelOf } from '../engine/substitute';
import { HowToSheet } from './parts/HowToSheet';
import { LEVEL_LABEL } from './parts/trainingQuestions';
import { measureLabel } from '../data/display';
import { ExerciseProgress } from './parts/ExerciseProgress';

export default function ExerciseDetail() {
  const { id } = useParams();
  const exMap = useExerciseMap();
  const sessions = useSessions();
  const items = useAllItems();
  const sets = useAllSets();
  const profile = useProfile();
  const toast = useToast();
  const navigate = useNavigate();
  const ex = id ? exMap.get(id) : undefined;
  const [note, setNote] = useState<string | null>(null);
  const [howTo, setHowTo] = useState(false);
  const unit: Unit = profile?.unit ?? 'kg';

  if (!sessions || !items || !sets || exMap.size === 0) return <LoadingCard lines={4} />;
  if (!ex) return <Empty icon={Dumbbell}>Exercício não encontrado.</Empty>;
  const logs = buildExerciseLogs(ex.id, sessions, items, sets);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">{ex.name}</h1>
          <p className="page-sub">Trabalha: {exerciseFocus(ex)}</p>
          <div className="row-wrap" style={{ marginTop: 8 }}>
            <Chip pastel={GROUP_PASTEL[ex.primary_group]}>{GROUP_LABEL[ex.primary_group]}</Chip>
            {ex.secondary_groups.map((g) => (
              <Chip key={g} pastel={GROUP_PASTEL[g]}>
                {GROUP_LABEL[g]}
              </Chip>
            ))}
            <Chip>{EQUIPMENT_LABEL[ex.equipment]}</Chip>
            <Chip>{capitalize(measureLabel(ex))}</Chip>
            {ex.compound ? <Chip>Composto</Chip> : <Chip>Isolado</Chip>}
            {levelOf(ex) ? (
              <Chip>{LEVEL_LABEL[levelOf(ex) as keyof typeof LEVEL_LABEL]}</Chip>
            ) : null}
          </div>
          {hasHowTo(ex.id) ? (
            <button type="button" className="howto-btn" onClick={() => setHowTo(true)}>
              <Icon icon={CirclePlay} size={16} />
              Como fazer
            </button>
          ) : null}
        </div>
      </header>
      {howTo ? <HowToSheet exercise={ex} onClose={() => setHowTo(false)} /> : null}

      <div className="grid-2">
        <div className="stack">
          {logs.length ? (
            <ExerciseProgress exercise={ex} unit={unit} logs={logs} />
          ) : (
            <Widget title="Histórico">
              <p className="empty-line">Nenhuma série registrada neste exercício.</p>
            </Widget>
          )}
        </div>
        <div className="stack">
          <Widget title="Ajustes">
            <div className="stack">
              {ex.measure !== 'time' || ex.bodyweight ? (
                <Stepper
                  label="Incremento mínimo de carga (kg)"
                  value={ex.increment_kg}
                  step={0.5}
                  min={0.5}
                  max={20}
                  decimals={1}
                  onChange={(v) => {
                    if (v && v > 0) void patch('exercises', ex.id, { increment_kg: v });
                  }}
                />
              ) : null}
              <p className="t-caption" style={{ margin: 0 }}>
                A sugestão de subida usa este passo. Hoje: {fmtNum(ex.increment_kg)} kg.
              </p>
              {ex.joints.length ? (
                <p className="t-regular" style={{ margin: 0 }}>
                  Carrega: {ex.joints.map((j) => JOINT_LABEL[j]).join(', ')}.
                </p>
              ) : null}
              {ex.progression_hint ? (
                <p className="t-regular" style={{ margin: 0 }}>
                  Para progredir sem carga: {ex.progression_hint}.
                </p>
              ) : null}
            </div>
          </Widget>
          <div className="hb-note">
            <label
              className="hb-label"
              htmlFor="ex-note"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Sua nota
            </label>
            <textarea
              id="ex-note"
              placeholder="Altura do banco, pegada, máquina preferida"
              value={note ?? ex.note ?? ''}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note != null && note !== (ex.note ?? '')) {
                  void patch('exercises', ex.id, { note: note.trim() || null });
                  toast.show('Nota salva');
                }
              }}
            />
          </div>
          {!ex.builtin ? (
            <Button
              variant="ghost"
              icon={Archive}
              onClick={async () => {
                await patch('exercises', ex.id, { archived: true });
                toast.show('Exercício arquivado');
                navigate('/exercicios', { replace: true });
              }}
            >
              Arquivar exercício
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
