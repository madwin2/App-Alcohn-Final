import type { RepasoPiece } from '@/lib/fresa/passes';
import type { FinePiece } from './preparation';

/**
 * Piezas elegidas para el repaso 0,2, en el marco donde el gadget ubica el
 * diseño: normalizadas a su caja (0 a 1), origen arriba a la izquierda.
 *
 * El gadget importa el vector como en el SVG (y hacia abajo = hacia abajo en
 * pantalla) y, si no está ya mecanizado, lo espeja en X y, si es apaisado, lo
 * gira 90° antihorario (RotationMatrix2D positivo). Espejo + giro = trasponer:
 * (u, v) del SVG pasa a (v, u). El gadget prueba también el giro opuesto y,
 * si nada coincide, repasa el sello completo.
 */
export function placedRepasoPieces(pieces: RepasoPiece[], machined: boolean): FinePiece[] {
  const chosen = pieces.filter((p) => p.selected);
  if (!chosen.length) return [];
  const minX = Math.min(...pieces.map((p) => p.bounds.minX)), maxX = Math.max(...pieces.map((p) => p.bounds.maxX));
  const minY = Math.min(...pieces.map((p) => p.bounds.minY)), maxY = Math.max(...pieces.map((p) => p.bounds.maxY));
  const w = maxX - minX, h = maxY - minY;
  if (!(w > 0 && h > 0)) return [];
  const rotate = !machined && w > h;
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return chosen.map(({ bounds: b }) => {
    const u0 = (b.minX - minX) / w, u1 = (b.maxX - minX) / w, v0 = (b.minY - minY) / h, v1 = (b.maxY - minY) / h;
    const [x0, x1, y0, y1] = machined ? [u0, u1, v0, v1] : rotate ? [v0, v1, u0, u1] : [1 - u1, 1 - u0, v0, v1];
    return { x0: r(x0), y0: r(y0), x1: r(x1), y1: r(y1) };
  });
}
