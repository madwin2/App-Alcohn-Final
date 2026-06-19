/** Dígitos únicamente (sin +, espacios ni guiones). */
export const normalizePhoneDigits = (value: string): string => (value || '').replace(/\D/g, '');

/**
 * Formato canónico interno para clientes argentinos: 549 + número local (sin +).
 * Ej: +5491123456789, 5491123456789, 91123456789, 1123456789 → 5491123456789
 */
export const normalizePhoneDigitsCliente = (value: string): string => {
  const d = normalizePhoneDigits(value);
  if (d.length < 8) return '';

  if (d.startsWith('549')) return d;
  if (d.startsWith('54') && d.length >= 11) return `549${d.slice(2)}`;
  if (d.startsWith('9') && d.length >= 10) return `54${d}`;
  if (d.length === 10) return `549${d}`;
  if (d.length === 11 && d.startsWith('0')) return `549${d.slice(1)}`;
  if (d.startsWith('54')) return d;

  return `54${d}`;
};

/** Variantes de teléfono para búsqueda en BD (web guarda +54…, la app sin +). */
export const phoneSearchVariants = (value: string): string[] => {
  const canonical = normalizePhoneDigitsCliente(value);
  if (!canonical) return [];

  const variants = new Set<string>();
  const add = (v: string) => {
    if (v.length >= 8) variants.add(v);
  };

  add(canonical);
  add(`+${canonical}`);

  if (canonical.startsWith('549') && canonical.length > 3) {
    add(canonical.slice(2));
    add(canonical.slice(3));
  }
  if (canonical.length >= 10) {
    add(canonical.slice(-10));
  }

  return [...variants];
};

export const normalizeEmailCliente = (value: string | null | undefined): string | null => {
  const s = (value || '').trim().toLowerCase();
  return s && s.includes('@') ? s : null;
};

/** Teléfonos placeholder del import histórico (+549110000XXXXXX). */
export const isPlaceholderClientePhone = (value: string): boolean =>
  /^\+?549110000\d{6}$/.test(normalizePhoneDigits(value) ? `+${normalizePhoneDigits(value)}` : '');
