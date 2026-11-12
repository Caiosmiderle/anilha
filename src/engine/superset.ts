/**
 * Bi-set: two exercises done in alternation, A1 B1, rest, A2 B2, rest. Supersets save
 * time without losing volume or long-term gains, and opposite muscles (chest and back,
 * biceps and triceps) even allow a few more reps (Sports Medicine meta-analysis, 2025).
 * Warm-ups of the pair come first; when one exercise has more sets, the extra ones go
 * alone with normal rest.
 */
interface ItemLike {
  id: string;
  position: number;
  status: string;
  superset?: string | null;
}

interface SetLike {
  id: string;
  item_id: string;
  kind: 'warmup' | 'work';
  completed_at: number | null;
  position: number;
}

function pendingOf(item: ItemLike, setsByItem: Map<string, SetLike[]>): SetLike[] {
  return (setsByItem.get(item.id) ?? [])
    .filter((s) => s.completed_at == null)
    .sort((a, b) => a.position - b.position);
}

function workDone(item: ItemLike, setsByItem: Map<string, SetLike[]>): number {
  return (setsByItem.get(item.id) ?? []).filter((s) => s.kind === 'work' && s.completed_at != null)
    .length;
}

/** Next set to do, in order, alternating inside a bi-set. */
export function nextSetInOrder<S extends SetLike>(
  items: ItemLike[],
  setsByItem: Map<string, S[]>,
): S | null {
  const ordered = items
    .filter((i) => i.status !== 'skipped')
    .sort((a, b) => a.position - b.position);
  for (const it of ordered) {
    const pending = pendingOf(it, setsByItem) as S[];
    if (!pending.length) continue;
    if (!it.superset) return pending[0] as S;
    const group = ordered.filter(
      (x) => x.superset === it.superset && pendingOf(x, setsByItem).length > 0,
    );
    for (const x of group) {
      const warm = pendingOf(x, setsByItem).find((s) => s.kind === 'warmup');
      if (warm) return warm as S;
    }
    const pick = [...group].sort(
      (a, b) => workDone(a, setsByItem) - workDone(b, setsByItem) || a.position - b.position,
    )[0] as ItemLike;
    return pendingOf(pick, setsByItem)[0] as S;
  }
  return null;
}

type Paired = { superset?: string | null };

/** Keeps each bi-set adjacent after a reorder: the partner comes right after the first. */
export function keepPairsTogether<T extends Paired>(ordered: T[]): T[] {
  const out: T[] = [];
  const placed = new Set<T>();
  for (const it of ordered) {
    if (placed.has(it)) continue;
    out.push(it);
    placed.add(it);
    if (!it.superset) continue;
    for (const p of ordered)
      if (!placed.has(p) && p.superset === it.superset) {
        out.push(p);
        placed.add(p);
      }
  }
  return out;
}

/** Bi-sets that are no longer a pair side by side (moved apart, or alone): keys to undo. */
export function brokenPairs<T extends Paired>(ordered: T[]): Set<string> {
  const broken = new Set<string>();
  const keys = new Set(ordered.map((i) => i.superset).filter((k): k is string => !!k));
  for (const key of keys) {
    const at = ordered.flatMap((it, i) => (it.superset === key ? [i] : []));
    if (at.length !== 2 || (at[1] as number) - (at[0] as number) !== 1) broken.add(key);
  }
  return broken;
}

/**
 * Rest after this set? In a bi-set, only when the round closes (every exercise of the
 * pair with the same number of work sets) or when the partner has nothing left.
 * `setsByItem` already counts the set as done.
 */
export function restAfter(
  done: Pick<SetLike, 'item_id' | 'kind'>,
  items: ItemLike[],
  setsByItem: Map<string, SetLike[]>,
): boolean {
  const it = items.find((i) => i.id === done.item_id);
  if (!it?.superset || done.kind !== 'work') return true;
  const group = items.filter((x) => x.superset === it.superset && x.status !== 'skipped');
  const partnerLeft = group.some(
    (x) => x.id !== it.id && pendingOf(x, setsByItem).some((s) => s.kind === 'work'),
  );
  if (!partnerLeft) return true;
  const counts = group.map((x) => workDone(x, setsByItem));
  return counts.every((c) => c === counts[0]);
}
