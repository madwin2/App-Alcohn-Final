/**
 * Con RLS, un DELETE/UPDATE que no toca filas no da error: vuelve data=[].
 * Usar después de `.select('id')` (o cualquier select) para fallar en voz alta.
 */

export const MSG_FILA_NO_AFECTADA =
  'No se pudo: puede que ya no tengas permiso o que haya cambiado. Recargá.';

export function mapPostgrestError(error: { code?: string; message?: string } | null): Error {
  if (error?.code === 'PGRST116') {
    return new Error(MSG_FILA_NO_AFECTADA);
  }
  return new Error(error?.message || 'Error de base de datos');
}

/** Lanza si `data` está vacío (0 filas afectadas por RLS o carrera). */
export function asegurarFilaAfectada<T>(
  data: T[] | T | null | undefined,
  mensaje: string = MSG_FILA_NO_AFECTADA,
): T {
  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error(mensaje);
    return data[0];
  }
  if (data == null) throw new Error(mensaje);
  return data;
}
