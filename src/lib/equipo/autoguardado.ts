/**
 * Cola de autoguardado con debounce: evita pisar el editor con respuestas
 * viejas y permite flush al salir / cambiar de nota.
 */

export type PatchAutoguardado = {
  titulo: string;
  contenido: string;
  fijada: boolean;
};

export type PendienteAutoguardado = {
  id: string;
  patch: PatchAutoguardado;
  version: number;
};

export type EstadoColaAutoguardado = {
  pendiente: PendienteAutoguardado | null;
  /** Última versión enviada (o programada) por id de nota. */
  versiones: Record<string, number>;
};

export function colaAutoguardadoVacia(): EstadoColaAutoguardado {
  return { pendiente: null, versiones: {} };
}

/** Encola un patch; sube la versión de esa nota. */
export function encolarAutoguardado(
  estado: EstadoColaAutoguardado,
  id: string,
  patch: PatchAutoguardado,
): EstadoColaAutoguardado {
  const version = (estado.versiones[id] ?? 0) + 1;
  return {
    pendiente: { id, patch, version },
    versiones: { ...estado.versiones, [id]: version },
  };
}

/**
 * Saca el pendiente para enviarlo. Si `id` está definido, solo flushea esa nota.
 * Devuelve null si no hay nada (o no coincide el id).
 */
export function flushAutoguardado(
  estado: EstadoColaAutoguardado,
  id?: string,
): { estado: EstadoColaAutoguardado; enviado: PendienteAutoguardado | null } {
  const p = estado.pendiente;
  if (!p) return { estado, enviado: null };
  if (id !== undefined && p.id !== id) return { estado, enviado: null };
  return { estado: { ...estado, pendiente: null }, enviado: p };
}

/**
 * ¿La respuesta corresponde a la última versión enviada de esa nota?
 * Si llegó una respuesta vieja, hay que ignorarla para el estado de UI.
 */
export function respuestaAutoguardadoVigente(
  estado: EstadoColaAutoguardado,
  id: string,
  versionEnviada: number,
): boolean {
  return (estado.versiones[id] ?? 0) === versionEnviada;
}

export function notaVacia(titulo: string, contenido: string): boolean {
  return !titulo.trim() && !contenido.trim();
}
