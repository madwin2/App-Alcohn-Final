/**
 * Gastos automáticos (Meta Ads, Google Ads, OpenAI, recurrentes) → pesos para Economía.
 *
 * Reglas (PLAN_CONTROL_GASTOS.md, decisiones del dueño 2026-10-05):
 * - El gasto pertenece al mes en que ocurrió (fecha del registro).
 * - Los USD valen en pesos según el blue del día en que se PAGAN. Mientras el mes no está pagado
 *   (o lo que falte pagar) se valúa con el blue de hoy → "estimado".
 * - En su categoría va gasto + IVA; el resto de recargos (IIBB, sellos…) va a `impuestos`
 *   como `otrosImpuestosUsdPct` sobre la base en pesos de los USD.
 */
import { emptyBundle, getBundleForMonth, type MonthCostsBundle } from '@/lib/gastos/monthlyEconomiaCosts';

export type GastoAutoCategoria = 'publicidad' | 'automatizaciones' | 'gastos_varios';
export type GastoMoneda = 'USD' | 'ARS';
export type GastoProveedor = 'meta_ads' | 'google_ads' | 'openai' | 'recurrente' | 'manual';

export const GASTO_AUTO_CATEGORIAS: GastoAutoCategoria[] = ['publicidad', 'automatizaciones', 'gastos_varios'];

export const PROVEEDOR_LABEL: Record<GastoProveedor, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  openai: 'OpenAI',
  recurrente: 'Recurrente',
  manual: 'Manual',
};

export const CATEGORIA_LABEL: Record<GastoAutoCategoria, string> = {
  publicidad: 'Publicidad',
  automatizaciones: 'Automatizaciones',
  gastos_varios: 'Gastos varios',
};

export type GastoRegistro = {
  id: string;
  fecha: string; // YYYY-MM-DD
  proveedor: GastoProveedor;
  categoria: GastoAutoCategoria;
  concepto: string;
  externalRef: string;
  moneda: GastoMoneda;
  monto: number;
  ivaAplica: boolean;
};

export type PagoUsd = {
  id: string;
  mes: string; // YYYY-MM
  fecha: string;
  usd: number;
  cotizacion: number;
  nota?: string | null;
};

export type ControlGastosConfig = {
  objetivoRentabilidad: number;
  ivaPct: number;
  otrosImpuestosUsdPct: number;
  fechaInicio: string; // YYYY-MM-DD
};

export const DEFAULT_CONTROL_GASTOS_CONFIG: ControlGastosConfig = {
  objetivoRentabilidad: 0.25,
  ivaPct: 0.21,
  otrosImpuestosUsdPct: 0.02,
  fechaInicio: '2026-09-29',
};

export type EstadoPagoUsd = 'sin_usd' | 'estimado' | 'parcial' | 'pagado';

export type ConceptoValuado = {
  proveedor: GastoProveedor;
  categoria: GastoAutoCategoria;
  concepto: string;
  moneda: GastoMoneda;
  montoOriginal: number;
  /** Pesos con IVA (si aplica). */
  ars: number;
};

