import { rpc } from './client';
import { useRemote } from './remote';
import { saveCopiedRoutine, type SharedExercise, type SharedItem } from './sharing';

/**
 * Ready-made fichas from the Anilha team (published in the panel). Adding one copies it
 * into the person's routines, like a ficha a friend sends; the server only counts it.
 */
export interface LibraryRoutine {
  id: string;
  name: string;
  description: string | null;
  items: SharedItem[];
  exercises: SharedExercise[];
  created_at: string;
}

export function useLibrary() {
  return useRemote<LibraryRoutine[]>('library', {});
}

/** The same ready-made ficha always becomes the same routine: no copies piling up. */
export function libraryRoutineId(id: string): string {
  return `pronta-${id}`;
}

export async function addLibraryRoutine(r: LibraryRoutine): Promise<string> {
  const routineId = libraryRoutineId(r.id);
  await saveCopiedRoutine({
    routineId,
    name: r.name,
    reason: 'Ficha pronta do Anilha',
    origin: 'pronta',
    items: r.items,
    exercises: r.exercises,
  });
  // Only a number for the panel; offline it is simply not counted.
  void rpc('count_library_add', { p_id: r.id }).catch(() => undefined);
  return routineId;
}
