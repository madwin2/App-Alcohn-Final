import { describe, expect, it } from 'vitest';
import {
  isPlanchuelaEligibleForMachine,
  MACHINE_SIZE_ELIGIBILITY,
  resolvePlanchuelaRef,
  validatePlanchuelaLengthLimit,
} from './material';
import { isEligibleStampForMachine } from './eligibility';

describe('resolvePlanchuelaRef', () => {
  it('respeta tipoPlanchuela si ya es un bucket válido', () => {
    expect(resolvePlanchuelaRef({ tipoPlanchuela: 38 })).toBe(38);
    expect(resolvePlanchuelaRef({ tipoPlanchuela: 63 })).toBe(63);
  });

  it('mapea por el lado menor en cm', () => {
    expect(resolvePlanchuelaRef({ anchoRealCm: 1.2, largoRealCm: 5 })).toBe(12);
    expect(resolvePlanchuelaRef({ anchoRealCm: 2.0, largoRealCm: 5 })).toBe(19);
    expect(resolvePlanchuelaRef({ anchoRealCm: 2.5, largoRealCm: 5 })).toBe(25);
    expect(resolvePlanchuelaRef({ anchoRealCm: 4.0, largoRealCm: 5 })).toBe(38);
    expect(resolvePlanchuelaRef({ anchoRealCm: 4.1, largoRealCm: 5 })).toBe(63);
  });
});

describe('MACHINE_SIZE_ELIGIBILITY', () => {
  it('C y G cubren hasta 38; XL solo 63', () => {
    expect(MACHINE_SIZE_ELIGIBILITY.C).toEqual([12, 19, 25, 38]);
    expect(MACHINE_SIZE_ELIGIBILITY.G).toEqual([12, 19, 25, 38]);
    expect(MACHINE_SIZE_ELIGIBILITY.XL).toEqual([63]);
  });

  it('un sello de 38 entra en C y G, no en XL', () => {
    const dims = { tipoPlanchuela: 38 as const };
    expect(isPlanchuelaEligibleForMachine('C', dims)).toBe(true);
    expect(isPlanchuelaEligibleForMachine('G', dims)).toBe(true);
    expect(isPlanchuelaEligibleForMachine('XL', dims)).toBe(false);
  });

  it('un sello de 63 solo entra en XL', () => {
    const dims = { tipoPlanchuela: 63 as const };
    expect(isPlanchuelaEligibleForMachine('C', dims)).toBe(false);
    expect(isPlanchuelaEligibleForMachine('G', dims)).toBe(false);
    expect(isPlanchuelaEligibleForMachine('XL', dims)).toBe(true);
  });
});

describe('validatePlanchuelaLengthLimit', () => {
  it('acepta justo en el máximo de C (400mm)', () => {
    expect(validatePlanchuelaLengthLimit({
      machine: 'C',
      tipoPlanchuela: 38,
      currentMm: 350,
      extraMm: 50,
    })).toBeNull();
  });

  it('bloquea un mm por encima del máximo', () => {
    const err = validatePlanchuelaLengthLimit({
      machine: 'C',
      tipoPlanchuela: 38,
      currentMm: 400,
      extraMm: 1,
    });
    expect(err).toMatch(/Supera el largo máximo/);
  });
});

describe('isEligibleStampForMachine', () => {
  const base = {
    id: 's1',
    estado_fabricacion: 'Sin Hacer',
    tipo: 'Clasico',
    ancho_real: 3.8,
    largo_real: 3.8,
    tipo_planchuela: 38,
  };

  it('exige estado pendiente y tamaño compatible', () => {
    expect(isEligibleStampForMachine(base, 'C')).toBe(true);
    expect(isEligibleStampForMachine(base, 'G')).toBe(true);
    expect(isEligibleStampForMachine(base, 'XL')).toBe(false);
    expect(isEligibleStampForMachine({ ...base, estado_fabricacion: 'Hecho' }, 'C')).toBe(false);
    expect(isEligibleStampForMachine({ ...base, estado_fabricacion: 'Rehacer' }, 'C')).toBe(true);
  });

  it('excluye ids y para ABC pide tipo ABC', () => {
    expect(isEligibleStampForMachine(base, 'C', ['s1'])).toBe(false);
    expect(isEligibleStampForMachine(base, 'ABC')).toBe(false);
    expect(isEligibleStampForMachine({ ...base, tipo: 'ABC' }, 'ABC')).toBe(true);
  });
});
