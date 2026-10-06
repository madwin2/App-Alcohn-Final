import { describe, expect, it } from 'vitest';
import { emptyBundle } from '@/lib/gastos/monthlyEconomiaCosts';
import {
  DEFAULT_CONTROL_GASTOS_CONFIG as CFG,
  calcularMesEnCurso,
  calcularObjetivoSellos,
  calcularVentasNecesarias,
  estimarFijos,
  publicidadArsAUsd,
  recurrentesPendientesArs,
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

describe('calcularMesEnCurso (días hábiles)', () => {
  // Octubre 2026: 21 hábiles. Hoy martes 13 (después del finde largo con feriado el 12).
  const base = {
    mes: '2026-10',
    hoy: '2026-10-13',
    ventas: 8_000_000,
    ventasDiasCompletos: 7_500_000, // 8 hábiles terminados (1–9 oct)
    habiles: { total: 21, completos: 8, restantes: 13, hoyEsHabil: true },
    costosVariables: 1_200_000, // 15 %
    fijos: 9_000_000,
    publicidad: 1_300_000,
    otros: 400_000,
    otrosPendientes: 100_000,
    publicidadDiaria: 100_000,
    objetivo: 0.25,
  };

  it('ventas por día hábil y publicidad por día corrido', () => {
    const r = calcularMesEnCurso(base);
    expect(r.ritmoDiario).toBeCloseTo(937_500, 6);
    // 7,5M + 937.500 × 13 = 19.687.500
    expect(r.proyeccion.ventas).toBeCloseTo(19_687_500, 0);
    expect(r.proyeccion.costosVariables).toBeCloseTo(1_200_000 * (19_687_500 / 8_000_000), 0);
    // 31 − 13 = 18 días corridos después de hoy
    expect(r.diasCorridosRestantes).toBe(18);
    expect(r.proyeccion.publicidad).toBe(1_300_000 + 100_000 * 18);
    expect(r.proyeccion.otros).toBe(500_000);
    // fijos prorrateados por hábiles: (8 + hoy) / 21
    expect(r.aHoy.fijosProrrateados).toBeCloseTo((9_000_000 * 9) / 21, 4);
    expect(r.pocosDatos).toBe(false);
  });

  it('el presupuesto de publicidad se reparte en días corridos', () => {
    const r = calcularMesEnCurso(base);
    const tope = r.proyeccion.ventas * 0.75 - r.proyeccion.costosVariables - 500_000 - 9_000_000;
    expect(r.topePublicidad).toBeCloseTo(tope, 4);
    expect(r.publicidadPorDia).toBeCloseTo((tope - 1_300_000) / 18, 4);
  });

  it('un fin de semana no cambia la ganancia a hoy (fijos por hábiles)', () => {
    const viernes = calcularMesEnCurso({ ...base, hoy: '2026-10-09', habiles: { total: 21, completos: 6, restantes: 15, hoyEsHabil: true } });
    const sabado = calcularMesEnCurso({ ...base, hoy: '2026-10-10', habiles: { total: 21, completos: 7, restantes: 14, hoyEsHabil: false } });
    expect(sabado.aHoy.fijosProrrateados).toBeCloseTo(viernes.aHoy.fijosProrrateados, 4);
  });

  it('sin ningún dato de publicidad usa el mes de referencia en vez de $0', () => {
    const sinPub = { ...base, publicidad: 0, publicidadDiaria: null };
    expect(calcularMesEnCurso(sinPub).proyeccion.publicidad).toBe(0);
    expect(calcularMesEnCurso(sinPub).origenPublicidad).toBe('sin_datos');
    const conRef = calcularMesEnCurso({ ...sinPub, publicidadReferenciaMes: 5_200_000 });
    expect(conRef.proyeccion.publicidad).toBe(5_200_000);
    expect(conRef.origenPublicidad).toBe('referencia');
    // Con datos reales del mes, la referencia no se usa.
    expect(calcularMesEnCurso({ ...base, publicidadReferenciaMes: 5_200_000 }).origenPublicidad).toBe('ritmo');
  });

  it('nunca proyecta menos de lo ya vendido; sin hábiles terminados usa lo de hoy', () => {
    const r = calcularMesEnCurso({
      ...base,
      hoy: '2026-10-01',
      ventas: 600_000,
      ventasDiasCompletos: 0,
      habiles: { total: 21, completos: 0, restantes: 21, hoyEsHabil: true },
      publicidadDiaria: null,
      publicidad: 50_000,
    });
    expect(r.ritmoDiario).toBe(600_000);
    expect(r.proyeccion.ventas).toBe(600_000 * 21);
    expect(r.proyeccion.publicidad).toBe(50_000 * 31);
    expect(r.pocosDatos).toBe(true);
  });
});

describe('calcularVentasNecesarias', () => {
  it('despeja las ventas que dan el objetivo y las reparte en hábiles restantes', () => {
    const input = {
      mes: '2026-10',
      hoy: '2026-10-13',
      ventas: 5_000_000,
      ventasDiasCompletos: 5_000_000,
      habiles: { total: 21, completos: 8, restantes: 13, hoyEsHabil: true },
      costosVariables: 750_000, // 15 %
      fijos: 9_000_000,
      publicidad: 1_200_000,
      otros: 400_000,
      otrosPendientes: 100_000,
      publicidadDiaria: 100_000,
      objetivo: 0.25,
    };
    const r = calcularMesEnCurso(input);
    const n = calcularVentasNecesarias(input, r);
    // pub proy = 1,2M + 100k × 18 = 3M; otros proy = 0,5M → V = (3M + 0,5M + 9M) / 0,6
    expect(n.ventasMes).toBeCloseTo(12_500_000 / 0.6, 0);
    expect(n.faltan).toBeCloseTo(12_500_000 / 0.6 - 5_000_000, 0);
    expect(n.porDia).toBeCloseTo((12_500_000 / 0.6 - 5_000_000) / 13, 2);
    expect(n.ritmoActual).toBe(625_000);
    // equilibrio: (3M + 0,5M + 9M) / 0,85
    expect(n.ventasEquilibrio).toBeCloseTo(12_500_000 / 0.85, 0);
    expect(n.porDiaEquilibrio).toBeCloseTo((12_500_000 / 0.85 - 5_000_000) / 13, 2);
  });

  it('null si el costo variable no deja margen', () => {
    const input = {
      mes: '2026-10', hoy: '2026-10-13', ventas: 100, ventasDiasCompletos: 100,
      habiles: { total: 21, completos: 8, restantes: 13, hoyEsHabil: true },
      costosVariables: 80, fijos: 0, publicidad: 0, otros: 0, otrosPendientes: 0, publicidadDiaria: null, objetivo: 0.25,
    };
    expect(calcularVentasNecesarias(input, calcularMesEnCurso(input)).ventasMes).toBeNull();
  });
});

describe('recurrentesPendientesArs', () => {
  const r = (diaDelMes: number, extra: Partial<{ moneda: 'USD' | 'ARS'; monto: number; ivaAplica: boolean; activo: boolean }> = {}) => ({
    moneda: 'USD' as const, monto: 10, ivaAplica: true, diaDelMes, activo: true, ...extra,
  });
  it('suma solo los que se cobran después de hoy, en el mes en curso', () => {
    const lista = [r(1), r(20), r(31, { moneda: 'ARS', monto: 5000, ivaAplica: false }), r(25, { activo: false })];
    expect(recurrentesPendientesArs(lista, '2026-10', '2026-10-13', 1000, CFG)).toBeCloseTo(10 * 1000 * 1.23 + 5000, 6);
    expect(recurrentesPendientesArs(lista, '2026-09', '2026-10-13', 1000, CFG)).toBe(0);
  });
});

describe('estimarFijos', () => {
  const fijos = (p: Partial<import('@/lib/gastos/monthlyEconomiaCosts').FixedCostsMonth>) => ({
    monotributos: 0, contador: 0, electricidad: 0, agua: 0, internet: 0, alquiler: 0, seguro: 0, credito: 0, sueldos: [], ...p,
  });
  it('completa línea por línea con el mes anterior', () => {
    const anterior = fijos({ alquiler: 600_000, internet: 30_000, sueldos: [{ id: 'a', nombre: 'A', monto: 1_200_000 }, { id: 'b', nombre: 'B', monto: 1_200_000 }] });
    const actual = fijos({ internet: 32_000, sueldos: [{ id: 'a', nombre: 'A', monto: 1_300_000 }, { id: 'b', nombre: 'B', monto: 0 }] });
    const e = estimarFijos(actual, anterior);
    const sueldos = 1_300_000 + 1_200_000;
    expect(e.total).toBeCloseTo(600_000 + 32_000 + sueldos + sueldos / 12, 4);
    expect(e.estimado).toBeCloseTo(600_000 + 1_200_000 + 1_200_000 / 12, 4);
    expect(e.faltan).toEqual(['Sueldos', 'Alquiler']);
  });
  it('sin mes anterior usa lo cargado', () => {
    const e = estimarFijos(fijos({ alquiler: 100 }), undefined);
    expect(e).toEqual({ total: 100, estimado: 0, faltan: [] });
  });
});

describe('publicidadArsAUsd', () => {
  const cots = [
    { fecha: '2026-10-05', oficial: 1500, blue: 1545 },
    { fecha: '2026-10-07', oficial: 1600, blue: 1650 },
  ];
  it('pasa Meta en pesos a USD con el oficial del día (o el anterior más cercano)', () => {
    const out = publicidadArsAUsd(
      [
        reg({ fecha: '2026-10-05', moneda: 'ARS', monto: 150_000 }),
        reg({ fecha: '2026-10-06', moneda: 'ARS', monto: 150_000 }),
        reg({ fecha: '2026-10-08', moneda: 'ARS', monto: 160_000, proveedor: 'google_ads' }),
        reg({ fecha: '2026-09-29', moneda: 'ARS', monto: 150_000 }), // antes de toda cotización → la primera
      ],
      cots,
      1545,
    );
    expect(out.map((r) => [r.moneda, r.monto])).toEqual([
      ['USD', 100],
      ['USD', 100],
      ['USD', 100],
      ['USD', 100],
    ]);
  });
  it('no toca recurrentes ni lo que ya está en USD', () => {
    const r1 = reg({ moneda: 'ARS', monto: 5000, proveedor: 'recurrente', categoria: 'automatizaciones' });
    const r2 = reg({ moneda: 'USD', monto: 10 });
    expect(publicidadArsAUsd([r1, r2], cots, 1545)).toEqual([r1, r2]);
  });
});

describe('calcularObjetivoSellos', () => {
  const habiles = { total: 21, completos: 8, restantes: 13, hoyEsHabil: true };
  const base = {
    vendidos: 60,
    habiles,
    ventas: 6_000_000, // $100.000 por sello (con accesorios)
    ventasEquilibrio: 14_000_000,
    ventasObjetivo: 21_000_000,
    ventasProyectadas: 14_700_000,
    ritmoVentas: 700_000,
    porDiaEquilibrioVentas: 800_000,
    porDiaObjetivoVentas: 1_500_000,
  };
  it('pasa equilibrio, objetivo y proyección en pesos a sellos con la venta promedio por sello', () => {
    const r = calcularObjetivoSellos(base);
    expect(r.ventaPorSello).toBe(100_000);
    expect(r.equilibrio).toBe(140);
    expect(r.objetivo).toBe(210);
    expect(r.ritmo).toBe(7);
    expect(r.proyeccion).toBe(147);
    expect(r.porDiaEquilibrio).toBe(8);
    expect(r.porDiaObjetivo).toBe(15);
    expect(r.objetivoAHoy).toBeCloseTo((210 * 9) / 21, 6);
    expect(r.zona).toBe('aceptable');
  });
  it('la zona coincide con la ganancia proyectada en pesos', () => {
    // proyección < equilibrio en pesos ⇔ ganancia proyectada < 0
    expect(calcularObjetivoSellos({ ...base, ventasProyectadas: 13_900_000 }).zona).toBe('perdida');
    expect(calcularObjetivoSellos({ ...base, ventasProyectadas: 21_000_000 }).zona).toBe('ideal');
  });
  it('si los accesorios suben la venta por sello, la meta en sellos baja', () => {
    const sinAcc = calcularObjetivoSellos(base);
    const conAcc = calcularObjetivoSellos({ ...base, ventas: 7_200_000 });
    expect(conAcc.objetivo!).toBeLessThan(sinAcc.objetivo!);
  });
});

describe('coherencia ritmo / necesario / proyección', () => {
  it('ritmo ≥ necesario por día ⇔ la proyección llega (aunque hoy ya haya ventas parciales)', () => {
    for (const ventasHoyParcial of [0, 300_000, 900_000]) {
      for (const ritmoCompletos of [700_000, 950_000, 1_300_000]) {
        const input = {
          mes: '2026-10', hoy: '2026-10-13',
          ventas: ritmoCompletos * 8 + ventasHoyParcial,
          ventasDiasCompletos: ritmoCompletos * 8,
          habiles: { total: 21, completos: 8, restantes: 13, hoyEsHabil: true },
          costosVariables: (ritmoCompletos * 8 + ventasHoyParcial) * 0.15,
          fijos: 9_000_000, publicidad: 1_300_000, otros: 400_000, otrosPendientes: 0,
          publicidadDiaria: 100_000, objetivo: 0.25,
        };
        const r = calcularMesEnCurso(input);
        const n = calcularVentasNecesarias(input, r);
        const llegaEq = r.proyeccion.ganancia >= 0;
        expect(r.ritmoDiario >= n.porDiaEquilibrio! - 1e-6).toBe(llegaEq);
        const llegaObj = r.proyeccion.rentabilidad >= 0.25 - 1e-9;
        expect(r.ritmoDiario >= n.porDia! - 1e-6).toBe(llegaObj);
      }
    }
  });
});
