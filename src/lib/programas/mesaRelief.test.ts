import { describe, expect, it } from 'vitest';
import { FRESA_ANALYSIS_VERSION, FRESA_FINA, primaryProfile } from '@/lib/fresa/config';
import { barSegments, buildReliefMesh, faceDepth, FACE_OPS, machiningDepth, machiningSequence, MESA_CAMERA, projectRelief, reliefPasses, reliefTools, stampIsland } from './mesaRelief';
import type { StampPlacement } from './preparation';

const stamp: StampPlacement = {
  instanceId: 'a', selloId: 'a', name: 'Prueba', columnId: 'p25', centerX: 0, topY: 0,
  widthMm: 15, heightMm: 30, rotationDeg: 0, recipe: 'CLASICO', pinned: false, excluded: false,
  sourceUrl: 'test.svg', sourceWidthMm: 15, sourceHeightMm: 30,
};
const fine: NonNullable<StampPlacement['fine']> = { mode: 'auto', scope: 'full', needsFine: true, inputHash: 'svg-a',
  analysisVersion: FRESA_ANALYSIS_VERSION, widthMm: 15, heightMm: 30, recipe: 'CLASICO', outcome: 'con_repaso' };

describe('relieve estimado de la mesa', () => {
  it('conserva el positivo y respeta la pendiente y profundidad del perfil', () => {
    const w = 81, h = 9, cell = 0.05;
    const mask = Uint8Array.from({ length: w * h }, (_, i) => i % w <= 10 ? 1 : 0);
    for (const recipe of ['CLASICO', '3MM', 'ALIMENTO'] as const) {
      const profile = primaryProfile(recipe);
      const depth = machiningDepth(mask, w, h, cell, [profile]);
      expect(depth[4 * w + 10]).toBe(0);
      // Punta barrida contra una pared recta: z = distancia / tan(ángulo).
      expect(depth[4 * w + 14]).toBeCloseTo(0.175 / Math.tan(Math.PI / 12), 4);
      expect(depth[4 * w + 50]).toBeCloseTo(profile.finalDepthMm, 4);
      expect(Math.max(...depth)).toBeCloseTo(profile.finalDepthMm, 4);
    }
  });

  it('no inventa acceso de la principal a un hueco más angosto que su punta', () => {
    const w = 61, h = 41, cell = 0.025;
    // Hueco cerrado (las herramientas pueden trabajar desde afuera del recuadro).
    const mask = Uint8Array.from({ length: w * h }, (_, i) => i % w < 22 || i % w > 38 || i < w || i >= (h - 1) * w ? 1 : 0);
    const main = machiningDepth(mask, w, h, cell, [primaryProfile('CLASICO')]);
    const both = machiningDepth(mask, w, h, cell, [primaryProfile('CLASICO'), FRESA_FINA]);
    expect(Math.max(...main)).toBe(0);
    expect(both[20 * w + 30]).toBeGreaterThan(0.1);
    expect(Math.max(...both)).toBeLessThanOrEqual(0.6);
    expect(both[4 * w + 21]).toBe(0);
    both.forEach((d, i) => expect(d).toBeGreaterThanOrEqual(main[i]));
  });

  it('el repaso usa su ángulo de 30° y no supera 0,6 mm', () => {
    const w = 61, h = 7, cell = 0.025;
    const mask = Uint8Array.from({ length: w * h }, (_, i) => i % w <= 10 ? 1 : 0);
    const depth = machiningDepth(mask, w, h, cell, [FRESA_FINA]);
    expect(depth[3 * w + 14]).toBeCloseTo(0.0875 / Math.tan(Math.PI / 6), 4);
    expect(depth[3 * w + 40]).toBeCloseTo(0.6, 5);
  });

  it('incluye repaso completo explícito o chequeado y señala el parcial sin inventarlo', () => {
    expect(reliefPasses({ ...stamp, fine }, 'svg-a').profiles).toHaveLength(2);
    expect(reliefPasses({ ...stamp, fine: { ...fine, mode: 'whole', inputHash: '' } }).profiles).toHaveLength(2);
    for (const mode of ['none', 'aspire'] as const) {
      expect(reliefPasses({ ...stamp, fine: { ...fine, mode } }).profiles).toHaveLength(1);
    }
    expect(reliefPasses({ ...stamp, fine: { ...fine, scope: 'internal' } }).note).toContain('parcial sin simular');
  });

  it('invalida el repaso automático si cambia el SVG, la medida, receta o versión de chequeo', () => {
    for (const changed of [{ heightMm: 32 }, { widthMm: 16 }, { recipe: '3MM' as const },
      { fine: { ...fine, analysisVersion: FRESA_ANALYSIS_VERSION - 1 } }]) {
      const result = reliefPasses({ ...stamp, fine, ...changed }, 'svg-a');
      expect(result.profiles).toHaveLength(1);
      expect(result.note).toContain('pendiente');
    }
    expect(reliefPasses({ ...stamp, fine }, 'svg-b').profiles).toHaveLength(1);
    expect(reliefPasses(stamp).note).toContain('pendiente');
  });

  it('genera superficie, normales y líneas con profundidad real para ambos materiales', () => {
    const depth = new Float32Array([0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1]);
    const mesh = buildReliefMesh(depth, 3, 3, 2, 2, 1);
    expect(mesh.vertices.length).toBe(4 * 6 * 6);
    expect(mesh.lines.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.vertices.length; i += 6) {
      expect(mesh.vertices[i + 2]).toBeGreaterThanOrEqual(-1);
      expect(mesh.vertices[i + 2]).toBeLessThanOrEqual(0);
      expect(Math.hypot(...mesh.vertices.slice(i + 3, i + 6))).toBeCloseTo(1, 5);
    }
    expect([...mesh.lines].filter((_, i) => i % 3 === 2).some((z) => z < 0)).toBe(true);
  });

  it('proyecta la altura sin exagerarla y coincide con la cámara CSS', () => {
    const a = MESA_CAMERA.turnDeg * Math.PI / 180, b = MESA_CAMERA.tiltDeg * Math.PI / 180;
    const [x, y, d] = [4, 7, 1.7];
    const [u, v] = projectRelief(x, y, d);
    expect(Math.cos(a) * u - Math.sin(a) * v).toBeCloseTo(Math.cos(a) * x - Math.sin(a) * y, 10);
    expect((Math.sin(a) * u + Math.cos(a) * v) * Math.cos(b))
      .toBeCloseTo((Math.sin(a) * x + Math.cos(a) * y) * Math.cos(b) + d * Math.sin(b), 10);
  });
});

