import type { ReviewItem } from './types';

/** Un ítem por sello. Si se repite, gana el último (el más nuevo). Mantiene el orden de aparición del ganador. */
export function dedupeReviewItems(items: ReviewItem[]): ReviewItem[] {
  const lastIndex = new Map<string, number>();
  items.forEach((item, index) => lastIndex.set(item.selloId, index));
  return items.filter((item, index) => lastIndex.get(item.selloId) === index);
}

/** Agrega `incoming` a `current` reemplazando los sellos que ya estaban. Devuelve también los ids reemplazados. */
export function mergeReviewItems(
  current: ReviewItem[],
  incoming: ReviewItem[],
): { queue: ReviewItem[]; replaced: string[] } {
  const fresh = dedupeReviewItems(incoming);
  const ids = new Set(fresh.map((item) => item.selloId));
  const replaced = current.filter((item) => ids.has(item.selloId)).map((item) => item.selloId);
  const kept = dedupeReviewItems(current).filter((item) => !ids.has(item.selloId));
  return { queue: [...kept, ...fresh], replaced };
}
