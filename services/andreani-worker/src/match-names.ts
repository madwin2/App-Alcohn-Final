export function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type MatchCandidate = {
  ordenId: string;
  customerName: string;
  shippingName: string | null;
  /** Nombre con el que el cliente completó el link (revisión de links). */
  linkName?: string | null;
  /** Seguimiento que mostró el link completado (revisión de links). */
  linkTracking?: string | null;
};

export type NameMatch = { kind: 'hit'; ordenId: string } | { kind: 'none' } | { kind: 'ambiguous' };

export function matchDestinatario(destinatario: string, candidates: MatchCandidate[]): NameMatch {
  const entry = normalizePersonName(destinatario);
  if (!entry || candidates.length === 0) return { kind: 'none' };

  const namesOf = (c: MatchCandidate): string[] =>
    [c.customerName, c.shippingName, c.linkName].filter((n): n is string => Boolean(n && n.trim()));

  const exact = candidates.filter((c) => namesOf(c).some((n) => normalizePersonName(n) === entry));
  if (exact.length === 1) return { kind: 'hit', ordenId: exact[0].ordenId };
  if (exact.length > 1) return { kind: 'ambiguous' };

  const entryParts = entry.split(' ').filter(Boolean);
  const entryLast = entryParts[entryParts.length - 1] || '';
  const entryTokens = new Set(entryParts);

  const fallback = candidates.filter((c) => {
    return namesOf(c).some((n) => {
      const parts = normalizePersonName(n).split(' ').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      const first = parts[0] || '';
      return last && last === entryLast && first && entryTokens.has(first);
    });
  });

  if (fallback.length === 1) return { kind: 'hit', ordenId: fallback[0].ordenId };
  if (fallback.length > 1) return { kind: 'ambiguous' };
  return { kind: 'none' };
}

/**
 * Etiqueta del portal → pedido. Primero por el seguimiento que mostró el link (exacto);
 * si no, por nombre, solo entre pedidos cuyo link no apunta ya a otro seguimiento.
 */
export function matchEtiqueta(
  tracking: string,
  destinatario: string,
  candidates: MatchCandidate[],
): NameMatch {
  const wanted = tracking.trim();
  const byTracking = candidates.filter((c) => c.linkTracking && c.linkTracking.trim() === wanted);
  if (byTracking.length === 1) return { kind: 'hit', ordenId: byTracking[0].ordenId };
  if (byTracking.length > 1) return { kind: 'ambiguous' };

  return matchDestinatario(
    destinatario,
    candidates.filter((c) => !c.linkTracking?.trim()),
  );
}
