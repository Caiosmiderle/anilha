import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import HOWTO from '../howto.json';
import MEDIA from '../media.json';
import VIDEO_STATUS from '../video-status.json';
import { howToFor } from '../howto';

describe('Como fazer no iPhone', () => {
  it('o arquivo do app é exatamente o howToFor do site para cada exercício', () => {
    const ios = JSON.parse(
      readFileSync(new URL('../../../ios/App/Recursos/howto.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    const sources = { howto: HOWTO, media: MEDIA, status: VIDEO_STATUS } as Parameters<typeof howToFor>[1];
    const expected = Object.fromEntries(
      Object.keys(HOWTO)
        .map((id) => [id, howToFor(id, sources)] as const)
        .filter(([, h]) => h != null),
    );
    expect(ios).toEqual(expected);
    expect(Object.keys(ios).length).toBeGreaterThan(50);
  });
});
