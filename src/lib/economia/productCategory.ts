import type { OrderItem } from '@/lib/types';
import { clasificarGrupoSelloRectangularMm } from '@/lib/precios/cotizacionMedida';
import type { SelloGrupoCodigo } from '@/lib/precios/resolverPrecioSello';

/** Categorías de producto para análisis en Economía. */
export type EconomiaProductoKey =
  | 'sello_chicos'
  | 'sello_medianos'
  | 'sello_grandes'
  | 'sello_xl'
  | 'sello_3mm'
  | 'sello_lacre'
  | 'sello_alimento'
  | 'sello_sin_grupo'
  | 'abecedario'
  | 'soldador'
  | 'mango_golpe'
  | 'base_remachadora'
  | 'otro';

export type EconomiaProductoMeta = {
  key: EconomiaProductoKey;
  label: string;
  shortLabel: string;
  /** Color CSS para charts. */
  color: string;
  group: 'sellos' | 'especiales' | 'accesorios' | 'otros';
};

export const ECONOMIA_PRODUCTO_META: readonly EconomiaProductoMeta[] = [
  { key: 'sello_chicos', label: 'Sellos chicos', shortLabel: 'Chicos', color: '#60a5fa', group: 'sellos' },
  { key: 'sello_medianos', label: 'Sellos medianos', shortLabel: 'Medianos', color: '#34d399', group: 'sellos' },
  { key: 'sello_grandes', label: 'Sellos grandes', shortLabel: 'Grandes', color: '#fbbf24', group: 'sellos' },
  { key: 'sello_xl', label: 'Sellos XL', shortLabel: 'XL', color: '#f97316', group: 'sellos' },
  { key: 'sello_3mm', label: 'Sellos 3 mm', shortLabel: '3 mm', color: '#a78bfa', group: 'especiales' },
  { key: 'sello_lacre', label: 'Sellos lacre', shortLabel: 'Lacre', color: '#f472b6', group: 'especiales' },
  { key: 'sello_alimento', label: 'Sellos alimento', shortLabel: 'Alimento', color: '#2dd4bf', group: 'especiales' },
  { key: 'sello_sin_grupo', label: 'Sellos s/ medida', shortLabel: 'S/ medida', color: '#94a3b8', group: 'sellos' },
  { key: 'abecedario', label: 'Abecedarios', shortLabel: 'ABC', color: '#818cf8', group: 'accesorios' },
  { key: 'soldador', label: 'Soldadores', shortLabel: 'Soldador', color: '#fb7185', group: 'accesorios' },
  { key: 'mango_golpe', label: 'Mango de golpe', shortLabel: 'Mango', color: '#c084fc', group: 'accesorios' },
  { key: 'base_remachadora', label: 'Base remachadora', shortLabel: 'Base', color: '#67e8f9', group: 'accesorios' },
  { key: 'otro', label: 'Otros', shortLabel: 'Otros', color: '#64748b', group: 'otros' },
] as const;

export const ECONOMIA_PRODUCTO_ORDER: EconomiaProductoKey[] = ECONOMIA_PRODUCTO_META.map((m) => m.key);

const META_BY_KEY = Object.fromEntries(ECONOMIA_PRODUCTO_META.map((m) => [m.key, m])) as Record<
  EconomiaProductoKey,
  EconomiaProductoMeta
>;

export function economiaProductoMeta(key: EconomiaProductoKey): EconomiaProductoMeta {
  return META_BY_KEY[key];
}

function itemTypeOf(item: OrderItem): OrderItem['itemType'] | 'SELLO' {
  if (item.itemType) return item.itemType;
  if (item.stampType === 'ABC') return 'ABECEDARIO';
  return 'SELLO';
}

function grupoToKey(grupo: SelloGrupoCodigo): EconomiaProductoKey {
  if (grupo === 'chicos') return 'sello_chicos';
  if (grupo === 'medianos') return 'sello_medianos';
  if (grupo === 'grandes') return 'sello_grandes';
  return 'sello_xl';
}

