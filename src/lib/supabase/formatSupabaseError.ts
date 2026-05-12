/** Mensaje legible para toasts cuando Supabase devuelve objetos PostgrestError. */
export function formatSupabaseError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.details === 'string' && o.details) return o.details;
    if (typeof o.hint === 'string' && o.hint) return o.hint;
    if (typeof o.code === 'string' && o.code) return `Error ${o.code}`;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
