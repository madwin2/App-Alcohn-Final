/** Normaliza texto del portal Andreani para comparar estados. */
function norm(estado: string): string {
  return estado
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todavía en depósito Andreani — se puede imprimir etiqueta. */
export function isPendienteIngreso(estadoPortal: string): boolean {
  const n = norm(estadoPortal);
  if (!n) return true;
  return /pendiente\s*(de\s*)?ingreso/.test(n);
}

/**
 * Si el portal ya no dice "Pendiente de ingreso", el paquete salió → Despachado.
 * (En camino, entregado, etc.)
 */
export function shouldMarkDespachado(estadoPortal: string): boolean {
  const n = norm(estadoPortal);
  if (!n) return false;
  return !isPendienteIngreso(n);
}
