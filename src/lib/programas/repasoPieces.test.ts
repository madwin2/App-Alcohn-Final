// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runPasses, type RepasoPiece } from '@/lib/fresa/passes';
import { parseSvgShapes } from '@/lib/fresa/svgShapes';
import { DEFAULT_ANALYSIS_OPTIONS, FRESA_FINA } from '@/lib/fresa/config';
import { placedRepasoPieces } from './repasoPieces';
import { createPreparation, isPreparationDocument } from './preparation';

const piece = (id: number, minX: number, minY: number, maxX: number, maxY: number, selected = true): RepasoPiece =>
  ({ id, selected, bounds: { minX, minY, maxX, maxY } });

describe('piezas de repaso en el marco del gadget', () => {
  // Diseño de 10 × 20 (vertical): A arriba a la izquierda, B abajo a la derecha.
  const tall = [piece(0, 0, 0, 4, 5), piece(1, 6, 15, 10, 20, false)];
  // Diseño de 20 × 10 (apaisado): A arriba a la izquierda.
  const wide = [piece(0, 0, 0, 5, 4), piece(1, 15, 6, 20, 10, false)];

  it('solo manda las elegidas', () => {
    expect(placedRepasoPieces(tall, false)).toHaveLength(1);
    expect(placedRepasoPieces(tall.map((p) => ({ ...p, selected: false })), false)).toEqual([]);
  });

  it('vertical sin mecanizar: se espeja en X (lo de la izquierda queda a la derecha)', () => {
    expect(placedRepasoPieces(tall, false)).toEqual([{ x0: 0.6, y0: 0, x1: 1, y1: 0.25 }]);
  });

  it('apaisado sin mecanizar: espejo + giro 90° = trasponer', () => {
    expect(placedRepasoPieces(wide, false)).toEqual([{ x0: 0, y0: 0, x1: 0.4, y1: 0.25 }]);
  });

  it('ya mecanizado (observado en Aspire o corregido así): sin cambios', () => {
    expect(placedRepasoPieces(wide, true)).toEqual([{ x0: 0, y0: 0, x1: 0.25, y1: 0.4 }]);
  });

  it('Magui Lucero: la E queda donde la ubica el gadget y el documento lo acepta', () => {
    const svg = readFileSync('src/lib/fresa/__fixtures__/magui-lucero.svg', 'utf8');
    const k = 35 / 1497.29;
    const result = runPasses(parseSvgShapes(svg).shapes, k, FRESA_FINA, 'CLASICO', DEFAULT_ANALYSIS_OPTIONS);
    const placed = placedRepasoPieces(result.repaso.pieces, false);
    expect(placed.length).toBe(result.repaso.pieces.filter((p) => p.selected).length);
    // E en el SVG: u ≈ 0,74–0,80, v ≈ 0,66–0,81 → ubicada (traspuesta): x ≈ 0,66–0,81, y ≈ 0,74–0,80.
    expect(placed.some((p) => Math.abs(p.x0 - 0.66) < 0.02 && Math.abs(p.y0 - 0.74) < 0.02)).toBe(true);
    const doc = createPreparation('p', 'C', [{ id: 's', designName: 'Magui', widthMm: 19.12, heightMm: 35, stampType: 'Clasico', vectorPreviewUrl: 'https://x/m.svg' }]);
    doc.stamps[0].fine = { mode: 'auto', needsFine: true, inputHash: 'h', widthMm: 19.12, heightMm: 35, recipe: 'CLASICO', outcome: 'repaso_sugerido', pieces: placed };
    expect(isPreparationDocument(doc)).toBe(true);
    doc.stamps[0].fine.pieces = [{ x0: 0.5, y0: 0, x1: 0.4, y1: 1 }];
    expect(isPreparationDocument(doc)).toBe(false);
  });
});
