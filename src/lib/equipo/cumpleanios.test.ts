import { describe, expect, it } from 'vitest';
import {
  cumpleaniosEnAnio,
  esCumpleaniosHoy,
  formatearCumpleaniosSinAnio,
  formatearFechaLarga,
  proximoCumpleanios,
} from './cumpleanios';

describe('formatearCumpleaniosSinAnio', () => {
  it('muestra día y mes sin año', () => {
    expect(formatearCumpleaniosSinAnio('1995-03-14')).toBe('14 de marzo');
  });
});

describe('formatearFechaLarga', () => {
  it('incluye el año', () => {
    expect(formatearFechaLarga('2023-08-03')).toBe('3 de agosto de 2023');
  });
});

describe('proximoCumpleanios', () => {
  it('si todavía no pasó este año, usa este año', () => {
    expect(proximoCumpleanios('1990-12-25', '2026-10-02')).toBe('2026-12-25');
  });

  it('si ya pasó, usa el año siguiente', () => {
    expect(proximoCumpleanios('1990-03-14', '2026-10-02')).toBe('2027-03-14');
  });

  it('si es hoy, devuelve hoy', () => {
    expect(proximoCumpleanios('1990-10-02', '2026-10-02')).toBe('2026-10-02');
  });
});

describe('29 de febrero', () => {
  it('en año no bisiesto cae el 28/02', () => {
    expect(cumpleaniosEnAnio('2000-02-29', 2025)).toEqual({ y: 2025, m: 2, d: 28 });
    expect(proximoCumpleanios('2000-02-29', '2025-01-15')).toBe('2025-02-28');
  });

  it('en año bisiesto cae el 29/02', () => {
    expect(cumpleaniosEnAnio('2000-02-29', 2024)).toEqual({ y: 2024, m: 2, d: 29 });
    expect(proximoCumpleanios('2000-02-29', '2024-01-15')).toBe('2024-02-29');
  });

  it('esCumpleaniosHoy respeta el 28 en no bisiesto', () => {
    expect(esCumpleaniosHoy('2000-02-29', '2025-02-28')).toBe(true);
    expect(esCumpleaniosHoy('2000-02-29', '2025-02-27')).toBe(false);
  });
});

describe('esCumpleaniosHoy', () => {
  it('true solo el día correcto', () => {
    expect(esCumpleaniosHoy('1995-03-14', '2026-03-14')).toBe(true);
    expect(esCumpleaniosHoy('1995-03-14', '2026-03-15')).toBe(false);
  });
});
