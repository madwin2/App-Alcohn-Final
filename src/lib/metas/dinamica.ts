/**
 * Meta dinámica de sellos para Inicio (decisión del dueño 2026-10-06, opción A).
 * Economía publica la meta del mes en sellos (equilibrio y objetivo, tabla `metas_ventas`);
 * acá se calcula en vivo lo de cada día con los sellos vendidos y los días hábiles,
 * con el mismo criterio que Economía → Mes en curso.
 */
import { diasHabilesDelMes, resumenHabiles, ventasPorDiaHabil } from '@/lib/gastos/diasHabiles';

export type MetaVentasMes = {
  mes: string;
  equilibrioSellos: number;
  objetivoSellos: number;
  objetivoPct: number;
  actualizadoAt: string;
};

export type MetaDelDia = {
  vendidosMes: number;
  /** Sellos imputados a hoy (incluye fines de semana/feriados anteriores si hoy es el primer hábil). */
  vendidosHoy: number;
  hoyEsHabil: boolean;
  habilesRestantes: number;
  /** Por día hábil desde hoy (incluido) para llegar a cada meta; 0 si ya se llegó. */
  necesarioPorDiaObjetivo: number;
  necesarioPorDiaEquilibrio: number;
  zona: 'perdida' | 'aceptable' | 'ideal';
};

export function metaDelDia(i: {
  meta: Pick<MetaVentasMes, 'equilibrioSellos' | 'objetivoSellos'>;
  /** Sellos por día calendario del mes en curso. */
  sellosPorDia: ReadonlyArray<{ fecha: string; sellos: number }>;
  mes: string;
  hoy: string;
  feriados: readonly string[];
}): MetaDelDia {
  const habilesMes = diasHabilesDelMes(i.mes, new Set(i.feriados));
  const h = resumenHabiles(habilesMes, i.hoy);
  const serie = ventasPorDiaHabil(
    i.sellosPorDia.map((d) => ({ fecha: d.fecha, ventas: 0, pedidos: 0, sellos: d.sellos })),
    habilesMes,
  );
  const vendidosMes = i.sellosPorDia.reduce((s, d) => s + d.sellos, 0);
  const completos = serie.filter((d) => d.fecha < i.hoy).reduce((s, d) => s + d.sellos, 0);
  const vendidosHoy = serie.find((d) => d.fecha === i.hoy)?.sellos ?? 0;
  const dias = Math.max(1, h.restantes);
  const porDia = (meta: number) => Math.max(0, meta - completos) / dias;
  const zona = vendidosMes >= i.meta.objetivoSellos ? 'ideal' : vendidosMes >= i.meta.equilibrioSellos ? 'aceptable' : 'perdida';
  return {
    vendidosMes,
    vendidosHoy,
    hoyEsHabil: h.hoyEsHabil,
    habilesRestantes: h.restantes,
    necesarioPorDiaObjetivo: porDia(i.meta.objetivoSellos),
    necesarioPorDiaEquilibrio: porDia(i.meta.equilibrioSellos),
    zona,
  };
}
