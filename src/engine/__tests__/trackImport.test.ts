import { describe, expect, it } from 'vitest';
import { parseTrack } from '../trackImport';

// 0.009 degrees of latitude is about 1 km.
function gpx(points: [number, number, string][]): string {
  return `<?xml version="1.0"?><gpx version="1.1" creator="relogio"><trk><name>Corrida</name><trkseg>${points
    .map(
      ([lat, lon, t]) => `<trkpt lat="${lat}" lon="${lon}"><ele>5</ele><time>${t}</time></trkpt>`,
    )
    .join('')}</trkseg></trk></gpx>`;
}

describe('importar corrida do relógio', () => {
  it('GPX: distância pelos pontos e tempo em movimento, sem as paradas', () => {
    const r = parseTrack(
      gpx([
        [-20.3, -40.3, '2026-10-18T12:00:00Z'],
        [-20.291, -40.3, '2026-10-18T12:06:00Z'], // 1 km in 6 min
        [-20.291, -40.3, '2026-10-18T12:08:00Z'], // stopped 2 min at a light
        [-20.282, -40.3, '2026-10-18T12:14:00Z'], // 1 km in 6 min
      ]),
      'corrida.gpx',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.format).toBe('gpx');
    expect(r.track.distance_km).toBeCloseTo(2, 1);
    expect(r.track.duration_sec).toBe(12 * 60);
    expect(r.track.local_date).toMatch(/^2026-10-1[89]$/);
  });

  it('TCX: soma das voltas, ignorando a distância acumulada dos pontos', () => {
    const lap = (start: string, sec: number, m: number) =>
      `<Lap StartTime="${start}"><TotalTimeSeconds>${sec}</TotalTimeSeconds><DistanceMeters>${m}</DistanceMeters><Track><Trackpoint><Time>${start}</Time><DistanceMeters>99999</DistanceMeters></Trackpoint></Track></Lap>`;
    const xml = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-10-18T12:00:00Z</Id>${lap(
      '2026-10-18T12:00:00Z',
      300,
      1000,
    )}${lap('2026-10-18T12:05:00Z', 310.4, 1020)}</Activity></Activities></TrainingCenterDatabase>`;
    const r = parseTrack(xml, 'treino.tcx');
    expect(r).toMatchObject({
      ok: true,
      track: { format: 'tcx', distance_km: 2.02, duration_sec: 610, other_sport: null },
    });
  });

  it('TCX de bicicleta vira bike; esporte que o app não registra avisa', () => {
    const xml = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>2026-10-18T12:00:00Z</Id><Lap StartTime="2026-10-18T12:00:00Z"><TotalTimeSeconds>1200</TotalTimeSeconds><DistanceMeters>8000</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const r = parseTrack(xml, 'pedal.tcx');
    expect(r.ok && r.track.activity).toBe('bike');
    expect(r.ok && r.track.other_sport).toBeNull();
    const ski = parseTrack(xml.replace('Biking', 'Skiing'), 'esqui.tcx');
    expect(ski.ok && ski.track.other_sport).toBe('Skiing');
  });

  it('arquivos que não servem dizem o porquê', () => {
    expect(parseTrack('<gpx></gpx>', 'vazio.gpx')).toEqual({
      ok: false,
      error: 'O arquivo não tem pontos com horário.',
    });
    expect(parseTrack('binario', 'garmin.fit')).toMatchObject({ ok: false });
    expect(parseTrack('qualquer coisa', 'foto.jpg')).toMatchObject({ ok: false });
  });
});
