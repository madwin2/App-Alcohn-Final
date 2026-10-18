import { describe, expect, it } from 'vitest';
import { addStamp, columnStamps, columnUsage, compareQueue, daysToDeadline, emptyDocument, fillFromQueue, mesaChecks, placeSources, reconcileMesa, mesaProgress, moveStamp, moveToNeighbor, neighborColumn, placementOptions, queueSection, reflowMesa, removeStamp, resizeStamp, sendToEnd, shiftStamp, updateStampGeometry, type MesaSource } from './mesa';
import { PREPARATION_RULES, buildExecutionPlan, validatePreparation, type PreparationDocument } from './preparation';

const src = (id: string, w: number, h: number, extra: Partial<MesaSource> = {}): MesaSource => ({
  id, designName: id, widthMm: w, heightMm: h, stampType: 'Clasico', tipoPlanchuela: null, vectorPreviewUrl: `https://x/${id}.svg`, ...extra,
});
const ready = () => {
  const doc = emptyDocument('p1', 'C');
  doc.supportVerified = true;
  Object.values(doc.recipes).forEach((r) => { r.verified = true; });
  doc.recipes.ALIMENTO.perimeterTemplate = { name: 'Corte.ToolpathTemplate', path: 'p1/ALIMENTO/food_perimeter/x.ToolpathTemplate' };
  return doc;
};
const separationErrors = (doc: ReturnType<typeof ready>) => validatePreparation(doc).filter((i) => ['SEPARATION', 'LENGTH', 'MACHINING_LENGTH', 'WIDTH'].includes(i.code));
const expectPacked = (doc: PreparationDocument) => {
  expect(doc.gapMm).toBe(8);
  for (const col of doc.columns) {
    const row = columnStamps(doc, col.id);
    if (!row.length) continue;
    expect(row[0].topY).toBe(col.topY);
    row.forEach((s, i) => {
      expect(s.centerX).toBe(col.centerX);
      if (i) expect(row[i - 1].topY - row[i - 1].heightMm - s.topY).toBeCloseTo(8, 10);
    });
  }
  expect(separationErrors(doc)).toEqual([]);
};
const three = () => ['a', 'b', 'c'].reduce((doc, id) => addStamp(doc, src(id, 10, 30, { tipoPlanchuela: 25 })).doc, ready());

