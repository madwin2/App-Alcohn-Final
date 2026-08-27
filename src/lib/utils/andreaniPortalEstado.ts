/** Normaliza estado del portal Andreani para comparar. */
function norm(estado: string): string {
  return estado
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todavía en depósito — se puede imprimir/descargar etiqueta. */
export const isPendienteIngresoPortal = (estadoPortal: string | null | undefined): boolean => {
  if (!estadoPortal?.trim()) return true;
  return /pendiente\s*(de\s*)?ingreso/.test(norm(estadoPortal));
};

export const isDespachadoEnApp = (estadoEnvio: string | null | undefined): boolean =>
  estadoEnvio === 'Despachado' || estadoEnvio === 'Seguimiento Enviado';

/** Fila visible en la tabla de etiquetas activas (no despachada / no en camino). */
export const isEtiquetaActivaEnTabla = (row: {
  estadoPortal: string | null;
  estadoEnvio: string | null;
}): boolean => {
  if (isDespachadoEnApp(row.estadoEnvio)) return false;
  if (!isPendienteIngresoPortal(row.estadoPortal)) return false;
  return true;
};
