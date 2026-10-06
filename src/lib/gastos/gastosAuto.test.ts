import { describe, expect, it } from 'vitest';
import { emptyBundle } from '@/lib/gastos/monthlyEconomiaCosts';
import {
  DEFAULT_CONTROL_GASTOS_CONFIG as CFG,
  calcularMesEnCurso,
  calcularVentasNecesarias,
  publicidadDiariaReciente,
  sumarGastosAutoAMeses,
  valuarGastosPorMes,
  valuarMes,
  valuarUsdDelMes,
  type GastoRegistro,
  type PagoUsd,
} from './gastosAuto';

let seq = 0;
function reg(p: Partial<GastoRegistro>): GastoRegistro {
  seq += 1;
  return {
    id: String(seq),
    fecha: '2026-10-01',
    proveedor: 'meta_ads',
    categoria: 'publicidad',
    concepto: 'Campaña A',
    externalRef: 'c1',
    moneda: 'USD',
    monto: 100,
    ivaAplica: true,
    ...p,
  };
}
function pago(p: Partial<PagoUsd>): PagoUsd {
  return { id: 'p', mes: '2026-10', fecha: '2026-11-05', usd: 100, cotizacion: 2000, ...p };
}

describe('valuarUsdDelMes', () => {
  it('sin pagos → todo a blue de hoy', () => {
    expect(valuarUsdDelMes(100, [], 1500)).toEqual({
      baseArs: 150_000,
      usdPagado: 0,
      usdPendiente: 100,
      sinCotizacionHoy: false,
    });
  });

  it('pago total fija la cotización del pago, aunque el blue de hoy cambie', () => {
    const v = valuarUsdDelMes(100, [pago({ usd: 100, cotizacion: 2000 })], 1500);
    expect(v.baseArs).toBe(200_000);
    expect(v.usdPendiente).toBe(0);
  });

  it('pagos parciales en orden de fecha + resto a blue de hoy', () => {
    const v = valuarUsdDelMes(
      300,
      [pago({ fecha: '2026-11-10', usd: 100, cotizacion: 2100 }), pago({ fecha: '2026-11-02', usd: 100, cotizacion: 2000 })],
      2200,
    );
    expect(v.baseArs).toBe(100 * 2000 + 100 * 2100 + 100 * 2200);
    expect(v.usdPagado).toBe(200);
  });

  it('pago mayor que la base no suma de más', () => {
    const v = valuarUsdDelMes(80, [pago({ usd: 100, cotizacion: 2000 })], 1500);
    expect(v.baseArs).toBe(160_000);
    expect(v.usdPagado).toBe(80);
  });

  it('sin blue de hoy usa la última cotización de pago y lo marca', () => {
    const v = valuarUsdDelMes(200, [pago({ usd: 100, cotizacion: 2000 })], null);
    expect(v.baseArs).toBe(400_000);
    expect(v.sinCotizacionHoy).toBe(true);
  });
});

describe('valuarMes', () => {
  it('USD: gasto + IVA en la categoría y 2 % extra en impuestos', () => {
    const v = valuarMes('2026-10', [reg({ monto: 100 })], [], 1000, CFG);
    expect(v.porCategoria.publicidad).toBe(121_000);
    expect(v.impuestosExtra).toBe(2_000);
    expect(v.total).toBe(123_000);
    expect(v.estado).toBe('estimado');
  });

  it('ARS sin IVA no lleva recargos ni depende del dólar', () => {
    const v = valuarMes(
      '2026-10',
      [reg({ moneda: 'ARS', monto: 50_000, ivaAplica: false, categoria: 'automatizaciones', proveedor: 'recurrente' })],
      [],
      1000,
      CFG,
    );
    expect(v.porCategoria.automatizaciones).toBe(50_000);
    expect(v.impuestosExtra).toBe(0);
    expect(v.estado).toBe('sin_usd');
  });

  it('agrupa conceptos y marca pagado', () => {
    const v = valuarMes(
      '2026-10',
      [reg({ fecha: '2026-10-01', monto: 60 }), reg({ fecha: '2026-10-02', monto: 40 })],
      [pago({ usd: 100, cotizacion: 2000 })],
      1500,
      CFG,
    );
    expect(v.conceptos).toHaveLength(1);
    expect(v.conceptos[0].montoOriginal).toBe(100);
    expect(v.cotizacionEfectiva).toBe(2000);
    expect(v.estado).toBe('pagado');
  });
});

describe('valuarGastosPorMes', () => {
  it('ignora registros anteriores a fechaInicio y separa por mes', () => {
    const out = valuarGastosPorMes(
      [
        reg({ fecha: '2026-09-28', monto: 999 }),
        reg({ fecha: '2026-09-29', monto: 10 }),
        reg({ fecha: '2026-10-03', monto: 20 }),
      ],
      [],
      1000,
      CFG,
    );
    expect(Object.keys(out).sort()).toEqual(['2026-09', '2026-10']);
    expect(out['2026-09'].usdBase).toBe(10);
    expect(out['2026-10'].usdBase).toBe(20);
  });
});

