import { supabase } from '../client';
import { notifyStockBajo, notifyStockBajoResuelto } from '@/lib/notificaciones/events';

export type StockItemKey =
  | 'CAJA_ABECEDARIO'
  | 'SOPORTE_ABECEDARIO'
  | 'MANGO_GOLPE'
  | 'ALUMINIO_PARA_BASE'
  | 'BASE_REMACHADORA'
  | 'SOLDADOR_100W'
  | 'SOLDADOR_200W'
  | 'SOLDADOR_ADAPTADO_100W'
  | 'SOLDADOR_ADAPTADO_200W'
  | 'TUERCA'
  | 'VARILLA'
  | 'PRISIONERO'
  | 'MANGO'
  | 'TUBO_80MM'
  | 'TUBO_125MM';

export interface StockItem {
  id: string;
  itemKey: StockItemKey;
  itemName: string;
  quantity: number;
  minQuantity: number;
  updatedAt: string;
}

const DEFAULT_STOCK_ITEMS: Array<{ key: StockItemKey; name: string }> = [
  { key: 'CAJA_ABECEDARIO', name: 'Caja de Abecedario' },
  { key: 'SOPORTE_ABECEDARIO', name: 'Soporte de Abecedario' },
  { key: 'MANGO_GOLPE', name: 'Mango de Golpe' },
  { key: 'ALUMINIO_PARA_BASE', name: 'Aluminio para Base' },
  { key: 'BASE_REMACHADORA', name: 'Base Remachadora' },
  { key: 'SOLDADOR_100W', name: 'Soldador 100W' },
  { key: 'SOLDADOR_200W', name: 'Soldador 200W' },
  { key: 'SOLDADOR_ADAPTADO_100W', name: 'Soldador Adaptado 100W' },
  { key: 'SOLDADOR_ADAPTADO_200W', name: 'Soldador Adaptado 200W' },
  { key: 'TUERCA', name: 'Tuercas' },
  { key: 'VARILLA', name: 'Varillas' },
  { key: 'PRISIONERO', name: 'Prisioneros' },
  { key: 'MANGO', name: 'Mango' },
  { key: 'TUBO_80MM', name: 'Tubos 80mm' },
  { key: 'TUBO_125MM', name: 'Tubos 125mm' },
];

const BASE_REQUIREMENTS: Record<
  Exclude<
    StockItemKey,
    'SOLDADOR_100W' | 'SOLDADOR_200W' | 'SOLDADOR_ADAPTADO_100W' | 'SOLDADOR_ADAPTADO_200W'
  >,
  number
> = {
  CAJA_ABECEDARIO: 0,
  SOPORTE_ABECEDARIO: 0,
  MANGO_GOLPE: 0,
  ALUMINIO_PARA_BASE: 0,
  BASE_REMACHADORA: 0,
  TUERCA: 0,
  VARILLA: 0,
  PRISIONERO: 0,
  MANGO: 0,
  TUBO_80MM: 0,
  TUBO_125MM: 0,
};

const emptyRequirements = (): Record<StockItemKey, number> => ({
  ...BASE_REQUIREMENTS,
  SOLDADOR_100W: 0,
  SOLDADOR_200W: 0,
  SOLDADOR_ADAPTADO_100W: 0,
  SOLDADOR_ADAPTADO_200W: 0,
});

const mapStockRow = (row: any): StockItem => ({
  id: row.id,
  itemKey: row.item_key,
  itemName: row.item_name,
  quantity: Number(row.quantity ?? 0),
  minQuantity: Number(row.min_quantity ?? 0),
  updatedAt: row.updated_at,
});

export const ensureDefaultStockItems = async (): Promise<void> => {
  const { data, error } = await supabase.from('stock_items').select('item_key');

  if (error) throw error;

  const existing = new Set((data ?? []).map((row: any) => row.item_key as StockItemKey));
  const missing = DEFAULT_STOCK_ITEMS.filter((item) => !existing.has(item.key));
  if (!missing.length) return;

  const { error: insertError } = await supabase.from('stock_items').insert(
    missing.map((item) => ({
      item_key: item.key,
      item_name: item.name,
      quantity: 0,
      min_quantity: 0,
    })),
  );

  if (insertError) throw insertError;
};

