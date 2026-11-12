import type { RunRow } from './types';
interface Duplicate {
  canonical: RunRow;
  imported: RunRow;
  reason: 'strava' | 'time_distance';
}

/** Suggestions only. CRUNNING is canonical; never mutate or silently hide an import. */
export function crunningDuplicates(runs: RunRow[]): Duplicate[] {
  const live = runs.filter((r) => !r.deleted && (!r.activity || r.activity === 'corrida'));
  const start = (r: RunRow) =>
    r.started_at ?? (r.source === 'import' && r.external_id ? Date.parse(r.external_id) : NaN);
  return live
    .filter((r) => r.source === 'crunning')
    .flatMap((canonical) =>
      live
        .filter((r) => r.source === 'import')
        .flatMap<Duplicate>((imported) => {
          if (canonical.strava_id && canonical.strava_id === imported.strava_id)
            return [{ canonical, imported, reason: 'strava' as const }];
          if (
            Number.isFinite(start(canonical)) &&
            Number.isFinite(start(imported)) &&
            canonical.distance_km &&
            imported.distance_km &&
            Math.abs(start(canonical) - start(imported)) <= 300_000 &&
            Math.abs(canonical.distance_km - imported.distance_km) / canonical.distance_km <=
              0.05 + Number.EPSILON
          )
            return [{ canonical, imported, reason: 'time_distance' as const }];
          return [];
        }),
    );
}