describe('sumarGastosAutoAMeses', () => {
  it('suma a lo manual sin mutar el original y crea meses vacíos', () => {
    const manual = { '2026-09': { ...emptyBundle(), extras: { ...emptyBundle().extras, publicidad: 5_000_000, impuestos: 100 } } };
    const auto = valuarGastosPorMes([reg({ fecha: '2026-09-30', monto: 100 }), reg({ fecha: '2026-10-01', monto: 100 })], [], 1000, CFG);
    const out = sumarGastosAutoAMeses(manual, auto);
    expect(out['2026-09'].extras.publicidad).toBe(5_121_000);
    expect(out['2026-09'].extras.impuestos).toBe(2_100);
    expect(manual['2026-09'].extras.publicidad).toBe(5_000_000);
    expect(out['2026-10'].extras.publicidad).toBe(121_000);
  });
});

describe('publicidadDiariaReciente', () => {
  it('promedia los últimos 7 días completos (sin hoy)', () => {
    const regs = [
      reg({ fecha: '2026-10-10', monto: 999 }), // hoy: no cuenta
      reg({ fecha: '2026-10-09', monto: 70 }),
      reg({ fecha: '2026-10-03', monto: 70 }),
      reg({ fecha: '2026-10-02', monto: 999 }), // fuera de la ventana
    ];
    const d = publicidadDiariaReciente(regs, '2026-10-10', 1000, CFG);
    expect(d).toBeCloseTo((140 * 1000 * 1.23) / 7, 6);
  });

  it('respeta fechaInicio cuando hay menos días', () => {
    const d = publicidadDiariaReciente([reg({ fecha: '2026-09-29', monto: 100 })], '2026-09-30', 1000, CFG);
    expect(d).toBeCloseTo(123_000, 6);
  });
});

describe('calcularMesEnCurso', () => {
  it('proyecta y calcula el presupuesto de publicidad para el objetivo', () => {
    const r = calcularMesEnCurso({
      mes: '2026-10',
      hoy: '2026-10-10',
      ventas: 6_000_000,
      costosVariables: 1_000_000,
      fijos: 9_000_000,
      fijosEstimados: false,
      publicidad: 1_000_000,
      otros: 500_000,
      publicidadDiaria: 100_000,
      objetivo: 0.25,
    });
    expect(r.diasMes).toBe(31);
    expect(r.diasRestantes).toBe(21);
    expect(r.proyeccion.ventas).toBeCloseTo(18_600_000, 0);
    expect(r.proyeccion.publicidad).toBe(1_000_000 + 100_000 * 21);
    // tope = 18,6M × 0,75 − 3,1M − 0,5M − 9M = 1,35M
    expect(r.topePublicidad).toBeCloseTo(1_350_000, 0);
    expect(r.publicidadRestante).toBeCloseTo(350_000, 0);
    expect(r.publicidadPorDia).toBeCloseTo(350_000 / 21, 2);
    expect(r.pocosDatos).toBe(false);
  });

  it('sin publicidad diaria proyecta lineal', () => {
    const r = calcularMesEnCurso({
      mes: '2026-10',
      hoy: '2026-10-02',
      ventas: 1_000_000,
      costosVariables: 0,
      fijos: 0,
      fijosEstimados: true,
      publicidad: 100_000,
      otros: 0,
      publicidadDiaria: null,
      objetivo: 0.25,
    });
    expect(r.proyeccion.publicidad).toBeCloseTo(1_550_000, 0);
    expect(r.pocosDatos).toBe(true);
  });
});

describe('calcularVentasNecesarias', () => {
  it('despeja las ventas que dan el objetivo', () => {
    const input = {
      mes: '2026-10',
      hoy: '2026-10-10',
      ventas: 5_000_000,
      costosVariables: 750_000, // 15 %
      fijos: 9_000_000,
      fijosEstimados: false,
      publicidad: 1_000_000,
      otros: 500_000,
      publicidadDiaria: 100_000,
      objetivo: 0.25,
    };
    const r = calcularMesEnCurso(input);
    const n = calcularVentasNecesarias(input, r);
    // pub proy = 1M + 100k × 21 = 3,1M → V = (3,1M + 0,5M + 9M) / 0,6 = 21M
    expect(n.ventasMes).toBeCloseTo(21_000_000, 0);
    expect(n.faltan).toBeCloseTo(16_000_000, 0);
    expect(n.porDia).toBeCloseTo(16_000_000 / 21, 2);
    expect(n.ritmoActual).toBe(500_000);
  });

  it('null si el costo variable no deja margen', () => {
    const input = {
      mes: '2026-10', hoy: '2026-10-10', ventas: 100, costosVariables: 80, fijos: 0, fijosEstimados: false,
      publicidad: 0, otros: 0, publicidadDiaria: null, objetivo: 0.25,
    };
    expect(calcularVentasNecesarias(input, calcularMesEnCurso(input)).ventasMes).toBeNull();
  });
});
