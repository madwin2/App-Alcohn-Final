export function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type MatchCandidate = {
  ordenId: string;
  customerName: string;
  shippingName: string | null;
};

export type NameMatch = { kind: 'hit'; ordenId: string } | { kind: 'none' } | { kind: 'ambiguous' };

export function matchDestinatario(destinatario: string, candidates: MatchCandidate[]): NameMatch {
  const entry = normalizePersonName(destinatario);
  if (!entry || candidates.length === 0) return { kind: 'none' };

  const namesOf = (c: MatchCandidate): string[] =>
    [c.customerName, c.shippingName].filter((n): n is string => Boolean(n && n.trim()));

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
