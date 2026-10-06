import { supabase } from '@/lib/supabase/client';
import type { MetaVentasMes } from '@/lib/metas/dinamica';

const mapear = (r: { mes: string; equilibrio_sellos: number; objetivo_sellos: number; objetivo_pct: number; actualizado_at: string }): MetaVentasMes => ({
  mes: r.mes,
  equilibrioSellos: Number(r.equilibrio_sellos),
  objetivoSellos: Number(r.objetivo_sellos),
  objetivoPct: Number(r.objetivo_pct),
  actualizadoAt: r.actualizado_at,
});

/** Meta del mes o, si todavía no se publicó, la última anterior (null si no hay ninguna). */
export async function fetchMetaVentasVigente(mes: string): Promise<MetaVentasMes | null> {
  const { data, error } = await supabase
    .from('metas_ventas')
    .select('mes, equilibrio_sellos, objetivo_sellos, objetivo_pct, actualizado_at')
    .lte('mes', mes)
    .order('mes', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapear(data) : null;
}

/** La publica Economía (cuenta dueña). Solo cantidades de sellos. */
export async function publicarMetaVentas(meta: { mes: string; equilibrioSellos: number; objetivoSellos: number; objetivoPct: number }): Promise<void> {
  const { error } = await supabase.from('metas_ventas').upsert(
    {
      mes: meta.mes,
      equilibrio_sellos: Math.round(meta.equilibrioSellos),
      objetivo_sellos: Math.round(meta.objetivoSellos),
      objetivo_pct: meta.objetivoPct,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: 'mes' },
  );
  if (error) throw error;
}
