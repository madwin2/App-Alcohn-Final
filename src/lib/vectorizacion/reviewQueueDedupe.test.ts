import { describe, expect, it } from 'vitest';
import { dedupeReviewItems, mergeReviewItems } from './reviewQueueDedupe';
import type { ReviewItem } from './types';

function item(selloId: string, designName = selloId): ReviewItem {
  return {
    id: selloId,
    selloId,
    orderId: 'o1',
    designName,
    clienteNombre: 'Cliente',
    svg: `<svg>${designName}</svg>`,
    beforeDataUrl: 'data:',
    requestedWidthMm: 40,
    requestedHeightMm: 40,
    mode: 'production',
  };
}

describe('dedupeReviewItems', () => {
  it('deja un ítem por sello; gana el último', () => {
    const a1 = item('A', 'A1');
    const b = item('B', 'B');
    const a2 = item('A', 'A2');
    expect(dedupeReviewItems([a1, b, a2])).toEqual([b, a2]);
  });
});

describe('mergeReviewItems', () => {
  it('reemplaza sellos existentes y agrega los nuevos', () => {
    const a = item('A');
    const b = item('B', 'B');
    const b2 = item('B', 'B\'');
    const c = item('C');
    const { queue, replaced } = mergeReviewItems([a, b], [b2, c]);
    expect(queue).toEqual([a, b2, c]);
    expect(replaced).toEqual(['B']);
  });

  it('limpia duplicados ya presentes en current', () => {
    const a1 = item('A', 'A1');
    const a2 = item('A', 'A2');
    const b = item('B');
    const c = item('C');
    const { queue, replaced } = mergeReviewItems([a1, a2, b], [c]);
    expect(queue.map((i) => i.selloId)).toEqual(['A', 'B', 'C']);
    expect(queue.find((i) => i.selloId === 'A')?.designName).toBe('A2');
    expect(replaced).toEqual([]);
  });
});
