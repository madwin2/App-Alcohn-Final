import { describe, expect, it } from 'vitest';
import { deriveLifecycleFromStamps } from './lifecycle';
import type { FabricationState } from '@/lib/types/index';

const stamp = (fabricationState: FabricationState) => ({ fabricationState });

describe('deriveLifecycleFromStamps', () => {
  it('devuelve BLOQUEADO si el programa está bloqueado', () => {
    expect(deriveLifecycleFromStamps('BORRADOR', true, [stamp('HACIENDO')])).toBe('BLOQUEADO');
  });

  it('devuelve BLOQUEADO si el estado base ya es BLOQUEADO', () => {
    expect(deriveLifecycleFromStamps('BLOQUEADO', false, [stamp('SIN_HACER')])).toBe('BLOQUEADO');
  });

  it('con 0 sellos y base LISTO queda LISTO', () => {
    expect(deriveLifecycleFromStamps('LISTO', false, [])).toBe('LISTO');
  });

  it('con 0 sellos y base BORRADOR queda BORRADOR', () => {
    expect(deriveLifecycleFromStamps('BORRADOR', false, [])).toBe('BORRADOR');
  });

  it('todos HECHO o VERIFICAR → FINALIZADO', () => {
    expect(deriveLifecycleFromStamps('BORRADOR', false, [stamp('HECHO'), stamp('VERIFICAR')])).toBe('FINALIZADO');
  });

  it('alguno HACIENDO o RETOCAR → EN_FABRICACION', () => {
    expect(deriveLifecycleFromStamps('BORRADOR', false, [stamp('SIN_HACER'), stamp('HACIENDO')])).toBe('EN_FABRICACION');
    expect(deriveLifecycleFromStamps('LISTO', false, [stamp('RETOCAR')])).toBe('EN_FABRICACION');
  });

  it('mezcla sin haciendo/hecho total conserva el estado base', () => {
    expect(deriveLifecycleFromStamps('LISTO', false, [stamp('SIN_HACER'), stamp('PROGRAMADO')])).toBe('LISTO');
  });
});
