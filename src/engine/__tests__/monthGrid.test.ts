import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, monthOf } from '../dates';

describe('calendário do mês', () => {
  it('outubro de 2026 começa na quinta e fecha semanas inteiras, segunda primeiro', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks[4]?.slice(-2)).toEqual(['2026-10-31', null]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('fevereiro bissexto e virada de ano', () => {
    expect(monthGrid('2028-02').flat().filter(Boolean)).toHaveLength(29);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthOf('2026-10-28')).toBe('2026-10');
  });
});