export const getStockItems = async (): Promise<StockItem[]> => {
  await ensureDefaultStockItems();
  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .order('item_name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapStockRow);
};

/** Conteo físico: deja la cantidad contada y registra ADJUSTMENT (BR-STK-006). */
export const adjustStockCount = async (
  itemKey: StockItemKey,
  quantity: number,
  note?: string,
): Promise<number> => {
  const safe = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const { data, error } = await supabase.rpc('adjust_stock_count', {
    p_item_key: itemKey,
    p_new_quantity: safe,
    p_note: note ?? null,
  });
  if (error) throw error;
  return Number(data ?? safe);
};

export const setStockMinQuantity = async (itemId: string, minQuantity: number): Promise<void> => {
  const safeQuantity = Number.isFinite(minQuantity) ? Math.max(0, Math.floor(minQuantity)) : 0;
  const { error } = await supabase
    .from('stock_items')
    .update({ min_quantity: safeQuantity })
    .eq('id', itemId);

  if (error) throw error;
};

export const getStockAssignments = async (): Promise<Record<StockItemKey, string[]>> => {
  const { data, error } = await supabase.from('stock_alert_assignments').select('item_key,user_id');

  if (error) throw error;

  const out = {} as Record<StockItemKey, string[]>;
  for (const row of data ?? []) {
    const key = row.item_key as StockItemKey;
    if (!out[key]) out[key] = [];
    out[key].push(row.user_id);
  }
  return out;
};

export const setAssignmentForItem = async (
  itemKey: StockItemKey,
  userIds: string[],
): Promise<void> => {
  const { error: delError } = await supabase
    .from('stock_alert_assignments')
    .delete()
    .eq('item_key', itemKey);
  if (delError) throw delError;

  if (!userIds.length) return;

  const { error: insError } = await supabase
    .from('stock_alert_assignments')
    .insert(userIds.map((userId) => ({ item_key: itemKey, user_id: userId })));
  if (insError) throw insError;
};

/**
 * Demanda pendiente (BR-STK-003): insumos de órdenes no enviadas, creadas hace ≤60 días
 * o con ítems Deudor, que todavía no tuvieron descuento OUT.
 * Fuente: RPC `get_pending_stock_demand` (BOM en SQL).
 */
export const getPendingShipmentStockDemand = async (): Promise<Record<StockItemKey, number>> => {
  const empty = emptyRequirements();
  const { data, error } = await supabase.rpc('get_pending_stock_demand');
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ item_key: string; qty: number | string }>) {
    const key = row.item_key as StockItemKey;
    if (key in empty) empty[key] = Number(row.qty) || 0;
  }
  return empty;
};

/** Marca payloads de tareas de reposición guardados en `tareas_dashboard.texto */
export const STOCK_REPLENISH_MARKER = '[STOCK_REPLENISH]';

export interface StockReplenishPayload {
  itemKey: StockItemKey;
  itemName: string;
  /** Necesario total estimado para el contexto (pedidos pendientes o pedido puntual). */
  needed: number;
  stockAlMomento: number;
  shortage: number;
  /** Presente cuando la alerta viene al intentar marcar envío sin stock. */
  orderId?: string;
  pedidoEtiqueta?: string;
}

export function formatStockReplenishTaskText(payload: StockReplenishPayload): string {
  return `${STOCK_REPLENISH_MARKER}\n${JSON.stringify(payload)}`;
}

export function parseStockReplenishTask(texto: string): StockReplenishPayload | null {
  if (!texto.startsWith(STOCK_REPLENISH_MARKER)) return null;
  try {
    const raw = texto.slice(STOCK_REPLENISH_MARKER.length).trim();
    const j = JSON.parse(raw) as StockReplenishPayload;
    if (!j.itemKey || typeof j.shortage !== 'number') return null;
    return j;
  } catch {
    return null;
  }
}

type ReplenishTaskRow = { id: string; texto: string; createdAt: string };

const fetchReplenishRowsForUser = async (uid: string): Promise<ReplenishTaskRow[]> => {
  const { data, error } = await supabase
    .from('tareas_dashboard')
    .select('id, texto, created_at')
    .eq('asignado_a_user_id', uid)
    .like('texto', `${STOCK_REPLENISH_MARKER}%`);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    texto: row.texto as string,
    createdAt: String(row.created_at ?? ''),
  }));
};

