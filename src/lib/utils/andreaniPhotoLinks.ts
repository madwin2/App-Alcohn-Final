/** Ventana usable del pool, alineada con `asignar_link_andreani` (30 h). */
export const ANDREANI_LINK_FRESH_HOURS = 30;

export function andreaniLinkFreshSinceIso(now = Date.now()): string {
  return new Date(now - ANDREANI_LINK_FRESH_HOURS * 60 * 60 * 1000).toISOString();
}

export function isEmpresaAndreani(empresa: string | null | undefined): boolean {
  return typeof empresa === 'string' && empresa.toLowerCase().includes('andreani');
}

export type StampForAndreaniPhotoCheck = {
  id: string;
  ordenId: string;
  hasPhoto: boolean;
};

/**
 * Pedidos Andreani que, al asignar estas fotos, quedarían completos (último sello)
 * y todavía no tienen un link fresco. Un link por pedido, no por sello.
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
    const alreadyComplete = orderStamps.every((stamp) => stamp.hasPhoto);
    if (alreadyComplete) continue;
    const completes = orderStamps.every(
      (stamp) => stamp.hasPhoto || assigning.has(stamp.id),
    );
    const touches = orderStamps.some((stamp) => assigning.has(stamp.id));
    if (completes && touches) needing.push(orderId);
  }
  return needing;
}
