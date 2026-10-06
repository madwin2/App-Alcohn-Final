import { describe, expect, it } from 'vitest';
import {
  previewCargaVacaciones,
  saldoProyectado,
  saldoVacaciones,
} from './vacaciones';

const JULI_B = {
  saldoBase: 3,
  saldoBaseFecha: '2026-10-02',
  diasAnuales: 10,
};

const CACHI = {
  saldoBase: 0,
  saldoBaseFecha: '2026-10-02',
  diasAnuales: 10,
};

describe('saldoVacaciones — ejemplos del plan', () => {
  it('Juli B base 3: carga 2 días en diciembre → le queda 1', () => {
    const saldo = saldoVacaciones({
      ...JULI_B,
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-12-14', // lun
          fechaHasta: '2026-12-15', // mar → 2 hábiles
        },
      ],
      feriados: [],
      hoy: '2026-10-02',
    });
    expect(saldo.acreditados).toBe(0);
    expect(saldo.usados).toBe(0);
    expect(saldo.planificados).toBe(2);
    expect(saldo.disponiblesHoy).toBe(3);
    expect(saldo.disponiblesDespuesDePlanificadas).toBe(1);
  });

  it('Juli B el 1/1/2027 acredita 10 → 11 (con los 2 planificados de dic ya usados o aún planificados)', () => {
    // Al 1/1/2027 los días de dic 2026 ya pasaron → usados=2; +10 acreditados; base 3 → 11
    const saldo = saldoVacaciones({
      ...JULI_B,
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-12-14',
          fechaHasta: '2026-12-15',
        },
      ],
      feriados: [],
      hoy: '2027-01-01',
    });
    expect(saldo.acreditados).toBe(10);
    expect(saldo.usados).toBe(2);
    expect(saldo.planificados).toBe(0);
    expect(saldo.disponiblesHoy).toBe(11);
    expect(saldo.disponiblesDespuesDePlanificadas).toBe(11);
  });

  it('Cachi base 0: carga 5 días en noviembre → −5 (aviso, no bloqueo)', () => {
    // 5 hábiles: lun 9 → vie 13 nov 2026
    const saldo = saldoVacaciones({
      ...CACHI,
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-11-09',
          fechaHasta: '2026-11-13',
        },
      ],
      feriados: [],
      hoy: '2026-10-02',
    });
    expect(saldo.disponiblesHoy).toBe(0);
    expect(saldo.planificados).toBe(5);
    expect(saldo.disponiblesDespuesDePlanificadas).toBe(-5);
  });

  it('Cachi el 1/1/2027 → 5 (tras haber usado los 5 de noviembre)', () => {
    const saldo = saldoVacaciones({
      ...CACHI,
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-11-09',
          fechaHasta: '2026-11-13',
        },
      ],
      feriados: [],
      hoy: '2027-01-01',
    });
    expect(saldo.acreditados).toBe(10);
    expect(saldo.usados).toBe(5);
    expect(saldo.disponiblesHoy).toBe(5);
  });
});

describe('saldoVacaciones — bordes', () => {
  it('vacaciones anteriores o iguales a la fecha base no restan', () => {
    const saldo = saldoVacaciones({
      ...JULI_B,
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-09-28', // lun
          fechaHasta: '2026-10-02', // vie — incluye la fecha base
        },
      ],
      feriados: [],
      hoy: '2026-10-02',
    });
    // Días contables: solo posteriores a 2026-10-02 → ninguno
    expect(saldo.usados).toBe(0);
    expect(saldo.planificados).toBe(0);
    expect(saldo.disponiblesHoy).toBe(3);
  });

  it('rango que cruza la fecha base: solo restan los días posteriores', () => {
    const saldo = saldoVacaciones({
      ...JULI_B,
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-10-01', // jue
          fechaHasta: '2026-10-06', // mar → hábil: 1,2,5,6; contables > 02: 5,6
        },
      ],
      feriados: [],
      hoy: '2026-10-02',
    });
    expect(saldo.usados).toBe(0); // 5 y 6 son futuros
    expect(saldo.planificados).toBe(2);
    expect(saldo.disponiblesDespuesDePlanificadas).toBe(1);
  });

  it('acumulación de dos años (dos 1/1)', () => {
    const saldo = saldoVacaciones({
      ...JULI_B,
      ausencias: [],
      feriados: [],
      hoy: '2028-01-01',
    });
    // 1/1/2027 y 1/1/2028
    expect(saldo.acreditados).toBe(20);
    expect(saldo.disponiblesHoy).toBe(23);
  });

  it('cambio de día (con o sin recupero) nunca entra al saldo (D19c)', () => {
    const saldo = saldoVacaciones({
      ...JULI_B,
      ausencias: [
        {
          tipo: 'cambio_dia',
          fechaDesde: '2026-10-08',
          fechaHasta: '2026-10-08',
          fechaRecupero: '2026-10-11',
        },
        {
          tipo: 'cambio_dia',
          fechaDesde: '2026-10-09',
          fechaHasta: '2026-10-09',
          fechaRecupero: null,
        },
      ],
      feriados: [],
      hoy: '2026-10-02',
    });
    expect(saldo.usados).toBe(0);
    expect(saldo.planificados).toBe(0);
    expect(saldo.disponiblesHoy).toBe(3);
    expect(saldo.disponiblesDespuesDePlanificadas).toBe(3);
  });

  it('feriado dentro del rango de vacaciones no cuenta como día hábil', () => {
    // Independencia 9 jul 2026 (jueves)
    const saldo = saldoVacaciones({
      ...JULI_B,
      saldoBaseFecha: '2026-06-01',
      ausencias: [
        {
          tipo: 'vacaciones',
          fechaDesde: '2026-07-06', // lun
          fechaHasta: '2026-07-10', // vie — 9 es feriado → 4 hábiles
        },
      ],
      feriados: ['2026-07-09'],
      hoy: '2026-06-15',
    });
    expect(saldo.planificados).toBe(4);
  });
});

