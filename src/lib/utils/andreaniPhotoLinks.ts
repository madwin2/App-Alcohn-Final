/** Ventana usable del pool, alineada con `asignar_link_andreani` (30 h). */
export const ANDREANI_LINK_FRESH_HOURS = 30;

/** Misma lista que webhook-bot / trigger_accesorio_listo: no usan foto_sello en la app. */
const ACCESORIO_ITEM_TYPES = new Set(['SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA']);

export function andreaniLinkFreshSinceIso(now = Date.now()): string {
  return new Date(now - ANDREANI_LINK_FRESH_HOURS * 60 * 60 * 1000).toISOString();
}

export function isEmpresaAndreani(empresa: string | null | undefined): boolean {
  return typeof empresa === 'string' && empresa.toLowerCase().includes('andreani');
}

export function itemRequiresClientPhoto(itemType: string | null | undefined): boolean {
  const raw = itemType === null || itemType === undefined || itemType === '' ? 'SELLO' : itemType;
  return !ACCESORIO_ITEM_TYPES.has(String(raw).toUpperCase());
}

export type StampForAndreaniPhotoCheck = {
  id: string;
  ordenId: string;
  hasPhoto: boolean;
  /** false para soldador/mango/base (no bloquean “último con foto”). */
  requiresPhoto: boolean;
  /** estado_fabricacion === Hecho */
  isHecho: boolean;
};

/**
 * Pedidos Andreani que, al asignar estas fotos, dispararían el link:
 * último ítem con foto + todos los ítems Hecho + sin link fresco.
 * Un link por pedido, no por sello.
 */
export function orderIdsNeedingAndreaniLink(args: {
  assigningStampIds: Iterable<string>;
  stamps: StampForAndreaniPhotoCheck[];
  andreaniOrderIds: Iterable<string>;
  orderIdsWithFreshLink: Iterable<string>;
}): string[] {
  const assigning = new Set([...args.assigningStampIds].filter(Boolean));
  const withFresh = new Set(args.orderIdsWithFreshLink);
  const andreani = new Set(args.andreaniOrderIds);

  const byOrder = new Map<string, StampForAndreaniPhotoCheck[]>();
  for (const stamp of args.stamps) {
    if (!andreani.has(stamp.ordenId)) continue;
    const list = byOrder.get(stamp.ordenId) ?? [];
    list.push(stamp);
    byOrder.set(stamp.ordenId, list);
  }

  const needing: string[] = [];
  for (const orderId of andreani) {
    if (withFresh.has(orderId)) continue;
    const orderStamps = byOrder.get(orderId) ?? [];
    if (orderStamps.length === 0) continue;

    const photoItems = orderStamps.filter((stamp) => stamp.requiresPhoto);
    if (photoItems.length === 0) continue;

    const alreadyPhotosComplete = photoItems.every((stamp) => stamp.hasPhoto);
    if (alreadyPhotosComplete) continue;

    const photosCompleteAfter = photoItems.every(
      (stamp) => stamp.hasPhoto || assigning.has(stamp.id),
    );
    const touches = orderStamps.some((stamp) => assigning.has(stamp.id));
    const allHecho = orderStamps.every((stamp) => stamp.isHecho);
    if (photosCompleteAfter && touches && allHecho) needing.push(orderId);
  }
  return needing;
}
