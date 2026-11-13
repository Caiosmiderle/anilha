import type { RunRow } from './types';
interface Duplicate {
  canonical: RunRow;
  imported: RunRow;
  reason: 'strava' | 'time_distance' | 'manual_day';
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
        .filter((r) => r.source === 'import' || r.source === 'manual')
        .flatMap<Duplicate>((imported) => {
          const close = (a: number, b: number) => Math.abs(a - b) / a <= 0.05 + Number.EPSILON;
          // Registered by hand has no start time: same day and distance within 5%.
          if (imported.source === 'manual')
            return canonical.local_date === imported.local_date &&
              canonical.distance_km &&
              imported.distance_km &&
              close(canonical.distance_km, imported.distance_km)
              ? [{ canonical, imported, reason: 'manual_day' as const }]
              : [];
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
