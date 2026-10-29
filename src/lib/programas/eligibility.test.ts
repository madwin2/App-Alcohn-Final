import { describe, expect, it } from 'vitest';
import {
  canAutoTransferRehacerFromOtherProgram,
  isAvailableForNewProgram,
} from './eligibility';

describe('isAvailableForNewProgram', () => {
  it('acepta sellos sin programa', () => {
    expect(isAvailableForNewProgram({ programa_id: null, estado_fabricacion: 'Sin Hacer' })).toBe(
      true,
    );
    expect(isAvailableForNewProgram({ estado_fabricacion: 'Rehacer' })).toBe(true);
  });

  it('acepta Rehacer aunque siga atado al programa donde falló', () => {
    expect(
      isAvailableForNewProgram({ programa_id: 'prog-viejo', estado_fabricacion: 'Rehacer' }),
    ).toBe(true);
  });

  it('rechaza otros estados si ya tienen programa', () => {
    expect(
      isAvailableForNewProgram({ programa_id: 'prog-viejo', estado_fabricacion: 'Sin Hacer' }),
    ).toBe(false);
    expect(
      isAvailableForNewProgram({ programa_id: 'prog-viejo', estado_fabricacion: 'Programado' }),
    ).toBe(false);
    expect(
      isAvailableForNewProgram({ programa_id: 'prog-viejo', estado_fabricacion: 'Prioridad' }),
    ).toBe(false);
  });
});

describe('canAutoTransferRehacerFromOtherProgram', () => {
  it('permite transferir Rehacer desde otro programa', () => {
    expect(
      canAutoTransferRehacerFromOtherProgram(
        { programa_id: 'prog-viejo', estado_fabricacion: 'Rehacer' },
        'prog-nuevo',
      ),
    ).toBe(true);
  });

  it('no transferir si es el mismo programa o no es Rehacer', () => {
    expect(
      canAutoTransferRehacerFromOtherProgram(
        { programa_id: 'prog-a', estado_fabricacion: 'Rehacer' },
        'prog-a',
      ),
    ).toBe(false);
    expect(
      canAutoTransferRehacerFromOtherProgram(
        { programa_id: 'prog-viejo', estado_fabricacion: 'Programado' },
        'prog-nuevo',
      ),
    ).toBe(false);
    expect(
      canAutoTransferRehacerFromOtherProgram(
        { programa_id: null, estado_fabricacion: 'Rehacer' },
        'prog-nuevo',
      ),
    ).toBe(false);
  });
});
