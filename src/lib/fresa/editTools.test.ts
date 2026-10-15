import { describe, expect, it } from 'vitest';
import { alignShifts, constrainAxis, distributeShifts, neighborGaps, snapMove, unionBox } from './editTools';

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

describe('editTools', () => {
  it('imán: el borde se pega al de otra pieza y devuelve la guía', () => {
    const r = snapMove(box(0, 0, 2, 2), 2.95, 0.2, { boxes: [box(5, 0, 7, 2)] }, 0.1);
    // El borde derecho (2 + 2,95 = 4,95) se pega al izquierdo de la otra (5).
    expect(r.dx).toBeCloseTo(3, 9);
    expect(r.guides.some((g) => g.axis === 'x' && g.x === 5)).toBe(true);
  });

  it('imán: fuera del umbral no corrige', () => {
    const r = snapMove(box(0, 0, 2, 2), 2.5, 0.5, { boxes: [box(5, 10, 7, 12)] }, 0.1);
    expect(r).toMatchObject({ dx: 2.5, dy: 0.5 });
    expect(r.guides).toHaveLength(0);
  });

  it('imán: centros contra una línea extra (centro del diseño)', () => {
    const r = snapMove(box(0, 0, 2, 2), 3.96, 0, { boxes: [], xs: [5] }, 0.1);
    expect(r.dx).toBeCloseTo(4, 9);
  });

  it('Shift: deja solo el eje de mayor movimiento', () => {
    expect(constrainAxis(3, 0.4)).toEqual({ dx: 3, dy: 0, axis: 'x' });
    expect(constrainAxis(0.2, -1)).toEqual({ dx: 0, dy: -1, axis: 'y' });
  });

  it('alinear a la izquierda, centro y abajo', () => {
    const bs = [box(0, 0, 2, 1), box(3, 2, 4, 5)];
    expect(alignShifts(bs, 'left')).toEqual([{ dx: 0, dy: 0 }, { dx: -3, dy: 0 }]);
    expect(alignShifts(bs, 'hcenter').map((s) => s.dx)).toEqual([1, -1.5]);
    expect(alignShifts(bs, 'bottom').map((s) => s.dy)).toEqual([4, 0]);
  });

  it('distribuir deja los espacios iguales y no mueve los extremos', () => {
    // Letras de 1 mm con espacios 0,2 y 1,0 → quedan de 0,6 y 0,6.
    const bs = [box(0, 0, 1, 1), box(1.2, 0, 2.2, 1), box(3.2, 0, 4.2, 1)];
    const sh = distributeShifts(bs, 'x');
    expect(sh[0].dx).toBe(0);
    expect(sh[2].dx).toBe(0);
    expect(sh[1].dx).toBeCloseTo(0.4, 9);
    const moved = bs.map((b, i) => ({ ...b, minX: b.minX + sh[i].dx, maxX: b.maxX + sh[i].dx }));
    expect(moved[1].minX - moved[0].maxX).toBeCloseTo(moved[2].minX - moved[1].maxX, 9);
  });

  it('espacios a las vecinas de cada lado', () => {
    const g = neighborGaps(box(2, 0, 3, 1), [box(0, 0, 1.5, 1), box(3.4, 0.1, 5, 1), box(2, 3, 3, 4)]);
    expect(g.left).toBeCloseTo(0.5, 9);
    expect(g.right).toBeCloseTo(0.4, 9);
    expect(g.down).toBeCloseTo(2, 9);
    expect(g.up).toBeUndefined();
    expect(unionBox([])).toBeNull();
  });
});
