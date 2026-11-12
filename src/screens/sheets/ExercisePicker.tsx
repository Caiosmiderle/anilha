import { Dumbbell, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useExercises, useRecentExerciseIds } from '../../data/hooks';
import { normalizeText } from '../../engine/format';
import { exerciseFocus } from '../../engine/focus';
import { EQUIPMENT_LABEL, GROUP_LABEL, GROUP_PASTEL } from '../../engine/taxonomy';
import type { ExerciseRow, MuscleGroup } from '../../engine/types';
import { Choices, Disc, Empty, Icon } from '../../ui/primitives';
import { measureLabel } from '../../data/display';

/** The list shows this many; past it, the search narrows it down. */
const SHOWN = 120;

const GROUPS: MuscleGroup[] = ['costas', 'peito', 'pernas', 'ombros', 'bracos', 'core'];

/** Search the library. `suggested` shows first (alternatives for a swap, for example). */
export function ExercisePicker({
  onPick,
  suggested = [],
  excludeIds = [],
  suggestedTitle = 'Sugestões',
  initialGroup = null,
}: {
  onPick: (e: ExerciseRow) => void;
  suggested?: ExerciseRow[];
  excludeIds?: string[];
  suggestedTitle?: string;
  /** Opens filtered by this group; the chips still change it. */
  initialGroup?: MuscleGroup | null;
}) {
  const all = useExercises();
  const recentIds = useRecentExerciseIds();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(initialGroup);
  const list = useMemo(() => {
    const nq = normalizeText(q);
    return all
      .filter((e) => !e.archived && !excludeIds.includes(e.id))
      .filter((e) => !group || e.primary_group === group)
      .filter((e) => !nq || nq.split(/\s+/).every((w) => normalizeText(e.name).includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [all, q, group, excludeIds]);
  const showSuggested = suggested.length > 0 && !q && !group;
  // With nothing typed, what was done lately comes first: usually the one being looked for.
  const recent = useMemo(() => {
    if (q || group || showSuggested) return [];
    const byId = new Map(list.map((e) => [e.id, e]));
    return recentIds.map((id) => byId.get(id)).filter((e): e is ExerciseRow => !!e);
  }, [q, group, showSuggested, list, recentIds]);
  const firstIds = new Set([...(showSuggested ? suggested : []), ...recent].map((e) => e.id));
  const rest = list.filter((e) => !firstIds.has(e.id));

  return (
    <div className="stack">
      <div className="hb-search">
        <Icon icon={Search} size={16} />
        <input
          className="hb-input"
          type="search"
          placeholder="Buscar exercício"
          aria-label="Buscar exercício"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="scroll-x" style={{ margin: 0, padding: 0 }}>
        <Choices
          label="Grupo"
          options={GROUPS.map((g) => ({ value: g, label: GROUP_LABEL[g] }))}
          selected={group ? [group] : []}
          onToggle={(g) => setGroup(group === g ? null : g)}
        />
      </div>
      {showSuggested ? (
        <div className="stack-sm">
          <span className="t-label t-muted">{suggestedTitle}</span>
          <ExerciseList items={suggested} onPick={onPick} />
        </div>
      ) : null}
      {recent.length ? (
        <div className="stack-sm">
          <span className="t-label t-muted">Feitos recentemente</span>
          <ExerciseList items={recent} onPick={onPick} />
          <span className="t-label t-muted">Todos</span>
        </div>
      ) : null}
      {list.length ? (
        <>
          <ExerciseList items={rest.slice(0, SHOWN)} onPick={onPick} />
          {rest.length > SHOWN ? (
            <p className="t-caption" style={{ margin: 0 }} role="status">
              Mostrando {SHOWN} de {rest.length}. Busque pelo nome ou escolha um grupo para achar os
              outros.
            </p>
          ) : null}
        </>
      ) : (
        <Empty icon={Search}>Nenhum exercício com esse nome.</Empty>
      )}
    </div>
  );
}

function ExerciseList({
  items,
  onPick,
}: {
  items: ExerciseRow[];
  onPick: (e: ExerciseRow) => void;
}) {
  return (
    <div className="hb-widget">
      <div className="hb-list">
        {items.map((e) => (
          <button key={e.id} type="button" className="hb-list-row" onClick={() => onPick(e)}>
            <Disc small icon={Dumbbell} pastel={GROUP_PASTEL[e.primary_group]} />
            <span className="hb-list-main">
              <span className="hb-list-title" style={{ display: 'block' }}>
                {e.name}
              </span>
              <span className="hb-list-sub">
                {exerciseFocus(e)} · {EQUIPMENT_LABEL[e.equipment]} · {measureLabel(e)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
