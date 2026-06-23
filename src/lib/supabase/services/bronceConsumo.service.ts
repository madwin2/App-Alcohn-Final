import { supabase } from '../client';
import {
  isPlanchuelaRef,
  PLANCHUELA_REF_ORDER,
  planchuelaRefLabel,
  type PlanchuelaRef,
} from '@/lib/bronce/planchuelaRef';

export type BronceConsumoMesRow = {
  tipoRef: PlanchuelaRef;
  label: string;
  totalCm: number;
  totalPesos: number;
  sellosCount: number;
};

export type BronceConsumoMesResumen = {
  year: number;
  month: number;
  rows: BronceConsumoMesRow[];
  totalCm: number;
  totalPesos: number;
  totalSellos: number;
};

const TZ = 'America/Argentina/Buenos_Aires';

function monthBoundsArgentina(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  return {
    start: `${year}-${pad(month)}-01T00:00:00-03:00`,
    end: `${endYear}-${pad(endMonth)}-01T00:00:00-03:00`,
  };
}

export function formatMesAnio(year: number, month: number): string {
  const label = new Date(year, month - 1, 15).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function getBronceConsumoMes(
  year: number,
  month: number,
): Promise<BronceConsumoMesResumen> {
  const { start, end } = monthBoundsArgentina(year, month);

  const { data, error } = await supabase
    .from('bronce_consumo')
    .select('tipo_planchuela_ref, largo_cm, costo_pesos')
    .gte('consumed_at', start)
    .lt('consumed_at', end);

  if (error) throw error;

  const acc = new Map<PlanchuelaRef, BronceConsumoMesRow>();

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
    const entry = acc.get(ref)!;
    entry.totalCm += Number(row.largo_cm) || 0;
    entry.totalPesos += Number(row.costo_pesos) || 0;
    entry.sellosCount += 1;
  }

  const rows = PLANCHUELA_REF_ORDER.map((ref) => acc.get(ref)!)
    .filter((r) => r.sellosCount > 0);

  return {
    year,
    month,
    rows,
    totalCm: rows.reduce((s, r) => s + r.totalCm, 0),
    totalPesos: rows.reduce((s, r) => s + r.totalPesos, 0),
    totalSellos: rows.reduce((s, r) => s + r.sellosCount, 0),
  };
}