const groupReplenishRowsByItem = (
  rows: ReplenishTaskRow[],
): Map<StockItemKey, ReplenishTaskRow[]> => {
  const byKey = new Map<StockItemKey, ReplenishTaskRow[]>();
  for (const row of rows) {
    const parsed = parseStockReplenishTask(row.texto);
    if (!parsed) continue;
    const list = byKey.get(parsed.itemKey) ?? [];
    list.push(row);
    byKey.set(parsed.itemKey, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return byKey;
};

const deleteTasksByIds = async (ids: string[]): Promise<void> => {
  if (!ids.length) return;
  const { error } = await supabase.from('tareas_dashboard').delete().in('id', ids);
  if (error) throw error;
};

/**
 * Una sola tarea `[STOCK_REPLENISH]` por ítem: faltante global vs pedidos pendientes de envío.
 * También colapsa alertas viejas por pedido (`orderId`) para no repetir Mango/Varillas/etc.
 * Stock negativo suma al faltante (decisión 2026-10-01).
 */
export const syncStockReplenishTasksForCurrentUser = async (): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return;

  const uid = user.id;

  const [demand, stockItems, assignments] = await Promise.all([
    getPendingShipmentStockDemand(),
    getStockItems(),
    getStockAssignments(),
  ]);

  const stockByKey = new Map(stockItems.map((s) => [s.itemKey, s]));

  const myKeys = [
    ...new Set(
      Object.entries(assignments).flatMap(([itemKey, uids]) =>
        Array.isArray(uids) && uids.includes(uid) ? [itemKey as StockItemKey] : [],
      ),
    ),
  ];

  const existingByKey = groupReplenishRowsByItem(await fetchReplenishRowsForUser(uid));

  for (const key of myKeys) {
    const item = stockByKey.get(key);
    if (!item) continue;

    const needed = demand[key] ?? 0;
    const stockAlMomento = item.quantity;
    const shortage = Math.max(0, needed - stockAlMomento); // stock negativo suma al faltante
    const rows = existingByKey.get(key) ?? [];
    existingByKey.delete(key);

    if (shortage <= 0) {
      if (rows.length) {
        await deleteTasksByIds(rows.map((r) => r.id));
        notifyStockBajoResuelto(key);
      }
      continue;
    }

    const payload: StockReplenishPayload = {
      itemKey: key,
      itemName: item.itemName,
      needed,
      stockAlMomento,
      shortage,
    };
    const texto = formatStockReplenishTaskText(payload);
    const keep = rows[0];

    if (keep) {
      if (keep.texto !== texto) {
        const { error: upErr } = await supabase
          .from('tareas_dashboard')
          .update({ texto })
          .eq('id', keep.id);
        if (upErr) throw upErr;
      }
      await deleteTasksByIds(rows.slice(1).map((r) => r.id));
    } else {
      const { error: insErr } = await supabase.from('tareas_dashboard').insert({
        asignado_a_user_id: uid,
        creado_por_user_id: uid,
        texto,
        pos_x: 0,
        pos_y: 0,
      });
      if (insErr) throw insErr;
      notifyStockBajo({ itemKey: key, itemName: item.itemName, shortage });
    }
  }

  for (const rows of existingByKey.values()) {
    if (rows.length) await deleteTasksByIds(rows.map((r) => r.id));
  }
};

/** Sumar unidades al stock desde la tarea de reposición completada en el inicio y cerrar la tarea. */
export const applyStockInboundFromReplenishTask = async (params: {
  taskId: string;
  itemKey: StockItemKey;
  quantity: number;
}): Promise<void> => {
  const qty = Number.isFinite(params.quantity) ? Math.max(0, Math.floor(params.quantity)) : 0;
  if (qty <= 0) throw new Error('Ingresá una cantidad mayor a 0.');
  await ensureDefaultStockItems();

  const { error } = await supabase.rpc('add_stock_inbound', {
    p_item_key: params.itemKey,
    p_quantity: qty,
    p_note: 'Ingreso desde tarea de stock (dashboard)',
  });
  if (error) throw error;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    const rows =
      groupReplenishRowsByItem(await fetchReplenishRowsForUser(user.id)).get(params.itemKey) ?? [];
    const ids = rows.length ? rows.map((r) => r.id) : [params.taskId];
    await deleteTasksByIds(ids);
  } else {
    await deleteTasksByIds([params.taskId]);
  }
};