/** Clasifica un ítem de pedido en categoría de análisis comercial. */
export function classifyEconomiaProducto(item: OrderItem): EconomiaProductoKey {
  const type = itemTypeOf(item);

  if (type === 'ABECEDARIO' || item.stampType === 'ABC') return 'abecedario';
  if (type === 'SOLDADOR') return 'soldador';
  if (type === 'MANGO_GOLPE') return 'mango_golpe';
  if (type === 'BASE_REMACHADORA') return 'base_remachadora';

  if (type === 'SELLO' || !type) {
    if (item.stampType === '3MM') return 'sello_3mm';
    if (item.stampType === 'LACRE') return 'sello_lacre';
    if (item.stampType === 'ALIMENTO') return 'sello_alimento';

    const grupo = clasificarGrupoSelloRectangularMm(
      Number(item.requestedWidthMm) || 0,
      Number(item.requestedHeightMm) || 0,
    );
    if (grupo) return grupoToKey(grupo);
    return 'sello_sin_grupo';
  }

  return 'otro';
}

export type EconomiaProductoCell = {
  unidades: number;
  ventas: number;
  margen: number;
};

export type EconomiaProductoMonthRow = {
  key: string;
  label: string;
  byProduct: Record<EconomiaProductoKey, EconomiaProductoCell>;
  totalUnidades: number;
  totalVentas: number;
  totalMargen: number;
};

function emptyCell(): EconomiaProductoCell {
  return { unidades: 0, ventas: 0, margen: 0 };
}

function emptyByProduct(): Record<EconomiaProductoKey, EconomiaProductoCell> {
  return Object.fromEntries(ECONOMIA_PRODUCTO_ORDER.map((k) => [k, emptyCell()])) as Record<
    EconomiaProductoKey,
    EconomiaProductoCell
  >;
}

export function buildMonthlyProductBreakdown(
  months: Array<{ key: string; label: string }>,
  itemsByMonth: Array<{ monthKey: string; item: OrderItem }>,
): EconomiaProductoMonthRow[] {
  const map = new Map<string, EconomiaProductoMonthRow>();
  for (const m of months) {
    map.set(m.key, {
      key: m.key,
      label: m.label,
      byProduct: emptyByProduct(),
      totalUnidades: 0,
      totalVentas: 0,
      totalMargen: 0,
    });
  }

  for (const { monthKey, item } of itemsByMonth) {
    let row = map.get(monthKey);
    if (!row) {
      row = {
        key: monthKey,
        label: monthKey,
        byProduct: emptyByProduct(),
        totalUnidades: 0,
        totalVentas: 0,
        totalMargen: 0,
      };
      map.set(monthKey, row);
    }
    const cat = classifyEconomiaProducto(item);
    const ventas = Number(item.itemValue || 0);
    const margen = Number(item.fabricationMarginItem || 0);
    row.byProduct[cat].unidades += 1;
    row.byProduct[cat].ventas += ventas;
    row.byProduct[cat].margen += margen;
    row.totalUnidades += 1;
    row.totalVentas += ventas;
    row.totalMargen += margen;
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/** Solo categorías con al menos 1 unidad en el período. */
export function activeProductKeys(rows: EconomiaProductoMonthRow[]): EconomiaProductoKey[] {
  return ECONOMIA_PRODUCTO_ORDER.filter((k) => rows.some((r) => r.byProduct[k].unidades > 0));
}

export function sumProductAcrossMonths(
  rows: EconomiaProductoMonthRow[],
  key: EconomiaProductoKey,
): EconomiaProductoCell {
  return rows.reduce(
    (acc, r) => {
      acc.unidades += r.byProduct[key].unidades;
      acc.ventas += r.byProduct[key].ventas;
      acc.margen += r.byProduct[key].margen;
      return acc;
    },
    emptyCell(),
  );
}

export type EconomiaMetricMode = 'unidades' | 'ventas' | 'margen';

export function cellMetric(cell: EconomiaProductoCell, mode: EconomiaMetricMode): number {
  if (mode === 'ventas') return cell.ventas;
  if (mode === 'margen') return cell.margen;
  return cell.unidades;
}
