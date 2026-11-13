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

  it('acepta un viewBox 2 px más chico y parte igual', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 198 198">
        <rect id="a" x="19.8" y="19.8" width="39.6" height="39.6" fill="#000"/>
        <rect id="b" x="118.8" y="19.8" width="39.6" height="39.6" fill="#000"/>
        <rect id="c" x="19.8" y="118.8" width="39.6" height="39.6" fill="#000"/>
        <rect id="d" x="118.8" y="118.8" width="39.6" height="39.6" fill="#000"/>
      </svg>
    `;
    const split = splitSheetSvg(svg, placement);
    expect(split.size).toBe(4);
    expect(split.has('a')).toBe(true);
    expect(split.has('b')).toBe(true);
    expect(split.has('c')).toBe(true);
    expect(split.has('d')).toBe(true);
  });

  it('acepta el desfasaje real 2521×1248 → 2519×1247', () => {
    const sheet: PackedSheet = {
      width: 2521,
      height: 1248,
      cells: [
        { imageId: 'a', x: 24, y: 24, w: 480, h: 1200 },
        { imageId: 'b', x: 528, y: 24, w: 480, h: 1200 },
        { imageId: 'c', x: 1032, y: 24, w: 480, h: 1200 },
        { imageId: 'd', x: 1536, y: 24, w: 480, h: 1200 },
        { imageId: 'e', x: 2040, y: 24, w: 457, h: 1200 },
      ],
    };
    const sx = 2519 / 2521;
    const sy = 1247 / 1248;
    const rects = sheet.cells
      .map(
        (cell, i) =>
          `<rect id="${String.fromCharCode(97 + i)}" x="${cell.x * sx + 10}" y="${cell.y * sy + 10}" width="40" height="40" fill="#000"/>`,
      )
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2519 1247">${rects}</svg>`;
    const split = splitSheetSvg(svg, sheet);
    expect(split.size).toBe(5);
  });

  it('elipses giradas (dedos de una pata) van a su celda, no a la de arriba a la izquierda', () => {
    // Así exporta Vectorizer.AI las formas que reconoce como elipses: centro en 0,0 y el lugar en `transform`.
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect x="20" y="20" width="60" height="60" fill="#000"/>
        <rect x="120" y="120" width="60" height="60" fill="#000"/>
        <ellipse cx="0" cy="0" rx="4" ry="6" fill="#000" transform="translate(140 130) rotate(-20)"/>
        <ellipse cx="0" cy="0" rx="4" ry="6" fill="#000" transform="matrix(0.94 0.34 -0.34 0.94 160 130)"/>
      </svg>
    `;
    const split = splitSheetSvg(svg, placement);
    expect(split.get('a')).not.toContain('ellipse');
    expect((split.get('d')?.match(/<ellipse/g) ?? []).length).toBe(2);
    expect(split.get('a')).toContain('viewBox="20 20 60 60"');
  });

  it('sigue abortando si el viewBox es de otra hoja', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect x="5" y="5" width="10" height="10" fill="#000"/></svg>`;
    expect(() => splitSheetSvg(svg, placement)).toThrow(/no coincide con la hoja/);
  });
});
