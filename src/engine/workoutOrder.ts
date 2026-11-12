/**
 * The order of the workout with one exercise moved. At the gym the equipment is often
 * busy: "Deixar para o fim" sends the exercise after all the others, "Fazer agora" puts it
 * right before the one in progress (the first that still has sets to do). A bi-set moves
 * as a pair, in its own order. Returns the ids in the new order.
 */
export function moveInWorkout(
  items: { id: string; superset: string | null; pending: boolean }[],
  id: string,
  where: 'agora' | 'fim',
): string[] {
  const target = items.find((i) => i.id === id);
  if (!target) return items.map((i) => i.id);
  const moving = new Set(
    target.superset ? items.filter((i) => i.superset === target.superset).map((i) => i.id) : [id],
  );
  const rest = items.filter((i) => !moving.has(i.id));
  const block = items.filter((i) => moving.has(i.id));
  if (where === 'fim') return [...rest, ...block].map((i) => i.id);
  const at = rest.findIndex((i) => i.pending);
  const cut = at < 0 ? rest.length : at;
  return [...rest.slice(0, cut), ...block, ...rest.slice(cut)].map((i) => i.id);
}
