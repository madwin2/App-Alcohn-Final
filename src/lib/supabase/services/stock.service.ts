import { supabase } from '../client';

export type StockItemKey =
  | 'CAJA_ABECEDARIO'
  | 'SOPORTE_ABECEDARIO'
  | 'MANGO_GOLPE'
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

interface StockMovementInsert {
  stock_item_id: string;
  movement_type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  note: string | null;
  order_id?: string | null;
}

const DEFAULT_STOCK_ITEMS: Array<{ key: StockItemKey; name: string }> = [
  { key: 'CAJA_ABECEDARIO', name: 'Caja de Abecedario' },
  { key: 'SOPORTE_ABECEDARIO', name: 'Soporte de Abecedario' },
  { key: 'MANGO_GOLPE', name: 'Mango de Golpe' },
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

export type MinimalOrderItem = {
  itemType?: string;
  stampType?: string;
  itemConfig?: { soldadorPower?: '100W' | '200W' } | null;
};

const BASE_REQUIREMENTS: Record<Exclude<StockItemKey, 'SOLDADOR_100W' | 'SOLDADOR_200W' | 'SOLDADOR_ADAPTADO_100W' | 'SOLDADOR_ADAPTADO_200W'>, number> = {
  CAJA_ABECEDARIO: 0,
  SOPORTE_ABECEDARIO: 0,
  MANGO_GOLPE: 0,
  TUERCA: 0,
  VARILLA: 0,
  PRISIONERO: 0,
  MANGO: 0,
  TUBO_80MM: 0,
  TUBO_125MM: 0,
};

const mapStockRow = (row: any): StockItem => ({
  id: row.id,
  itemKey: row.item_key,
  itemName: row.item_name,
  quantity: Number(row.quantity ?? 0),
  minQuantity: Number(row.min_quantity ?? 0),
  updatedAt: row.updated_at,
});

export const ensureDefaultStockItems = async (): Promise<void> => {
  const { data, error } = await supabase
    .from('stock_items')
    .select('item_key');

  if (error) throw error;

  const existing = new Set((data ?? []).map((row: any) => row.item_key as StockItemKey));
  const missing = DEFAULT_STOCK_ITEMS.filter((item) => !existing.has(item.key));
  if (!missing.length) return;

  const { error: insertError } = await supabase
    .from('stock_items')
    .insert(
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

export const setStockQuantity = async (itemId: string, quantity: number): Promise<void> => {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const { error } = await supabase
    .from('stock_items')
    .update({ quantity: safeQuantity })
    .eq('id', itemId);

  if (error) throw error;
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
  const { data, error } = await supabase
    .from('stock_alert_assignments')
    .select('item_key,user_id');

  if (error) throw error;

  const out = {} as Record<StockItemKey, string[]>;
  for (const row of data ?? []) {
    const key = row.item_key as StockItemKey;
    if (!out[key]) out[key] = [];
    out[key].push(row.user_id);
  }
  return out;
};

export const setAssignmentForItem = async (itemKey: StockItemKey, userIds: string[]): Promise<void> => {
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

/** Requisitos de una línea (sello) según el mismo BOM que el consumo al enviar. */
export const requirementsForOrderItem = (item: MinimalOrderItem): Record<StockItemKey, number> => {
  const requirements: Record<StockItemKey, number> = {
    ...BASE_REQUIREMENTS,
    SOLDADOR_100W: 0,
    SOLDADOR_200W: 0,
    SOLDADOR_ADAPTADO_100W: 0,
    SOLDADOR_ADAPTADO_200W: 0,
  };

  const itemType = item.itemType ?? 'SELLO';
  if (itemType === 'ABECEDARIO' || item.stampType === 'ABC') {
    requirements.TUBO_125MM += 1;
    requirements.MANGO += 1;
    requirements.VARILLA += 1;
    requirements.PRISIONERO += 1;
    requirements.TUERCA += 1;
    requirements.SOPORTE_ABECEDARIO += 1;
    requirements.CAJA_ABECEDARIO += 1;
    return requirements;
  }

  if (itemType === 'SOLDADOR') {
    const power = item.itemConfig?.soldadorPower === '200W' ? '200W' : '100W';
    if (power === '200W') {
      requirements.SOLDADOR_ADAPTADO_200W += 1;
    } else {
      requirements.SOLDADOR_ADAPTADO_100W += 1;
    }
    return requirements;
  }

  if (itemType === 'MANGO_GOLPE') {
    requirements.MANGO_GOLPE += 1;
    return requirements;
  }

  requirements.TUBO_80MM += 1;
  requirements.PRISIONERO += 1;
  requirements.VARILLA += 1;
  requirements.MANGO += 1;
  requirements.TUERCA += 1;
  return requirements;
};

const addRequirementRecords = (
  acc: Record<StockItemKey, number>,
  next: Record<StockItemKey, number>,
) => {
  (Object.keys(next) as StockItemKey[]).forEach((key) => {
    acc[key] = (acc[key] ?? 0) + next[key];
  });
};

const calculateRequirements = (items: MinimalOrderItem[]) => {
  const requirements: Record<StockItemKey, number> = {
    ...BASE_REQUIREMENTS,
    SOLDADOR_100W: 0,
    SOLDADOR_200W: 0,
    SOLDADOR_ADAPTADO_100W: 0,
    SOLDADOR_ADAPTADO_200W: 0,
  };

  for (const item of items) {
    addRequirementRecords(requirements, requirementsForOrderItem(item));
  }

  return requirements;
};

/** Suma de insumos necesarios para cubrir todos los sellos de órdenes aún no enviadas (seguimiento distinto de «Seguimiento Enviado»). */
export const getPendingShipmentStockDemand = async (): Promise<Record<StockItemKey, number>> => {
  const empty: Record<StockItemKey, number> = {
    ...BASE_REQUIREMENTS,
    SOLDADOR_100W: 0,
    SOLDADOR_200W: 0,
    SOLDADOR_ADAPTADO_100W: 0,
    SOLDADOR_ADAPTADO_200W: 0,
  };

  // Incluye NULL: un pedido sin estado_envio cargado sigue contando como pendiente de envío.
  const { data: pendingOrders, error: ordenesError } = await supabase
    .from('ordenes')
    .select('id')
    .or('estado_envio.is.null,estado_envio.neq.Seguimiento Enviado');

  if (ordenesError) throw ordenesError;
  const ordenIds = (pendingOrders ?? []).map((r) => r.id);
  if (!ordenIds.length) return empty;

  const { data: sellosRows, error: sellosError } = await supabase
    .from('sellos')
    .select('item_type, tipo, item_config')
    .in('orden_id', ordenIds);

  if (sellosError) throw sellosError;

  const totals: Record<StockItemKey, number> = {
    ...empty,
  };

  for (const row of sellosRows ?? []) {
    const item: MinimalOrderItem = {
      itemType: (row as any).item_type ?? 'SELLO',
      stampType: (row as any).tipo === 'ABC' ? 'ABC' : 'CLASICO',
      itemConfig: ((row as any).item_config as Record<string, unknown> | null) ?? undefined,
    };
    addRequirementRecords(totals, requirementsForOrderItem(item));
  }

  return totals;
};

const insertMovements = async (movements: StockMovementInsert[]) => {
  if (!movements.length) return;
  const { error } = await supabase.from('stock_movements').insert(movements);
  if (error) throw error;
};

export const consumeStockForOrderWhenTrackingSent = async (params: {
  orderId: string;
  orderLabel: string;
  items: MinimalOrderItem[];
}): Promise<{ ok: true } | { ok: false; missing: Array<{ key: StockItemKey; name: string; required: number; available: number }> }> => {
  await ensureDefaultStockItems();

  const requirements = calculateRequirements(params.items);
  const requiredEntries = Object.entries(requirements).filter(([, qty]) => qty > 0) as Array<[StockItemKey, number]>;
  if (!requiredEntries.length) return { ok: true };

  const { data: stockRows, error: stockError } = await supabase
    .from('stock_items')
    .select('*');
  if (stockError) throw stockError;

  const stockByKey = new Map<StockItemKey, any>();
  for (const row of stockRows ?? []) {
    stockByKey.set(row.item_key as StockItemKey, row);
  }

  const missing: Array<{ key: StockItemKey; name: string; required: number; available: number }> = [];

  for (const [key, required] of requiredEntries) {
    if (key === 'SOLDADOR_ADAPTADO_100W' || key === 'SOLDADOR_ADAPTADO_200W') continue;
    const row = stockByKey.get(key);
    const available = Number(row?.quantity ?? 0);
    if (available < required) {
      missing.push({
        key,
        name: row?.item_name ?? key,
        required,
        available,
      });
    }
  }

  const checkSoldadorPower = (adaptedKey: 'SOLDADOR_ADAPTADO_100W' | 'SOLDADOR_ADAPTADO_200W', rawKey: 'SOLDADOR_100W' | 'SOLDADOR_200W') => {
    const needed = requirements[adaptedKey];
    if (needed <= 0) return;
    const adaptedAvailable = Number(stockByKey.get(adaptedKey)?.quantity ?? 0);
    const rawAvailable = Number(stockByKey.get(rawKey)?.quantity ?? 0);
    const totalCover = adaptedAvailable + rawAvailable;
    if (totalCover < needed) {
      const label = stockByKey.get(adaptedKey)?.item_name ?? adaptedKey;
      missing.push({
        key: adaptedKey,
        name: label,
        required: needed,
        available: totalCover,
      });
    }
  };

  checkSoldadorPower('SOLDADOR_ADAPTADO_100W', 'SOLDADOR_100W');
  checkSoldadorPower('SOLDADOR_ADAPTADO_200W', 'SOLDADOR_200W');

  if (missing.length) {
    await createMissingStockTasks(params.orderId, params.orderLabel, missing);
    return { ok: false, missing };
  }

  const movements: StockMovementInsert[] = [];
  const updates: Array<{ id: string; quantity: number }> = [];

  for (const [key, required] of requiredEntries) {
    if (key === 'SOLDADOR_ADAPTADO_100W' || key === 'SOLDADOR_ADAPTADO_200W') continue;
    const row = stockByKey.get(key);
    const nextQty = Number(row.quantity) - required;
    updates.push({ id: row.id, quantity: nextQty });
    movements.push({
      stock_item_id: row.id,
      movement_type: 'OUT',
      quantity: required,
      note: `Consumo por envío (${params.orderLabel})`,
      order_id: params.orderId,
    });
  }

  const consumeSoldadorPower = (
    adaptedKey: 'SOLDADOR_ADAPTADO_100W' | 'SOLDADOR_ADAPTADO_200W',
    rawKey: 'SOLDADOR_100W' | 'SOLDADOR_200W',
  ) => {
    const needed = requirements[adaptedKey];
    if (needed <= 0) return;
    const adaptedRow = stockByKey.get(adaptedKey);
    const rawRow = stockByKey.get(rawKey);
    const adaptedAvailable = Number(adaptedRow.quantity ?? 0);
    const consumeAdapted = Math.min(adaptedAvailable, needed);
    const adaptFromRaw = needed - consumeAdapted;

    if (consumeAdapted > 0) {
      updates.push({
        id: adaptedRow.id,
        quantity: adaptedAvailable - consumeAdapted,
      });
      movements.push({
        stock_item_id: adaptedRow.id,
        movement_type: 'OUT',
        quantity: consumeAdapted,
        note: `Consumo soldador adaptado por envío (${params.orderLabel})`,
        order_id: params.orderId,
      });
    }

    if (adaptFromRaw > 0) {
      const rawAvailable = Number(rawRow.quantity ?? 0);
      updates.push({
        id: rawRow.id,
        quantity: rawAvailable - adaptFromRaw,
      });
      movements.push({
        stock_item_id: rawRow.id,
        movement_type: 'OUT',
        quantity: adaptFromRaw,
        note: `Consumo para adaptar soldador y enviar (${params.orderLabel})`,
        order_id: params.orderId,
      });
    }
  };

  consumeSoldadorPower('SOLDADOR_ADAPTADO_100W', 'SOLDADOR_100W');
  consumeSoldadorPower('SOLDADOR_ADAPTADO_200W', 'SOLDADOR_200W');

  for (const update of updates) {
    const { error: upErr } = await supabase
      .from('stock_items')
      .update({ quantity: update.quantity })
      .eq('id', update.id);
    if (upErr) throw upErr;
  }

  await insertMovements(movements);
  return { ok: true };
};

const createMissingStockTasks = async (
  orderId: string,
  orderLabel: string,
  missing: Array<{ key: StockItemKey; name: string; required: number; available: number }>,
) => {
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('stock_alert_assignments')
    .select('item_key,user_id')
    .in('item_key', missing.map((item) => item.key));
  if (assignmentError) throw assignmentError;

  const assignedUsers = new Set<string>((assignmentRows ?? []).map((row: any) => row.user_id));
  if (!assignedUsers.size) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const creatorId = user?.id;
  if (!creatorId) return;

  const shortageText = missing
    .map((item) => `${item.name}: faltan ${item.required - item.available}`)
    .join(' | ');

  const taskText = `Stock faltante para pedido ${orderLabel}: ${shortageText}`;
  const inserts = Array.from(assignedUsers).map((userId) => ({
    asignado_a_user_id: userId,
    creado_por_user_id: creatorId,
    texto: taskText,
  }));

  const { error: insertError } = await supabase
    .from('tareas_dashboard')
    .insert(inserts);
  if (insertError) throw insertError;
};
