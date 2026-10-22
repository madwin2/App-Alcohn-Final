import { supabase } from '../client';
import { isPlanchuelaRef, PLANCHUELA_REF_ORDER, type PlanchuelaRef } from '@/lib/bronce/planchuelaRef';
import {
  CONSUMO_VENTANA_DIAS,
  esUtil,
  resumenStock,
  sugerirCompra,
  type BronceEstadoPieza,
  type BroncePieza,
  type CompraSugerida,
  type ResumenAncho,
} from '@/lib/bronce/stock';
import { notifyBronceComprar, notifyBronceComprarResuelto } from '@/lib/notificaciones/events';

export interface BronceStock {
  /** false hasta el primer ingreso o conteo (el stock arranca ahí). */
  iniciado: boolean;
  piezas: BroncePieza[];
  resumen: ResumenAncho[];
  compras: CompraSugerida[];
  /** Anchos con una fila que no tuvo pieza que alcanzara desde el último conteo. */
  conteoPendiente: PlanchuelaRef[];
}

type PiezaRow = { id: string; ancho_ref: number; largo_mm: number | string; estado: string };

function toPieza(row: PiezaRow): BroncePieza | null {
  const ref = Number(row.ancho_ref);
  if (!isPlanchuelaRef(ref)) return null;
  return { id: row.id, anchoRef: ref, largoMm: Number(row.largo_mm) || 0, estado: row.estado as BronceEstadoPieza };
}

async function fetchPiezas(): Promise<BroncePieza[]> {
  const { data, error } = await supabase
    .from('bronce_piezas')
    .select('id, ancho_ref, largo_mm, estado')
    .in('estado', ['disponible', 'retazo'])
    .order('largo_mm', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toPieza(r as PiezaRow)).filter((p): p is BroncePieza => !!p);
}

async function fetchIniciado(): Promise<boolean> {
  const { count, error } = await supabase.from('bronce_piezas').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function fetchConsumoMmPorAncho(dias: number): Promise<Record<PlanchuelaRef, number>> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('bronce_consumo')
    .select('tipo_planchuela_ref, largo_cm')
    .gte('consumed_at', desde);
  if (error) throw error;
  const acc = Object.fromEntries(PLANCHUELA_REF_ORDER.map((r) => [r, 0])) as Record<PlanchuelaRef, number>;
  for (const row of data ?? []) {
    const ref = Number(row.tipo_planchuela_ref);
    if (isPlanchuelaRef(ref)) acc[ref] += (Number(row.largo_cm) || 0) * 10;
  }
  return acc;
}

async function fetchConteoPendiente(): Promise<PlanchuelaRef[]> {
  const { data, error } = await supabase
    .from('bronce_movimientos')
    .select('ancho_ref, tipo, sin_pieza, created_at')
    .or('tipo.eq.CONTEO,sin_pieza.eq.true')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const pendiente = new Set<PlanchuelaRef>();
  const revisado = new Set<PlanchuelaRef>();
  for (const row of data ?? []) {
    const ref = Number(row.ancho_ref);
    if (!isPlanchuelaRef(ref) || revisado.has(ref)) continue;
    revisado.add(ref);
    if (row.tipo !== 'CONTEO' && row.sin_pieza) pendiente.add(ref);
  }
  return PLANCHUELA_REF_ORDER.filter((r) => pendiente.has(r));
}

export async function getBronceStock(): Promise<BronceStock> {
  const [iniciado, piezas, consumo, conteoPendiente] = await Promise.all([
    fetchIniciado(),
    fetchPiezas(),
    fetchConsumoMmPorAncho(CONSUMO_VENTANA_DIAS),
    fetchConteoPendiente(),
  ]);
  const resumen = resumenStock(piezas);
  const compras = resumen.map((r) =>
    sugerirCompra({ anchoRef: r.anchoRef, utilMm: r.utilMm, consumoMm: consumo[r.anchoRef] }),
  );
  return { iniciado, piezas, resumen, compras, conteoPendiente };
}

/** Largos de las piezas útiles por ancho, para la mesa. Vacío si el stock no arrancó o falla. */
export async function getBroncePiezasUtiles(): Promise<Partial<Record<PlanchuelaRef, number[]>>> {
  try {
    const piezas = await fetchPiezas();
    const out: Partial<Record<PlanchuelaRef, number[]>> = {};
    for (const p of piezas.filter(esUtil)) (out[p.anchoRef] ??= []).push(p.largoMm);
    return out;
  } catch {
    return {};
  }
}

export async function registrarCompraBronce(
  piezas: Array<{ anchoRef: PlanchuelaRef; largoMm: number }>,
  nota?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('bronce_registrar_compra', {
    p_piezas: piezas.map((p) => ({ ancho_ref: p.anchoRef, largo_mm: p.largoMm })),
    p_nota: nota ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** `piezas` es la lista completa de lo que hay de ese ancho; lo que falta se da de baja. */
export async function guardarConteoBronce(
  anchoRef: PlanchuelaRef,
  piezas: Array<{ id?: string; largoMm: number }>,
  nota?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('bronce_guardar_conteo', {
    p_ancho_ref: anchoRef,
    p_piezas: piezas.map((p) => ({ id: p.id ?? null, largo_mm: p.largoMm })),
    p_nota: nota ?? null,
  });
  if (error) throw error;
  return Number(data) || 0;
}

/** Julián (admin) y Producción (Q-STK-008). */
async function destinatariosCompra(): Promise<string[]> {
  const [areas, admins] = await Promise.all([
    supabase.from('usuario_area').select('user_id').eq('area', 'produccion'),
    supabase.from('perfiles_equipo').select('user_id').eq('es_admin', true),
  ]);
  const ids = new Set<string>();
  for (const row of [...(areas.data ?? []), ...(admins.data ?? [])]) {
    if (row.user_id) ids.add(row.user_id as string);
  }
  return [...ids];
}

/** Emite o limpia el aviso de compra por ancho. Se llama al abrir Stock o el Inicio. */
export async function syncBronceCompraAvisos(stock?: BronceStock): Promise<void> {
  try {
    const actual = stock ?? (await getBronceStock());
    if (!actual.iniciado) return;
    const avisar = actual.compras.filter((c) => c.avisar);
    const userIds = avisar.length ? await destinatariosCompra() : [];
    for (const compra of actual.compras) {
      if (compra.avisar) notifyBronceComprar(compra, userIds);
      else notifyBronceComprarResuelto(compra.anchoRef);
    }
  } catch (error) {
    console.error('Error sincronizando avisos de bronce:', error);
  }
}
