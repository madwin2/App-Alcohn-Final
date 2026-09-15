export interface MatchSello {
  selloId: string;
  label: string;
  designName: string;
  hasVector?: boolean;
}

export interface MatchCandidate {
  selloId: string;
  score: number;
  label: string;
}

const NOISE = new Set(['logo', 'vector', 'final', 'ok', 'v2', 'copia', 'sello']);

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !NOISE.has(token))
    .join(' ')
    .trim();
}

function bigrams(value: string): string[] {
  const s = value.replace(/\s+/g, '');
  if (s.length < 2) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const aa = bigrams(a);
  const bb = bigrams(b);
  if (!aa.length && !bb.length) return 1;
  if (!aa.length || !bb.length) return 0;
  const counts = new Map<string, number>();
  for (const g of aa) counts.set(g, (counts.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of bb) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      inter += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * inter) / (aa.length + bb.length);
}

function jaccardTokens(a: string, b: string): number {
  const aa = new Set(a.split(' ').filter(Boolean));
  const bb = new Set(b.split(' ').filter(Boolean));
  if (!aa.size && !bb.size) return 1;
  let inter = 0;
  for (const t of aa) if (bb.has(t)) inter += 1;
  const union = new Set([...aa, ...bb]).size;
  return union === 0 ? 0 : inter / union;
}

export function nameScore(fileName: string, selloName: string): number {
  const a = normalizeName(fileName);
  const b = normalizeName(selloName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return Math.max(dice(a, b), jaccardTokens(a, b));
}

export function rankMatches(fileName: string, sellos: MatchSello[]): MatchCandidate[] {
  return sellos
    .map((sello) => ({
      selloId: sello.selloId,
      label: sello.label,
      score: Math.max(nameScore(fileName, sello.designName), nameScore(fileName, sello.label)),
    }))
    .sort((a, b) => b.score - a.score);
}

export function autoAssign(
  files: string[],
  sellos: MatchSello[],
): Record<string, string | null> {
  const available = new Set(sellos.filter((sello) => !sello.hasVector).map((sello) => sello.selloId));
  const ranked = files.map((fileName) => {
    const matches = rankMatches(fileName, sellos).filter((match) => available.has(match.selloId));
    const best = matches[0];
    const second = matches[1];
    const qualifies = Boolean(
      best && best.score >= 0.75 && best.score - (second?.score ?? 0) >= 0.15,
    );
    return { fileName, selloId: qualifies && best ? best.selloId : null, score: best?.score ?? 0 };
  });

  ranked.sort((a, b) => b.score - a.score);
  const taken = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const row of ranked) {
    if (row.selloId && !taken.has(row.selloId)) {
      out[row.fileName] = row.selloId;
      taken.add(row.selloId);
    } else {
      out[row.fileName] = null;
    }
  }
  return out;
}
