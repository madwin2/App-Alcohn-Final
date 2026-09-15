import { describe, expect, it } from 'vitest';
import { cellContainingPoint, splitSheetSvg, unionBoxes } from './svgSplit';
import type { PackedSheet } from './types';

const placement: PackedSheet = {
  width: 200,
  height: 200,
  cells: [
    { imageId: 'a', x: 10, y: 10, w: 80, h: 80 },
    { imageId: 'b', x: 110, y: 10, w: 80, h: 80 },
    { imageId: 'c', x: 10, y: 110, w: 80, h: 80 },
    { imageId: 'd', x: 110, y: 110, w: 80, h: 80 },
  ],
};

describe('svgSplit', () => {
  it('parte 4 rects en 4 SVGs con el viewBox de su geometría', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect id="a" x="20" y="20" width="40" height="40" fill="#000"/>
        <rect id="b" x="120" y="20" width="40" height="40" fill="#000"/>
        <rect id="c" x="20" y="120" width="40" height="40" fill="#000"/>
        <rect id="d" x="120" y="120" width="40" height="40" fill="#000"/>
      </svg>
    `;
    const split = splitSheetSvg(svg, placement);
    expect(split.size).toBe(4);
    expect(split.get('a')).toContain('viewBox="20 20 40 40"');
    expect(split.get('b')).toContain('viewBox="120 20 40 40"');
    expect(split.get('c')).toContain('viewBox="20 120 40 40"');
    expect(split.get('d')).toContain('viewBox="120 120 40 40"');
  });

  it('omite celdas vacías', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect x="20" y="20" width="40" height="40" fill="#000"/>
      </svg>
    `;
    const split = splitSheetSvg(svg, placement);
    expect(split.size).toBe(1);
    expect(split.has('a')).toBe(true);
    expect(split.has('b')).toBe(false);
  });

  it('asigna por el centro un elemento a caballo de dos celdas', () => {
    const cell = cellContainingPoint(placement, 100, 50);
    expect(cell?.imageId === 'a' || cell?.imageId === 'b').toBe(true);
    expect(unionBoxes([{ x: 70, y: 20, w: 60, h: 40 }])).toEqual({ x: 70, y: 20, w: 60, h: 40 });
  });
});
