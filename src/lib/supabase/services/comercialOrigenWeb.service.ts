import { supabase } from '../client';

/** Una fila de `v_comercial_ventas_origen_web_mensual` (migration_atribucion_ventas_origen_web.sql). */
export interface VentasOrigenWebMes {
  /** Primer día del mes, `YYYY-MM-DD` (hora Argentina). */
  mes: string;
  ventasWebCheckout: number;
  ventasWhatsappDesdeMuestraWeb: number;
  ventasWhatsappResto: number;
  ventasOriginadasWeb: number;
  facturacionOriginadaWeb: number;
  facturacionTotal: number;
}

export type VentasOrigenWebResult =
  | { available: true; meses: VentasOrigenWebMes[] }
  | { available: false; reason: string };

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapVentasOrigenWebRow(row: Record<string, unknown>): VentasOrigenWebMes {
  return {
    mes: String(row.mes ?? ''),
    ventasWebCheckout: num(row.ventas_web_checkout),
    ventasWhatsappDesdeMuestraWeb: num(row.ventas_whatsapp_desde_muestra_web),
    ventasWhatsappResto: num(row.ventas_whatsapp_resto),
    ventasOriginadasWeb: num(row.ventas_originadas_web),
    facturacionOriginadaWeb: num(row.facturacion_originada_web),
    facturacionTotal: num(row.facturacion_total),
  };
}

/**
 * Ventas originadas en la web de los últimos `meses` meses (incluido el actual):
 * checkout web pagado + pedidos por WhatsApp con muestra web en los 60 días previos.
 */
export async function fetchVentasOrigenWebMensual(meses = 6): Promise<VentasOrigenWebResult> {
  const desde = new Date();
  desde.setDate(1);
  desde.setMonth(desde.getMonth() - (meses - 1));
  const desdeKey = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('v_comercial_ventas_origen_web_mensual')
    .select('*')
    .gte('mes', desdeKey)
    .order('mes', { ascending: true });

  if (error) {
    const msg = error.message.toLowerCase();
    if (error.code === '42P01' || msg.includes('does not exist')) {
      return {
        available: false,
        reason: 'Falta aplicar migration_atribucion_ventas_origen_web.sql.',
      };
    }
    return { available: false, reason: error.message };
  }

  return {
    available: true,
    meses: (data ?? []).map((row) => mapVentasOrigenWebRow(row as Record<string, unknown>)),
  };
}