describe('secuencia real de mecanizado', () => {
  it('desbaste, cajeado y perfilado a la profundidad de la receta; el fino solo con repaso', () => {
    const base = machiningSequence('CLASICO', false);
    expect(base.map((t) => t.id)).toEqual(['desbaste', 'cajeado', 'perfilado']);
    expect(base.every((t) => t.depthMm === 1.7)).toBe(true);
    expect(base[0]).toMatchObject({ kind: 'flat', tipDiameterMm: 6 });
    expect(base[1]).toMatchObject({ kind: 'cone', tipDiameterMm: 1.1, halfAngleDeg: 15 });
    expect(base[2]).toMatchObject({ kind: 'cone', tipDiameterMm: 0.6, halfAngleDeg: 15 });
    const withFine = machiningSequence('3MM', true);
    expect(withFine.map((t) => t.id)).toEqual(['desbaste', 'cajeado', 'perfilado', 'repaso']);
    expect(withFine[3]).toMatchObject({ tipDiameterMm: 0.2, halfAngleDeg: 30, depthMm: 0.6 });
    expect(withFine.slice(0, 3).every((t) => t.depthMm === 3)).toBe(true);
    expect(reliefTools({ ...stamp, fine }, 'svg-a').tools).toHaveLength(4);
  });

  it('la recta de 6 mm deja fondo plano lejos del diseño y no entra en un canal angosto', () => {
    const cell = 0.1, w = 200, h = 40;
    // Diseño: columna izquierda y un canal de 4 mm entre x=10 y x=14 mm.
    const mask = Uint8Array.from({ length: w * h }, (_, i) => { const x = (i % w) * cell; return x < 10 || (x > 14 && x < 15) ? 1 : 0; });
    const [flat] = machiningSequence('CLASICO', false);
    const depth = machiningDepth(mask, w, h, cell, [flat]);
    expect(depth[20 * w + 170]).toBeCloseTo(1.7, 5); // abierto (x=17 mm): profundidad completa
    expect(depth[20 * w + 170]).toBe(depth[20 * w + 195]); // fondo plano
    expect(depth[20 * w + 120]).toBe(0); // canal de 4 mm (x=12 mm): la de 6 no entra
    expect(depth[20 * w + 50]).toBe(0); // nunca toca el diseño
  });

  it('en una ranura de 0,8 mm no entra la punta de 1 mm, pero sí la de 0,6; la secuencia nunca queda menos honda', () => {
    // Contra una pared recta, el mismo ángulo da la misma pendiente sea cual sea la punta:
    // la punta solo decide en ranuras y rincones angostos.
    const cell = 0.025, w = 81, h = 241;
    const mask = Uint8Array.from({ length: w * h }, (_, i) => i % w < 24 || i % w > 55 ? 1 : 0);
    const tools = machiningSequence('CLASICO', true);
    const all = machiningDepth(mask, w, h, cell, tools);
    const only1mm = machiningDepth(mask, w, h, cell, [tools[1]]);
    const mid = 120 * w + 40; // centro de la ranura, lejos de sus extremos
    expect(only1mm[mid]).toBe(0);
    expect(all[mid]).toBeGreaterThan(0.2);
    all.forEach((d, i) => expect(d).toBeGreaterThanOrEqual(only1mm[i]));
    expect(Math.max(...all)).toBeLessThanOrEqual(1.7 + 1e-6);
  });

  it('las líneas son solo aristas: borde del diseño, pie de las paredes y contorno', () => {
    const w = 30, h = 30;
    const depth = Float32Array.from({ length: w * h }, (_, i) => { const x = i % w; return x < 10 ? 0 : x < 15 ? (x - 10) * 0.34 : 1.7; });
    const mesh = buildReliefMesh(depth, w, h, 3, 3, 1.7);
    const zs = [...mesh.lines].filter((_, i) => i % 3 === 2);
    // Ninguna línea a media pendiente (sin grilla ni curvas intermedias), salvo el contorno exterior.
    const inner = zs.filter((z) => z < -0.1 && z > -1.6);
    expect(inner.length).toBeLessThan(zs.length * 0.2);
  });
});

