export const COMERCIAL_EXCLUIDO_KEY = 'excluido_comercial';

export type ComercialEntityType = 'mockup' | 'orden' | 'cliente';

export type ComercialExclusionSets = {
  mockups: Set<string>;
  ordenes: Set<string>;
  clientes: Set<string>;
};

export function emptyExclusionSets(): ComercialExclusionSets {
  return { mockups: new Set(), ordenes: new Set(), clientes: new Set() };
}

export function isJsonExcluded(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.[COMERCIAL_EXCLUIDO_KEY] === true;
}

export function withExclusionMeta(
  meta: Record<string, unknown> | null | undefined,
  motivo?: string,
): Record<string, unknown> {
  return {
    ...(meta ?? {}),
    [COMERCIAL_EXCLUIDO_KEY]: true,
    excluido_at: new Date().toISOString(),
    ...(motivo?.trim() ? { excluido_motivo: motivo.trim() } : {}),
  };
}

export function isMockupExcluded(
  mockup: { id: string; metadata_web?: Record<string, unknown> | null },
  sets: ComercialExclusionSets,
): boolean {
  return sets.mockups.has(mockup.id) || isJsonExcluded(mockup.metadata_web);
}

export function isOrdenExcluded(
  orden: { id: string; notas_web?: Record<string, unknown> | null },
  sets: ComercialExclusionSets,
): boolean {
  return sets.ordenes.has(orden.id) || isJsonExcluded(orden.notas_web);
}

export function isClienteExcluded(clienteId: string, sets: ComercialExclusionSets): boolean {
  return sets.clientes.has(clienteId);
}

export function filterMockups<T extends { id: string; metadata_web?: Record<string, unknown> | null }>(
  rows: T[],
  sets: ComercialExclusionSets,
): T[] {
  return rows.filter((r) => !isMockupExcluded(r, sets));
}

export function filterOrdenes<T extends { id: string; notas_web?: Record<string, unknown> | null }>(
  rows: T[],
  sets: ComercialExclusionSets,
): T[] {
  return rows.filter((r) => !isOrdenExcluded(r, sets));
}

export function filterClientes<T extends { id: string }>(rows: T[], sets: ComercialExclusionSets): T[] {
  return rows.filter((r) => !isClienteExcluded(r.id, sets));
}
