import { supabase } from '../client';
import {
  isPlanchuelaRef,
  PLANCHUELA_REF_ORDER,
  planchuelaRefLabel,
  type PlanchuelaRef,
} from '@/lib/bronce/planchuelaRef';

export type BronceConsumoFila = {
  tipoRef: PlanchuelaRef;
  label: string;
  totalCm: number;
  totalPesos: number;
  sellosCount: number;
};

export type BronceConsumoDiaCelda = {
  cm: number;
  pesos: number;
  sellos: number;
};

export type BronceConsumoDiaRow = {
  date: string;
  label: string;
  porPlanchuela: Record<PlanchuelaRef, BronceConsumoDiaCelda>;
  totalCm: number;
  totalPesos: number;
  totalSellos: number;
};

export type BronceConsumoResumen = {
  desde: string;
  hasta: string;
  rows: BronceConsumoFila[];
  dailyRows: BronceConsumoDiaRow[];
  totalCm: number;
  totalPesos: number;
  totalSellos: number;
};

/** @deprecated Usar BronceConsumoResumen */
export type BronceConsumoMesRow = BronceConsumoFila;

/** @deprecated Usar BronceConsumoResumen */
export type BronceConsumoMesResumen = BronceConsumoResumen & { year: number; month: number };

const TZ = 'America/Argentina/Buenos_Aires';

const pad2 = (n: number) => String(n).padStart(2, '0');

function emptyCelda(): BronceConsumoDiaCelda {
  return { cm: 0, pesos: 0, sellos: 0 };
}

function emptyPorPlanchuela(): Record<PlanchuelaRef, BronceConsumoDiaCelda> {
  return Object.fromEntries(PLANCHUELA_REF_ORDER.map((ref) => [ref, emptyCelda()])) as Record<
    PlanchuelaRef,
    BronceConsumoDiaCelda
  >;
}

export function toArgentinaDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}

export function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

export function lastDayOfMonth(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${pad2(month)}-${pad2(last)}`;
}

export function currentMonthRange(): { desde: string; hasta: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { desde: firstDayOfMonth(year, month), hasta: lastDayOfMonth(year, month) };
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

function dateRangeBoundsArgentina(desde: string, hasta: string): { start: string; end: string } {
  return {
    start: `${desde}T00:00:00-03:00`,
    end: `${addDaysToDateKey(hasta, 1)}T00:00:00-03:00`,
  };
}

export function formatFechaArgentina(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMesAnio(year: number, month: number): string {
  const label = new Date(year, month - 1, 15).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatRangoFechas(desde: string, hasta: string): string {
  if (desde === hasta) return formatFechaArgentina(desde);
  return `${formatFechaArgentina(desde)} – ${formatFechaArgentina(hasta)}`;
}

export function shiftMonthRange(desde: string, delta: number): { desde: string; hasta: string } {
  const [y, m] = desde.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return { desde: firstDayOfMonth(year, month), hasta: lastDayOfMonth(year, month) };
}

export async function getBronceConsumo(desde: string, hasta: string): Promise<BronceConsumoResumen> {
  if (desde > hasta) {
    return {
      desde,
      hasta,
      rows: [],
      dailyRows: [],
      totalCm: 0,
      totalPesos: 0,
      totalSellos: 0,
    };
  }

  const { start, end } = dateRangeBoundsArgentina(desde, hasta);

  const { data, error } = await supabase
    .from('bronce_consumo')
    .select('tipo_planchuela_ref, largo_cm, costo_pesos, consumed_at')
    .gte('consumed_at', start)
    .lt('consumed_at', end)
    .order('consumed_at', { ascending: false });

  if (error) throw error;

  const acc = new Map<PlanchuelaRef, BronceConsumoFila>();
  const dailyAcc = new Map<string, BronceConsumoDiaRow>();

  for (const ref of PLANCHUELA_REF_ORDER) {
    acc.set(ref, {
      tipoRef: ref,
      label: planchuelaRefLabel(ref),
      totalCm: 0,
      totalPesos: 0,
      sellosCount: 0,
    });
  }

  for (const row of data ?? []) {
    const ref = Number(row.tipo_planchuela_ref);
    if (!isPlanchuelaRef(ref)) continue;

    const cm = Number(row.largo_cm) || 0;
    const pesos = Number(row.costo_pesos) || 0;
    const dateKey = toArgentinaDateKey(row.consumed_at);

    const entry = acc.get(ref)!;
    entry.totalCm += cm;
    entry.totalPesos += pesos;
    entry.sellosCount += 1;

    const day =
      dailyAcc.get(dateKey) ??
      ({
        date: dateKey,
        label: formatFechaArgentina(dateKey),
        porPlanchuela: emptyPorPlanchuela(),
        totalCm: 0,
        totalPesos: 0,
        totalSellos: 0,
      } satisfies BronceConsumoDiaRow);

    const celda = day.porPlanchuela[ref];
    celda.cm += cm;
    celda.pesos += pesos;
    celda.sellos += 1;
    day.totalCm += cm;
    day.totalPesos += pesos;
    day.totalSellos += 1;
    dailyAcc.set(dateKey, day);
  }

  const rows = PLANCHUELA_REF_ORDER.map((ref) => acc.get(ref)!).filter((r) => r.sellosCount > 0);
  const dailyRows = [...dailyAcc.values()].sort((a, b) => b.date.localeCompare(a.date));

  return {
    desde,
    hasta,
    rows,
    dailyRows,
    totalCm: rows.reduce((s, r) => s + r.totalCm, 0),
    totalPesos: rows.reduce((s, r) => s + r.totalPesos, 0),
    totalSellos: rows.reduce((s, r) => s + r.sellosCount, 0),
  };
}

export async function getBronceConsumoMes(
  year: number,
  month: number,
): Promise<BronceConsumoMesResumen> {
  const desde = firstDayOfMonth(year, month);
  const hasta = lastDayOfMonth(year, month);
  const resumen = await getBronceConsumo(desde, hasta);
  return { ...resumen, year, month };
}