describe('operaciones del frente', () => {
  it('isla = diseño +4 −3,5 (cerrado y 0,5 más grande) y offset exterior +1,5', () => {
    const cell = 0.1, w = 220, h = 220;
    // Dos bloques separados por 2 mm (lugar de sobra para crecer 4 mm): el cierre los une.
    const black = Uint8Array.from({ length: w * h }, (_, i) => { const x = i % w, y = Math.floor(i / w); return y > 80 && y < 140 && ((x > 80 && x < 100) || (x > 120 && x < 140)) ? 1 : 0; });
    const { island, exterior } = stampIsland(black, w, h, cell);
    expect(island[110 * w + 110]).toBe(1); // hueco de 2 mm entre bloques: queda dentro de la isla
    expect(island[110 * w + 76]).toBe(1); // 0,5 mm afuera del diseño
    expect(island[110 * w + 74]).toBe(0);
    expect(exterior[110 * w + 63]).toBe(1); // +2 mm
    expect(exterior[110 * w + 59]).toBe(0);
  });

  it('desbaste exterior a 3 mm fuera de la isla; adentro solo las cónicas a la profundidad de la receta', () => {
    const cell = 0.1, w = 160, h = 160;
    const black = Uint8Array.from({ length: w * h }, (_, i) => { const x = i % w, y = Math.floor(i / w); return x > 50 && x < 110 && y > 50 && y < 110 && !(x > 70 && x < 90 && y > 70 && y < 90) ? 1 : 0; });
    const depth = faceDepth(black, w, h, cell, machiningSequence('CLASICO', false));
    expect(depth[10 * w + 10]).toBeCloseTo(FACE_OPS.exteriorDepthMm, 5); // lejos: desbaste
    expect(depth[80 * w + 80]).toBeCloseTo(1.7, 5); // ojo de 2 mm dentro de la isla: cajeado a 1,7
    expect(depth[80 * w + 60]).toBe(0); // el diseño no se toca
    expect(Math.max(...depth)).toBeCloseTo(3, 5);
  });

  it('planchuela: rebajada hasta 3 mm después del último corte, ranuras de 6 mm a 9 y el resto en bruto', () => {
    const col = { topY: -8.958, bottomY: -400 };
    const stamps = [{ topY: -8.958, heightMm: 30 }, { topY: -50.958, heightMm: 20 }];
    const seg = barSegments(col, stamps);
    expect(seg[0]).toMatchObject({ kind: 'mecanizado', depthMm: 3.5 });
    const cuts = seg.filter((g) => g.kind === 'corte');
    expect(cuts).toHaveLength(2);
    cuts.forEach((c) => { expect(c.y1 - c.y0).toBeCloseTo(6, 6); expect(c.depthMm).toBe(9.5); });
    expect(cuts[0].y0).toBeCloseTo(8.958 + 30 + 4 - 3, 6);
    const last = seg[seg.length - 1];
    expect(last).toMatchObject({ kind: 'bruto', depthMm: 0 });
    expect(last.y0).toBeCloseTo(50.958 + 20 + 4 + 3, 6);
    expect(barSegments(col, [])).toEqual([{ y0: 8.958, y1: 400, depthMm: 0, kind: 'bruto' }]);
    for (let i = 1; i < seg.length; i++) expect(seg[i].y0).toBeCloseTo(seg[i - 1].y1, 6);
  });
});

describe('planchuela real', () => {
  it('el corte deja 0,5 mm uniendo los sellos (10 mm − 0,5 de planeado − 9 de corte)', async () => {
    const { FIXTURE } = await import('./fixture');
    expect(FIXTURE.barHeightMm).toBe(10);
    expect(FIXTURE.barHeightMm - (FACE_OPS.planeMm + FACE_OPS.cutBottomMm)).toBeCloseTo(0.5, 10);
  });
});