export type ValuacionMes = {
  mes: string;
  usdBase: number;
  usdPagado: number;
  usdPendiente: number;
  /** ARS por USD promedio (pagos + pendiente a blue de hoy). 0 si no hay USD. */
  cotizacionEfectiva: number;
  /** true si hay USD pendientes y no se conoce el blue de hoy (valuados a la última cotización disponible). */
  sinCotizacionHoy: boolean;
  estado: EstadoPagoUsd;
  /** Pesos con IVA por categoría. */
  porCategoria: Record<GastoAutoCategoria, number>;
  /** Recargos extra sobre USD (IIBB, sellos…) → categoría `impuestos` de Gastos. */
  impuestosExtra: number;
  total: number;
  conceptos: ConceptoValuado[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyPorCategoria(): Record<GastoAutoCategoria, number> {
  return { publicidad: 0, automatizaciones: 0, gastos_varios: 0 };
}

/**
 * Valúa los USD de un mes: aplica los pagos en orden de fecha (hasta cubrir la base) y lo
 * que falte, a `blueHoy`. Devuelve los pesos de la base (sin IVA) y el detalle de pago.
 */
export function valuarUsdDelMes(
  usdBase: number,
  pagos: PagoUsd[],
  blueHoy: number | null,
): { baseArs: number; usdPagado: number; usdPendiente: number; sinCotizacionHoy: boolean } {
  let pendiente = Math.max(0, usdBase);
  let baseArs = 0;
  const ordenados = [...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let ultimaCot = 0;
  for (const p of ordenados) {
    ultimaCot = p.cotizacion;
    if (pendiente <= 0) break;
    const u = Math.min(Math.max(0, p.usd), pendiente);
    baseArs += u * p.cotizacion;
    pendiente -= u;
  }
  let sinCotizacionHoy = false;
  if (pendiente > 0) {
    const cot = blueHoy && blueHoy > 0 ? blueHoy : ultimaCot;
    sinCotizacionHoy = !(blueHoy && blueHoy > 0);
    baseArs += pendiente * cot;
  }
  return {
    baseArs,
    usdPagado: Math.max(0, usdBase) - pendiente,
    usdPendiente: pendiente,
    sinCotizacionHoy,
  };
}

function estadoPago(usdBase: number, usdPagado: number): EstadoPagoUsd {
  if (usdBase <= 0) return 'sin_usd';
  if (usdPagado <= 0) return 'estimado';
  if (usdBase - usdPagado > 0.005) return 'parcial';
  return 'pagado';
}

/** Valúa todos los registros de un mes (ya filtrados por mes). */
export function valuarMes(
  mes: string,
  registros: GastoRegistro[],
  pagosDelMes: PagoUsd[],
  blueHoy: number | null,
  config: ControlGastosConfig,
): ValuacionMes {
  const usdBase = registros.filter((r) => r.moneda === 'USD').reduce((s, r) => s + (Number(r.monto) || 0), 0);
  const v = valuarUsdDelMes(usdBase, pagosDelMes, blueHoy);
  const cotizacionEfectiva = usdBase > 0 ? v.baseArs / usdBase : 0;

  const porCategoria = emptyPorCategoria();
  const conceptosMap = new Map<string, ConceptoValuado>();
  for (const r of registros) {
    const monto = Number(r.monto) || 0;
    const base = r.moneda === 'USD' ? monto * cotizacionEfectiva : monto;
    const ars = r.ivaAplica ? base * (1 + config.ivaPct) : base;
    porCategoria[r.categoria] += ars;
    const key = `${r.proveedor}|${r.categoria}|${r.concepto}|${r.moneda}`;
    const prev = conceptosMap.get(key);
    if (prev) {
      prev.montoOriginal += monto;
      prev.ars += ars;
    } else {
      conceptosMap.set(key, {
        proveedor: r.proveedor,
        categoria: r.categoria,
        concepto: r.concepto,
        moneda: r.moneda,
        montoOriginal: monto,
        ars,
      });
    }
  }

  const impuestosExtra = v.baseArs * config.otrosImpuestosUsdPct;
  for (const k of GASTO_AUTO_CATEGORIAS) porCategoria[k] = round2(porCategoria[k]);
  const total = round2(GASTO_AUTO_CATEGORIAS.reduce((s, k) => s + porCategoria[k], 0) + impuestosExtra);

  return {
    mes,
    usdBase: round2(usdBase),
    usdPagado: round2(v.usdPagado),
    usdPendiente: round2(v.usdPendiente),
    cotizacionEfectiva: round2(cotizacionEfectiva),
    sinCotizacionHoy: v.usdPendiente > 0 && v.sinCotizacionHoy,
    estado: estadoPago(usdBase, v.usdPagado),
    porCategoria,
    impuestosExtra: round2(impuestosExtra),
    total,
    conceptos: [...conceptosMap.values()]
      .map((c) => ({ ...c, montoOriginal: round2(c.montoOriginal), ars: round2(c.ars) }))
      .sort((a, b) => b.ars - a.ars),
  };
}

/** Agrupa por mes (desde `config.fechaInicio`) y valúa cada uno. */
export function valuarGastosPorMes(
  registros: GastoRegistro[],
  pagos: PagoUsd[],
  blueHoy: number | null,
  config: ControlGastosConfig,
): Record<string, ValuacionMes> {
  const porMes = new Map<string, GastoRegistro[]>();
  for (const r of registros) {
    if (r.fecha < config.fechaInicio) continue;
    const mes = r.fecha.slice(0, 7);
    const arr = porMes.get(mes) ?? [];
    arr.push(r);
    porMes.set(mes, arr);
  }
  const out: Record<string, ValuacionMes> = {};
  for (const [mes, regs] of porMes) {
    out[mes] = valuarMes(
      mes,
      regs,
      pagos.filter((p) => p.mes === mes),
      blueHoy,
      config,
    );
  }
  return out;
}

/**
 * Suma lo automático a lo cargado a mano en Gastos (solo para cálculos de Economía; no se persiste).
 * Publicidad/automatizaciones/varios se suman en su categoría; los recargos extra en `impuestos`.
 */
export function sumarGastosAutoAMeses(
  months: Record<string, MonthCostsBundle>,
  auto: Record<string, ValuacionMes>,
): Record<string, MonthCostsBundle> {
  const out: Record<string, MonthCostsBundle> = { ...months };
  for (const [mes, v] of Object.entries(auto)) {
    if (v.total <= 0) continue;
    const base = months[mes] ? getBundleForMonth(months, mes) : emptyBundle();
    const extras = { ...base.extras };
    extras.publicidad = (Number(extras.publicidad) || 0) + v.porCategoria.publicidad;
    extras.automatizaciones = (Number(extras.automatizaciones) || 0) + v.porCategoria.automatizaciones;
    extras.gastos_varios = (Number(extras.gastos_varios) || 0) + v.porCategoria.gastos_varios;
    extras.impuestos = (Number(extras.impuestos) || 0) + v.impuestosExtra;
    out[mes] = { ...base, extras };
  }
  return out;
}

/** YYYY-MM-DD menos `n` días (calendario, sin zona). */
export function restarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return dt.toISOString().slice(0, 10);
}

export function diasDelMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Gasto diario promedio de publicidad (pesos con IVA + recargos, a blue de hoy) en los
 * `dias` días completos anteriores a `hoy`. Si hay menos días con datos desde `fechaInicio`, promedia esos.
 */
export function publicidadDiariaReciente(
  registros: GastoRegistro[],
  hoy: string,
  blueHoy: number | null,
  config: ControlGastosConfig,
  dias = 7,
): number {
  const desdeTeorico = restarDias(hoy, dias);
  const desde = desdeTeorico < config.fechaInicio ? config.fechaInicio : desdeTeorico;
  if (desde >= hoy) return 0;
  const nDias = Math.round((Date.parse(hoy) - Date.parse(desde)) / 86_400_000);
  if (nDias <= 0) return 0;
  const cot = blueHoy && blueHoy > 0 ? blueHoy : 0;
  let total = 0;
  for (const r of registros) {
    if (r.categoria !== 'publicidad' || r.fecha < desde || r.fecha >= hoy) continue;
    const monto = Number(r.monto) || 0;
    const base = r.moneda === 'USD' ? monto * cot : monto;
    const conIva = r.ivaAplica ? base * (1 + config.ivaPct) : base;
    const extra = r.moneda === 'USD' ? base * config.otrosImpuestosUsdPct : 0;
    total += conIva + extra;
  }
  return total / nDias;
}

export type MesEnCursoInput = {
  mes: string;
  hoy: string; // YYYY-MM-DD (AR)
  ventas: number;
  /** Fabricación + regalos + pruebas (escala con las ventas). */
  costosVariables: number;
  /** Fijos del mes (sueldos + aguinaldo + servicios…). */
  fijos: number;
  fijosEstimados: boolean;
  /** Publicidad del mes a hoy (manual + automática). */
  publicidad: number;
  /** Resto de extras (automatizaciones, impuestos, varios, envíos manuales…). No se proyectan. */
  otros: number;
  /** Publicidad diaria reciente; si es null se proyecta lineal. */
  publicidadDiaria: number | null;
  objetivo: number;
};

export type MesEnCurso = {
  diasTranscurridos: number;
  diasMes: number;
  diasRestantes: number;
  pocosDatos: boolean;
  aHoy: { ventas: number; ganancia: number; rentabilidad: number; fijosProrrateados: number };
  proyeccion: {
    ventas: number;
    costosVariables: number;
    publicidad: number;
    ganancia: number;
    rentabilidad: number;
  };
  /** Publicidad máxima del mes para llegar al objetivo. */
  topePublicidad: number;
  publicidadRestante: number;
  /** Lo que se puede gastar por día en publicidad de acá a fin de mes para llegar al objetivo. */
  publicidadPorDia: number;
};

export function calcularMesEnCurso(i: MesEnCursoInput): MesEnCurso {
  const diasMes = diasDelMes(i.mes);
  const dia = Number(i.hoy.slice(8, 10)) || 1;
  const diasTranscurridos = Math.min(diasMes, Math.max(1, dia));
  const diasRestantes = diasMes - diasTranscurridos;
  const factor = diasMes / diasTranscurridos;

  const fijosProrrateados = (i.fijos * diasTranscurridos) / diasMes;
  const gananciaHoy = i.ventas - i.costosVariables - i.publicidad - i.otros - fijosProrrateados;

  const ventasProy = i.ventas * factor;
  const varProy = i.costosVariables * factor;
  const pubProy =
    i.publicidadDiaria != null ? i.publicidad + i.publicidadDiaria * diasRestantes : i.publicidad * factor;
  const gananciaProy = ventasProy - varProy - pubProy - i.otros - i.fijos;

  const tope = ventasProy * (1 - i.objetivo) - varProy - i.otros - i.fijos;
  const restante = tope - i.publicidad;

  return {
    diasTranscurridos,
    diasMes,
    diasRestantes,
    pocosDatos: diasTranscurridos < 5,
    aHoy: {
      ventas: i.ventas,
      ganancia: gananciaHoy,
      rentabilidad: i.ventas > 0 ? gananciaHoy / i.ventas : 0,
      fijosProrrateados,
    },
    proyeccion: {
      ventas: ventasProy,
      costosVariables: varProy,
      publicidad: pubProy,
      ganancia: gananciaProy,
      rentabilidad: ventasProy > 0 ? gananciaProy / ventasProy : 0,
    },
    topePublicidad: tope,
    publicidadRestante: restante,
    publicidadPorDia: diasRestantes > 0 ? restante / diasRestantes : restante,
  };
}

export type VentasNecesarias = {
  /** Ventas del mes que darían exactamente el objetivo (null si no es alcanzable con este costo variable). */
  ventasMes: number | null;
  /** Lo que falta vender de acá a fin de mes. */
  faltan: number | null;
  /** Por día, en los días que quedan (incluye hoy si no hay días restantes). */
  porDia: number | null;
  /** Ritmo actual de ventas por día. */
  ritmoActual: number;
};

/**
 * Ventas que harían falta para cerrar el mes en el objetivo, con la publicidad proyectada,
 * los fijos y los otros gastos dados. El costo variable se toma como % de las ventas de hoy:
 * `V = (publicidad + otros + fijos) / (1 − objetivo − variable%)`.
 */
export function calcularVentasNecesarias(i: MesEnCursoInput, r: MesEnCurso): VentasNecesarias {
  const ritmoActual = i.ventas / r.diasTranscurridos;
  const pctVariable = i.ventas > 0 ? i.costosVariables / i.ventas : 0;
  const margen = 1 - i.objetivo - pctVariable;
  if (margen <= 0) return { ventasMes: null, faltan: null, porDia: null, ritmoActual };
  const ventasMes = (r.proyeccion.publicidad + i.otros + i.fijos) / margen;
  const faltan = Math.max(0, ventasMes - i.ventas);
  return { ventasMes, faltan, porDia: faltan / Math.max(1, r.diasRestantes), ritmoActual };
}
