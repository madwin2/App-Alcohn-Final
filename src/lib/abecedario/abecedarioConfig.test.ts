import { describe, expect, it } from 'vitest';
import {
  applyAbecedarioPatch,
  deriveAbecedarioCase,
  formatAbecedarioExtras,
  formatElementoExtraLine,
  resolveAbecedarioSets,
} from './abecedarioConfig';

describe('abecedarioConfig', () => {
  it('deriva el case segun los juegos cargados', () => {
    expect(deriveAbecedarioCase(1, 0)).toBe('MAYUSCULA');
    expect(deriveAbecedarioCase(0, 2)).toBe('MINUSCULA');
    expect(deriveAbecedarioCase(1, 1)).toBe('AMBAS');
  });

  it('formatea letras extra y caracteres especiales', () => {
    expect(
      formatAbecedarioExtras({
        abecedarioExtraLetterCounts: { A: 2, E: 1, Z: 1 },
        abecedarioSpecialCharsCount: 3,
        abecedarioSpecialCharsDescription: 'ñ, ü y @',
      }),
    ).toBe('A (2), E (1), Z (1), Caracter especial (3), ñ, ü y @');
  });

  it('omite ceros al aplicar un patch', () => {
    const next = applyAbecedarioPatch(
      { abecedarioExtraLetterCounts: { A: 2 } },
      { abecedarioExtraLetterCounts: { A: 0, B: 1 }, abecedarioMayusculas: 2 },
    );
    expect(next.abecedarioExtraLetterCounts).toEqual({ B: 1 });
    expect(next.abecedarioCase).toBe('MAYUSCULA');
    expect(next.abecedarioExtraLetters).toBe('B (1)');
  });

  it('resuelve juegos viejos desde abecedarioCase', () => {
    expect(resolveAbecedarioSets({ abecedarioCase: 'AMBAS' })).toEqual({
      mayusculas: 1,
      minusculas: 1,
    });
    expect(resolveAbecedarioSets({ abecedarioMayusculas: 3, abecedarioMinusculas: 0 })).toEqual({
      mayusculas: 3,
      minusculas: 0,
    });
  });

  it('describe elementos extra del pedido', () => {
    expect(formatElementoExtraLine({ itemType: 'SELLO', designName: 'Logo cafe' })).toBe(
      'Sello - Logo cafe',
    );
    expect(formatElementoExtraLine({ itemType: 'MANGO_GOLPE', designName: '' })).toBe(
      'Accesorio - Mango de golpe',
    );
  });
});
