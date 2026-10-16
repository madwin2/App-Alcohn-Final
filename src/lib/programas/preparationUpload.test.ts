import { describe, expect, it } from 'vitest';
import { isPreparationUploadPath, preparationUploadPrefix } from '../../../supabase/functions/_shared/preparationUpload';

describe('archivo asociado al resultado nativo de Aspire', () => {
  it('distingue dos resultados aunque compartan la revisión del plan', () => {
    const old = preparationUploadPrefix('programa', 3, 'resultado-A');
    const current = preparationUploadPrefix('programa', 3, 'resultado-B');
    expect(isPreparationUploadPath(`${old}archivo.crv3d`, current)).toBe(false);
    expect(isPreparationUploadPath(`${current}archivo.crv3d`, current)).toBe(true);
    expect(isPreparationUploadPath(`${current}archivo.zip`, current)).toBe(true);
  });
  it.each([undefined, '', '../otro', 'a/b', 'a\\b', 'a?b', 'a'.repeat(161)])('rechaza identidad de resultado inválida %s', (id) => {
    expect(() => preparationUploadPrefix('p', 1, id)).toThrow();
  });
  it.each([undefined, null, 0, -1, 1.5, '1', NaN])('rechaza revisión inválida %s', (revision) => {
    expect(() => preparationUploadPrefix('p', revision, 'evento')).toThrow();
  });
  it.each(['', '../archivo.crv3d', 'sub/archivo.crv3d', 'sub\\archivo.crv3d', 'archivo.crv3d?x=1'])('rechaza nombre o subcarpeta inválida %s', (file) => {
    const prefix = preparationUploadPrefix('p', 1, 'e');
    expect(isPreparationUploadPath(prefix + file, prefix)).toBe(false);
  });
});
