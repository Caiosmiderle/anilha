import { describe, expect, it } from 'vitest';
import { fullName, splitName } from '../format';

describe('nome e sobrenome', () => {
  it('nome completo numa linha, sem espaço sobrando', () => {
    expect(fullName({ first_name: ' Marina ', last_name: 'Alves   Costa ' })).toBe(
      'Marina Alves Costa',
    );
    expect(fullName({ first_name: 'Rui' })).toBe('Rui');
    expect(fullName({ first_name: '', last_name: '' })).toBe('');
  });

  it('nome digitado num campo só vira primeiro nome e o resto', () => {
    expect(splitName('Marina Alves Costa')).toEqual({
      first_name: 'Marina',
      last_name: 'Alves Costa',
    });
    expect(splitName('Rui')).toEqual({ first_name: 'Rui', last_name: '' });
    expect(splitName('  ')).toEqual({ first_name: '', last_name: '' });
  });
});