describe('mesa de armado', () => {
  it('ordena la cola: prioritario, vence antes, pedido más viejo', () => {
    const q = [src('c', 10, 20, { orderDate: '2026-09-01' }), src('a', 10, 20, { isPriority: true }), src('b', 10, 20, { deadlineAt: '2026-10-18' })];
    expect([...q].sort(compareQueue).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('agrega en su planchuela, uno debajo del otro, sin mover a los demás', () => {
    let doc = ready();
    for (const s of [src('a', 12, 30, { tipoPlanchuela: 19 }), src('b', 14, 35, { tipoPlanchuela: 19 })]) {
      const r = addStamp(doc, s); expect(r.added).toBe(true); doc = r.doc;
    }
    const [a, b] = doc.stamps;
    expect(a.columnId).toBe('p19'); expect(b.columnId).toBe('p19');
    expect(a.topY - a.heightMm - b.topY).toBeCloseTo(doc.gapMm, 5);
    expect(separationErrors(doc)).toEqual([]);
  });

  it('soltado en la mesa: inserta en la fila sin huecos ni fijados; rechaza si no entra de ancho', () => {
    let doc = addStamp(ready(), src('a', 12, 30, { tipoPlanchuela: 19 })).doc;
    const dropped = addStamp(doc, src('b', 12, 30), { columnId: 'p19', topY: -15 });
    expect(dropped.added).toBe(true); doc = dropped.doc;
    const b = doc.stamps.find((s) => s.selloId === 'b')!;
    expect(b.pinned).toBe(false);
    expectPacked(doc);
    const wide = addStamp(doc, src('w', 30, 40), { columnId: 'p12', topY: -10 });
    expect(wide.added).toBe(false);
  });

  it('mover y llevar al final respetan la separación', () => {
    let doc = ready();
    for (const s of [src('a', 10, 30, { tipoPlanchuela: 25 }), src('b', 10, 30, { tipoPlanchuela: 25 }), src('c', 10, 30, { tipoPlanchuela: 25 })]) doc = addStamp(doc, s).doc;
    const first = doc.stamps[0].instanceId;
    const r = sendToEnd(doc, first); expect(r.added).toBe(true); doc = r.doc;
    const moved = doc.stamps.find((s) => s.instanceId === first)!;
    expect(moved.topY).toBeLessThan(Math.min(...doc.stamps.filter((s) => s.instanceId !== first).map((s) => s.topY)));
    expect(columnStamps(doc, 'p25').map((s) => s.selloId)).toEqual(['b', 'c', 'a']);
    expectPacked(doc);
    const m = moveStamp(doc, first, 'p38', -100); expect(m.added).toBe(true);
    expectPacked(m.doc);
    expect(m.doc.stamps.find((s) => s.instanceId === first)!.topY).toBe(m.doc.columns.find((c) => c.id === 'p38')!.topY);
  });

  it('llenar suma por prioridad hasta que no entra más, y nunca deja errores de lugar', () => {
    const queue = Array.from({ length: 40 }, (_, i) => src(`s${i}`, 12 + (i % 3) * 6, 30 + (i % 4) * 10, { isPriority: i === 39 }));
    const { doc, added } = fillFromQueue(ready(), queue);
    expect(added[0]).toBe('s39');
    expect(added.length).toBeGreaterThan(10);
    expect(added.length).toBeLessThan(40);
    expectPacked(doc);
    const usage = columnUsage(doc);
    expect(usage.every((u) => u.usedMm <= u.totalMm)).toBe(true);
  });

  it('no repite un sello ni pierde la proporción al cambiar la medida', () => {
    let doc = addStamp(ready(), src('a', 12, 30)).doc;
    expect(addStamp(doc, src('a', 12, 30)).added).toBe(false);
    const result = resizeStamp(doc, doc.stamps[0].instanceId, 40);
    expect(result.added).toBe(true); doc = result.doc;
    expect(doc.stamps[0].widthMm / doc.stamps[0].heightMm).toBeCloseTo(12 / 30, 2);
    expect(removeStamp(doc, doc.stamps[0].instanceId).stamps).toHaveLength(0);
  });

  it('agrandar y achicar desplaza los siguientes incluso si estaban fijados, sin mover otra planchuela', () => {
    let doc = addStamp(three(), src('otra', 12, 30, { tipoPlanchuela: 19 })).doc;
    doc = { ...doc, stamps: doc.stamps.map((s) => ({ ...s, pinned: true })) };
    const [a, b, c, other] = doc.stamps;
    const enlarged = resizeStamp(doc, b.instanceId, 45);
    expect(enlarged.added).toBe(true);
    expect(enlarged.doc.stamps[0].topY).toBe(a.topY);
    expect(enlarged.doc.stamps[1].topY).toBe(b.topY);
    expect(enlarged.doc.stamps[2].topY).toBe(c.topY - 15);
    expect(enlarged.doc.stamps[3]).toBe(other);
    expectPacked(enlarged.doc);
    const shrunk = resizeStamp(enlarged.doc, b.instanceId, 20);
    expect(shrunk.added).toBe(true);
    expect(shrunk.doc.stamps[2].topY).toBeCloseTo(c.topY + 10, 10);
    expectPacked(shrunk.doc);
  });

  it('inserta en el medio y permite arrastrar arriba/abajo con largos distintos', () => {
    const doc = three();
    const [a, b] = doc.stamps;
    const added = addStamp(doc, src('nuevo', 8, 10), { columnId: 'p25', topY: b.topY });
    expect(added.added).toBe(true);
    expect(columnStamps(added.doc, 'p25').map((s) => s.selloId)).toEqual(['a', 'nuevo', 'b', 'c']);
    expectPacked(added.doc);
    const down = moveStamp(added.doc, a.instanceId, 'p25', -350);
    expect(columnStamps(down.doc, 'p25').map((s) => s.selloId)).toEqual(['nuevo', 'b', 'c', 'a']);
    expectPacked(down.doc);
    const up = moveStamp(down.doc, a.instanceId, 'p25', 0);
    expect(columnStamps(up.doc, 'p25').map((s) => s.selloId)).toEqual(['a', 'nuevo', 'b', 'c']);
    expectPacked(up.doc);
  });

  it('cierra la fila al quitar o cambiar de planchuela; Subir/Bajar intercambian vecinos', () => {
    const doc = three();
    const [a, b] = doc.stamps;
    const down = shiftStamp(doc, a.instanceId, 1);
    expect(columnStamps(down.doc, 'p25').map((s) => s.selloId)).toEqual(['b', 'a', 'c']);
    expectPacked(down.doc);
    const up = shiftStamp(down.doc, a.instanceId, -1);
    expect(columnStamps(up.doc, 'p25').map((s) => s.selloId)).toEqual(['a', 'b', 'c']);
    const removed = removeStamp(doc, b.instanceId);
    expect(columnStamps(removed, 'p25').map((s) => s.selloId)).toEqual(['a', 'c']);
    expectPacked(removed);
    const moved = sendToEnd(doc, b.instanceId, 'p38');
    expectPacked(moved.doc);
    expect(columnStamps(moved.doc, 'p25').map((s) => s.selloId)).toEqual(['a', 'c']);
  });

  it.each(['C', 'G', 'XL'] as const)('conserva el origen preciso y el corte final en %s; reordena aunque la fila esté llena', (machine) => {
    let doc = emptyDocument('p1', machine);
    const col = doc.columns[0];
    const height = (col.topY - col.bottomY - 7 - 16) / 3;
    for (const id of ['a', 'b', 'c']) doc = addStamp(doc, src(id, 10, height), { columnId: col.id, topY: -999 }).doc;
    expectPacked(doc);
    const reordered = sendToEnd(doc, doc.stamps[0].instanceId);
    expect(reordered.added).toBe(true);
    expectPacked(reordered.doc);
    expect(addStamp(doc, src('extra', 10, 10), { columnId: col.id, topY: 0 }).added).toBe(false);
    const resized = resizeStamp(doc, doc.stamps[0].instanceId, height + 1);
    expect(resized.added).toBe(false);
    expect(resized.doc).toBe(doc);
  });

  it('rechaza ancho, falta de material y valores inválidos sin modificar el documento', () => {
    const doc = three();
    const id = doc.stamps[0].instanceId;
    for (const height of [100, 0, -2, NaN, Infinity, 0.01]) {
      const r = resizeStamp(doc, id, height);
      expect(r.added).toBe(false); expect(r.doc).toBe(doc);
    }
    const noMaterial = { ...doc, columns: doc.columns.map((c) => c.id === 'p38' ? { ...c, available: false } : c) };
    expect(moveStamp(noMaterial, id, 'p38', -100).added).toBe(false);
    expect(addStamp(noMaterial, src('nuevo', 10, 20), { columnId: 'p38', topY: -100 }).added).toBe(false);
  });

  it('una corrección de fresa con otra medida reacomoda e invalida el chequeo anterior', () => {
    const doc = three();
    const stamp = doc.stamps[0];
    stamp.fine = { mode: 'whole', needsFine: true, inputHash: 'old', analysisVersion: 6, widthMm: 10, heightMm: 30, recipe: 'CLASICO', outcome: 'repaso_sugerido' };
    const result = updateStampGeometry(doc, stamp.instanceId, { widthMm: 12, heightMm: 36, vectorSvg: '<svg/>', sourceWidthMm: 12, sourceHeightMm: 36 });
    expect(result.added).toBe(true);
    expect(result.doc.stamps[0].fine?.analysisVersion).toBeUndefined();
    expect(result.doc.stamps[0].fine?.mode).toBe('whole');
    expect(result.doc.stamps[1].topY).toBe(doc.stamps[1].topY - 6);
    expectPacked(result.doc);
  });

  it('reacomodar conserva el orden físico y normaliza separaciones antiguas', () => {
    const doc = three();
    const old = { ...doc, gapMm: 12, stamps: doc.stamps.map((s, i) => ({ ...s, topY: s.topY - i * 20, centerX: s.centerX + 1, pinned: true })) };
    expectPacked(reflowMesa(old));
    const col = doc.columns[0];
    const adjusted = reflowMesa({ ...doc, columns: doc.columns.map((c) => c.id === col.id ? { ...c, topY: c.topY - 1, centerX: c.centerX + 2 } : c) });
    expectPacked(adjusted);
  });

  it('los cortes quedan a la distancia vigente tras cambiar tamaño y orden', () => {
    const doc = resizeStamp(three(), 'p1:a', 36).doc;
    const moved = sendToEnd(doc, 'p1:b').doc;
    const plan = buildExecutionPlan(moved);
    expect(plan.issues).toEqual([]);
    const row = columnStamps(moved, 'p25');
    row.forEach((s, i) => {
      const cut = plan.stamps.find((p) => p.instanceId === s.instanceId)!.cut;
      expect(s.topY - s.heightMm - cut.y).toBeCloseTo(PREPARATION_RULES.cutBelowDesignMm, 10);
      if (i < row.length - 1) expect(cut.y - row[i + 1].topY).toBeCloseTo(4, 10);
    });
    expectPacked(moved);
  });

  it('etapas: armado → revisar → aspire → fabricar', () => {
    const empty = ready();
    expect(mesaProgress(empty, { savedRevision: null, dirty: false, syncedRevision: null, fileRevision: null }).step).toBe('armado');
    const doc = addStamp(empty, src('a', 12, 30)).doc;
    expect(mesaProgress(doc, { savedRevision: null, dirty: true, syncedRevision: null, fileRevision: null }).step).toBe('revisar');
    const checked = { ...doc, stamps: doc.stamps.map((s) => ({ ...s, fine: { mode: 'auto' as const, needsFine: false, inputHash: 'h', analysisVersion: 6, widthMm: s.widthMm, heightMm: s.heightMm, recipe: s.recipe, outcome: 'sin_repaso' } })) };
    expect(mesaChecks(checked).find((g) => g.id === 'fresa')!.state).toBe('ok');
    expect(mesaProgress(checked, { savedRevision: 1, dirty: false, syncedRevision: null, fileRevision: null }).step).toBe('aspire');
    expect(mesaProgress(checked, { savedRevision: 1, dirty: false, syncedRevision: 1, fileRevision: 1 }).done.fabricar).toBe(true);
  });
});

describe('mesa: ayudas de la pantalla', () => {
  it('agrupa la cola: urgentes (prioritario o ≤ 3 días), esta semana (≤ 7) y más adelante', () => {
    const today = new Date(2026, 9, 17);
    expect(queueSection(src('a', 10, 20, { isPriority: true, deadlineAt: '2026-11-30' }), today)).toBe('urgentes');
    expect(queueSection(src('b', 10, 20, { deadlineAt: '2026-10-16' }), today)).toBe('urgentes');
    expect(queueSection(src('c', 10, 20, { deadlineAt: '2026-10-20' }), today)).toBe('urgentes');
    expect(queueSection(src('d', 10, 20, { deadlineAt: '2026-10-24' }), today)).toBe('semana');
    expect(queueSection(src('e', 10, 20, { deadlineAt: '2026-10-25' }), today)).toBe('despues');
    expect(queueSection(src('f', 10, 20), today)).toBe('despues');
    expect(daysToDeadline(src('g', 10, 20, { deadlineAt: '2026-10-16T21:00:00-03:00' }), today)).toBe(-1);
  });

  it('dice en qué planchuelas entra un sello y por qué no en las otras', () => {
    const doc = ready();
    const opts = placementOptions(doc, src('ancho', 22, 40));
    const ok = opts.filter((o) => o.ok).map((o) => o.nominalMm).sort((a, b) => a - b);
    expect(ok).toEqual(doc.columns.filter((c) => c.usableMm >= 22).map((c) => c.nominalMm).sort((a, b) => a - b));
    const narrow = opts.find((o) => !o.ok);
    expect(narrow?.reason).toMatch(/no entra/);
    const sinMaterial = { ...doc, columns: doc.columns.map((c) => ({ ...c, available: false })) };
    expect(placementOptions(sinMaterial, src('x', 8, 20)).every((o) => !o.ok && /material/.test(o.reason ?? ''))).toBe(true);
  });

  it('mueve a la planchuela vecina donde entra, saltando las angostas, y conserva la separación', () => {
    let doc = ready();
    const cols = [...doc.columns].sort((a, b) => a.centerX - b.centerX);
    const wide = cols.find((c) => c.usableMm >= 20)!;
    const r = addStamp(doc, src('a', 18, 30), { columnId: wide.id, topY: 0 });
    expect(r.added).toBe(true); doc = r.doc;
    const id = (r as { instanceId: string }).instanceId;
    for (const dir of [-1, 1] as const) {
      const moved = moveToNeighbor(doc, id, dir);
      if (!moved.added) { expect(moved.reason).toBeTruthy(); continue; }
      const col = moved.doc.columns.find((c) => c.id === moved.doc.stamps.find((s) => s.instanceId === id)!.columnId)!;
      expect(col.usableMm).toBeGreaterThanOrEqual(18);
      expect(Math.sign(col.centerX - wide.centerX)).toBe(dir);
      expectPacked(moved.doc);
    }
    expect(neighborColumn(doc, cols[0].id, -1)).toBeNull();
  });
});

describe('mesa con datos reales: reconciliar con los sellos asignados', () => {
  it('ubica los sellos del programa en orden y conserva la separación', () => {
    const doc = placeSources(ready(), [src('a', 10, 30, { tipoPlanchuela: 25 }), src('b', 12, 20, { tipoPlanchuela: 25 })]);
    expect(doc.stamps.map((s) => s.selloId)).toEqual(['a', 'b']);
    expectPacked(doc);
  });

  it('no cambia nada si el programa tiene los mismos sellos (misma referencia)', () => {
    const list = [src('a', 10, 30, { tipoPlanchuela: 25 })];
    const doc = placeSources(ready(), list);
    expect(reconcileMesa(doc, list)).toBe(doc);
  });

  it('suma lo asignado en otra PC al final y quita lo que se sacó, sin mover el resto', () => {
    const doc = placeSources(ready(), ['a', 'b', 'c'].map((id) => src(id, 10, 30, { tipoPlanchuela: 25 })));
    const moved = moveStamp(doc, doc.stamps.find((s) => s.selloId === 'c')!.instanceId, doc.stamps[0].columnId, 1e9);
    expect(moved.added).toBe(true);
    const order = (d: PreparationDocument) => columnStamps(d, d.stamps[0].columnId).map((s) => s.selloId);
    expect(order(moved.doc)).toEqual(['c', 'a', 'b']);
    const next = reconcileMesa(moved.doc, ['c', 'b', 'd'].map((id) => src(id, 10, 30, { tipoPlanchuela: 25 })));
    expect(order(next)).toEqual(['c', 'b', 'd']);
    expectPacked(next);
  });

  it('no pisa lo que se está sumando o quitando en el servidor', () => {
    const doc = placeSources(ready(), ['a', 'b'].map((id) => src(id, 10, 30, { tipoPlanchuela: 25 })));
    // El servidor todavía no tiene «b» (se está sumando) y todavía tiene «x» (se está quitando).
    const server = ['a', 'x'].map((id) => src(id, 10, 30, { tipoPlanchuela: 25 }));
    const next = reconcileMesa(doc, server, { adding: new Set(['b']), removing: new Set(['x']) });
    expect(next.stamps.map((s) => s.selloId).sort()).toEqual(['a', 'b']);
  });

  it('un sello que no entra igual aparece, para que los controles lo marquen', () => {
    const doc = placeSources(ready(), [src('ancho', 45, 60)]);
    expect(doc.stamps.map((s) => s.selloId)).toEqual(['ancho']);
    expect(validatePreparation(doc).some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('mesa: programas con el gadget anterior', () => {
  it('no exige soporte ni plantillas de la preparación y puede llegar a Aspire', () => {
    const doc = placeSources(emptyDocument('p1', 'G'), [src('a', 10, 30)]);
    expect(mesaChecks(doc).some((g) => g.id === 'maquina' && g.state === 'error')).toBe(true);
    expect(mesaChecks(doc, undefined, { legacy: true }).some((g) => g.id === 'maquina')).toBe(false);
    const checked = { ...doc, stamps: doc.stamps.map((s) => ({ ...s, fine: { mode: 'auto' as const, needsFine: false, inputHash: 'x', widthMm: s.widthMm, heightMm: s.heightMm, recipe: s.recipe, outcome: 'sin_repaso', analysisVersion: 1 } })) };
    const state = { savedRevision: 1, dirty: false, syncedRevision: null, fileRevision: null };
    expect(mesaProgress(checked, state).step).toBe('revisar');
    expect(mesaProgress(checked, state, undefined, { legacy: true }).step).toBe('aspire');
  });
});

describe('mesa: gadget anterior ya sincronizado', () => {
  it('no vuelve a pedir el chequeo de fresa si ya está en Aspire', () => {
    const doc = placeSources(emptyDocument('p1', 'G'), [src('a', 10, 30)]);
    const pending = mesaProgress(doc, { savedRevision: 1, dirty: false, syncedRevision: null, fileRevision: null }, undefined, { legacy: true });
    expect(pending.step).toBe('revisar');
    expect(pending.blocking).toMatch(/Chequeá la fresa/);
    const synced = mesaProgress(doc, { savedRevision: 1, dirty: false, syncedRevision: 1, fileRevision: 1 }, undefined, { legacy: true });
    expect(synced.done.fabricar).toBe(true);
  });
});

describe('mesa: vencimiento para mostrar', () => {
  it('arma el texto y marca lo urgente', async () => {
    const { dueText } = await import('./mesa');
    const today = new Date(2026, 9, 18);
    expect(dueText({ deadlineAt: '2026-10-18' }, today)).toEqual({ text: 'vence hoy', urgent: true });
    expect(dueText({ deadlineAt: '2026-10-17' }, today)).toEqual({ text: 'venció ayer', urgent: true });
    expect(dueText({ deadlineAt: '2026-10-28' }, today)).toEqual({ text: 'vence en 10 días', urgent: false });
    expect(dueText({ isPriority: true }, today)).toEqual({ text: 'prioritario', urgent: true });
    expect(dueText({}, today)).toBeNull();
  });
});