describe('EQ-R07 / EQ-R10 — ventana larga y superposición', () => {
  it('vacaciones nov-2026 con feriado: mismo descuento en 2026 y en 2028', () => {
    const ausencias = [
      {
        tipo: 'vacaciones' as const,
        fechaDesde: '2026-11-16', // lun
        fechaHasta: '2026-11-20', // vie; 20=feriado ficticio → 4 hábiles
      },
    ];
    const feriados = ['2026-11-20'];
    const base = {
      saldoBase: 10,
      saldoBaseFecha: '2026-10-02',
      diasAnuales: 10,
      ausencias,
      feriados,
    };
    const en2026 = saldoVacaciones({ ...base, hoy: '2026-10-05' });
    const en2028 = saldoVacaciones({ ...base, hoy: '2028-03-01' });
    expect(en2026.planificados).toBe(4);
    // En 2028 esos días ya pasaron → usados; el descuento neto es el mismo (4)
    expect(en2028.usados).toBe(4);
    expect(en2026.disponiblesDespuesDePlanificadas).toBe(6);
    // 2028: +10 (2027) +10 (2028) acreditados − 4 usados = 10+20−4=26; sin planificados
    expect(en2028.acreditados).toBe(20);
    expect(en2028.disponiblesHoy).toBe(26);
  });

  it('vacaciones superpuestas no restan el mismo día dos veces', () => {
    const saldo = saldoVacaciones({
      saldoBase: 10,
      saldoBaseFecha: '2026-10-02',
      diasAnuales: 10,
      ausencias: [
        { tipo: 'vacaciones', fechaDesde: '2026-11-09', fechaHasta: '2026-11-13' },
        { tipo: 'vacaciones', fechaDesde: '2026-11-11', fechaHasta: '2026-11-13' },
      ],
      feriados: [],
      hoy: '2026-10-05',
    });
    // lun–vie = 5 días únicos (no 5+3)
    expect(saldo.planificados).toBe(5);
  });
});

describe('saldoVacaciones — EQ-R07 / EQ-R10', () => {
  const VAC_NOV_2026 = {
    tipo: 'vacaciones' as const,
    fechaDesde: '2026-11-16', // lun
    fechaHasta: '2026-11-20', // vie — 20/11 feriado (puente/trasladable) → 4 hábiles
  };

  it('EQ-R07: vacaciones de nov-2026 con feriado adentro descuentan lo mismo en 2028 que en 2026', () => {
    const base = {
      ...CACHI,
      ausencias: [VAC_NOV_2026],
      feriados: ['2026-11-20'],
    };
    const en2026 = saldoVacaciones({ ...base, hoy: '2026-12-01' });
    const en2028 = saldoVacaciones({ ...base, hoy: '2028-03-01' });

    expect(en2026.usados).toBe(4);
    expect(en2028.usados).toBe(en2026.usados);
    expect(en2028.planificados).toBe(0);
    // 2026: 0 + 0 − 4 ; 2028: 0 + 20 (1/1/2027 y 1/1/2028) − 4
    expect(en2026.disponiblesHoy).toBe(-4);
    expect(en2028.disponiblesHoy).toBe(16);
  });

  it('EQ-R10: dos vacaciones superpuestas no cuentan dos veces el mismo día', () => {
    const saldo = saldoVacaciones({
      ...CACHI,
      ausencias: [
        { tipo: 'vacaciones', fechaDesde: '2026-11-09', fechaHasta: '2026-11-13' },
        { tipo: 'vacaciones', fechaDesde: '2026-11-11', fechaHasta: '2026-11-18' },
      ],
      feriados: [],
      hoy: '2026-10-02',
    });
    // 9–13 (5) + 16–18 (3) = 8 días únicos
    expect(saldo.planificados).toBe(8);
  });

  it('EQ-R10: la misma ausencia duplicada resta una sola vez', () => {
    const dup = { tipo: 'vacaciones' as const, fechaDesde: '2026-11-09', fechaHasta: '2026-11-13' };
    const saldo = saldoVacaciones({
      ...CACHI,
      ausencias: [dup, dup],
      feriados: [],
      hoy: '2026-10-02',
    });
    expect(saldo.planificados).toBe(5);
  });
});

describe('saldoProyectado y preview', () => {
  it('al cargar vacaciones de enero 2027 en nov 2026 suma los 10 del 1/1', () => {
    const input = {
      ...CACHI,
      ausencias: [] as [],
      feriados: [] as string[],
      hoy: '2026-11-15',
    };
    expect(saldoProyectado(input, '2027-01-10')).toBe(10);

    const preview = previewCargaVacaciones(input, '2027-01-04', '2027-01-08');
    // 4–8 ene 2027: lun–vie, 1 ene es antes del rango; sin feriados en el rango = 5
    expect(preview.diasHabiles).toBe(5);
    expect(preview.teQuedarian).toBe(5); // 10 − 5
  });

  it('preview de Cachi en noviembre avisa saldo negativo', () => {
    const preview = previewCargaVacaciones(
      {
        ...CACHI,
        ausencias: [],
        feriados: [],
        hoy: '2026-10-02',
      },
      '2026-11-09',
      '2026-11-13',
    );
    expect(preview.diasHabiles).toBe(5);
    expect(preview.teQuedarian).toBe(-5);
  });
});
