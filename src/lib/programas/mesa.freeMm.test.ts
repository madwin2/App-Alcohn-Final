import { describe, expect, it } from 'vitest';
import { addStamp, columnUsage, emptyDocument, maxAddableHeightMm, type MesaSource } from './mesa';

const src = (id: string, w: number, h: number, extra: Partial<MesaSource> = {}): MesaSource => ({
  id,
  designName: id,
  widthMm: w,
  heightMm: h,
  stampType: 'Clasico',
  tipoPlanchuela: 38,
  vectorPreviewUrl: `https://x/${id}.svg`,
  ...extra,
});

describe('mesa freeMm vs soltar (regresión POL-097)', () => {
  it('con ~86 mm libres acepta un sello de 53,29 mm en P38', () => {
    let doc = emptyDocument('p1', 'C');
    const col = doc.columns.find((c) => c.id === 'p38')!;
    const total = col.topY - col.bottomY;
    // free ≈ 86 tras 5 sellos: free = total - sumH - 5*gap ⇒ sumH = total - 86 - 40
    const sumH = total - 86 - 40;
    const each = sumH / 5;
    for (let i = 0; i < 5; i++) {
      const r = addStamp(doc, src(`s${i}`, 36.5, each));
      expect(r.added, r.added ? undefined : r.reason).toBe(true);
      doc = r.doc;
    }
    const usage = columnUsage(doc).find((u) => u.columnId === 'p38')!;
    expect(usage.freeMm).toBeGreaterThanOrEqual(85);
    expect(usage.freeMm).toBeLessThanOrEqual(87);
    const r = addStamp(doc, src('rc', 36.5, 53.29));
    expect(r.added, r.added ? undefined : r.reason).toBe(true);
  });

  it('acepta ancho al tope de planchuela (36,5 en usable 36,5) y un pelín de holgura de fabricación', () => {
    let doc = emptyDocument('p1', 'C');
    const exact = addStamp(doc, src('a', 36.5, 40));
    expect(exact.added).toBe(true);
    doc = exact.doc;
    // Holgura típica del tope de fabricación (+0,05)
    const over = addStamp(doc, src('b', 36.55, 40));
    expect(over.added, over.added ? undefined : over.reason).toBe(true);
  });

  it('un sello ya en la fila con ancho al tope+holgura no bloquea soltar otro', () => {
    let doc = emptyDocument('p1', 'C');
    doc = addStamp(doc, src('ya', 36.55, 50)).doc;
    const usage = columnUsage(doc).find((u) => u.columnId === 'p38')!;
    expect(usage.freeMm).toBeGreaterThan(53.29);
    const r = addStamp(doc, src('rc', 36.5, 53.29));
    expect(r.added, r.added ? undefined : r.reason).toBe(true);
  });

  it('mm libres = lo que insertStamp permite (no huecos visuales ni cola de corte)', () => {
    let doc = emptyDocument('p1', 'C');
    for (const id of ['a', 'b', 'c']) {
      doc = addStamp(doc, src(id, 36.5, 70)).doc;
    }
    // Espaciar a mano más de 8 mm: el ojo ve “aire”, pero al soltar se rearma a 8 mm.
    const col = doc.columns.find((c) => c.id === 'p38')!;
    doc = {
      ...doc,
      stamps: doc.stamps.map((s, i) =>
        s.columnId === 'p38' ? { ...s, topY: col.topY - i * 100 } : s,
      ),
    };
    const free = maxAddableHeightMm(doc, 'p38');
    expect(columnUsage(doc).find((u) => u.columnId === 'p38')!.freeMm).toBe(free);
    expect(addStamp(doc, src('ok', 36.5, free)).added).toBe(true);
    expect(addStamp(doc, src('no', 36.5, free + 0.2)).added).toBe(false);
  });
});
