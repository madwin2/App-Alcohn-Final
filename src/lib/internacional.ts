import type { Order } from '@/lib/types/index';
import { formatCurrency } from '@/lib/utils/format';

export type PaisInternacional = {
  iso2: 'MX' | 'CO' | 'PE' | 'CL';
  nombre: string;
  moneda: string;
  simbolo: string;
  /** Pesos argentinos por 1 unidad de moneda local (sale de la lista de precios). */
  arsPorUnidad: number;
  decimales: number;
};

export const PAISES_INTERNACIONALES: Record<PaisInternacional['iso2'], PaisInternacional> = {
  MX: { iso2: 'MX', nombre: 'México', moneda: 'MXN', simbolo: '$', arsPorUnidad: 73.9, decimales: 0 },
  CO: { iso2: 'CO', nombre: 'Colombia', moneda: 'COP', simbolo: '$', arsPorUnidad: 0.3883, decimales: 0 },
  PE: { iso2: 'PE', nombre: 'Perú', moneda: 'PEN', simbolo: 'S/', arsPorUnidad: 380.5, decimales: 0 },
  CL: { iso2: 'CL', nombre: 'Chile', moneda: 'CLP', simbolo: '$', arsPorUnidad: 1.39, decimales: 0 },
};

/** Lee el país desde notas_web.international (countryIso2 o, si falta, currency). */
export function paisDesdeNotasWeb(notasWeb: unknown): PaisInternacional | null {
  const intl = (notasWeb as { international?: { countryIso2?: string; currency?: string } } | null)?.international;
  if (!intl) return null;
  const iso = String(intl.countryIso2 ?? '').toUpperCase();
  if (iso in PAISES_INTERNACIONALES) return PAISES_INTERNACIONALES[iso as PaisInternacional['iso2']];
  const cur = String(intl.currency ?? '').toUpperCase();
  return Object.values(PAISES_INTERNACIONALES).find((p) => p.moneda === cur) ?? null;
}

/** Ej.: "S/ 661", "$940 MXN", "$179.000 COP". */
export function formatMontoInternacional(monto: number, pais: PaisInternacional): string {
  const n = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: pais.decimales,
  }).format(monto);
  return pais.simbolo === '$' ? `$${n} ${pais.moneda}` : `${pais.simbolo} ${n}`;
}

export function aPesos(monto: number, pais: PaisInternacional | null | undefined): number {
  return pais ? Math.round(monto * pais.arsPorUnidad) : monto;
}

/** Formatea un monto del pedido: moneda local si es internacional, ARS si no. */
export function formatMontoPedido(order: Pick<Order, 'international'>, monto: number): string {
  return order.international ? formatMontoInternacional(monto, order.international) : formatCurrency(monto);
}

/** Copia del pedido con todos los montos pasados a pesos (para Economía). */
export function pedidoEnPesos(order: Order): Order {
  const pais = order.international;
  if (!pais) return order;
  const items = order.items.map((it) => {
    const valorArs = aPesos(Number(it.itemValue || 0), pais);
    return {
      ...it,
      itemValue: valorArs,
      depositValueItem: aPesos(Number(it.depositValueItem || 0), pais),
      fabricationMarginItem: valorArs - Number(it.fabricationCostItem || 0),
    };
  });
  const totalArs = aPesos(Number(order.totalValue || 0), pais);
  return {
    ...order,
    totalValue: totalArs,
    depositValueOrder: aPesos(Number(order.depositValueOrder || 0), pais),
    restPaidAmountOrder: aPesos(Number(order.restPaidAmountOrder || 0), pais),
    paidAmountCached: aPesos(Number(order.paidAmountCached || 0), pais),
    balanceAmountCached: aPesos(Number(order.balanceAmountCached || 0), pais),
    fabricationMarginTotal: totalArs - Number(order.fabricationCostTotal || 0),
    items,
  };
}
