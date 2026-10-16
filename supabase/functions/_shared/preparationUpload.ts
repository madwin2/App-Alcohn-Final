/** La revisión identifica el plan; el evento identifica el resultado nativo guardado. */
export function preparationUploadPrefix(programId: string, revision: unknown, eventId: unknown): string {
  if (!Number.isSafeInteger(revision) || Number(revision) < 1 || typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(eventId))
    throw new Error('Falta la identidad del resultado de Aspire. Actualizá el gadget y sincronizá nuevamente.');
  return `${programId}/r${revision}/${eventId}/`;
}

export function isPreparationUploadPath(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) return false;
  const file = path.slice(prefix.length);
  return !!file && !file.includes('..') && !/[\\/]/.test(file) && /^[a-zA-Z0-9._-]+$/.test(file);
}
