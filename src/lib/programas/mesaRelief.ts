/** Geometría orientativa del relieve. No genera ni valida trayectorias CAM. */
import type { FinePiece } from './preparation';
import { FRESA_ANALYSIS_VERSION, FRESA_FINA, primaryProfile, type FresaProfile } from '@/lib/fresa/config';
import { distanceToBlack } from '@/lib/fresa/vcarveRelief';
import { PREPARATION_RULES, type StampPlacement } from './preparation';

export const MESA_CAMERA = { tiltDeg: 57, turnDeg: -32, scale: 1.22 };
const tilt = MESA_CAMERA.tiltDeg * Math.PI / 180;
const turn = MESA_CAMERA.turnDeg * Math.PI / 180;
/** Proyección del Z real en el plano de la imagen, antes de la cámara CSS. */
export function projectRelief(x: number, y: number, depth: number): [number, number] {
  return [x + Math.sin(turn) * Math.tan(tilt) * depth, y + Math.cos(turn) * Math.tan(tilt) * depth];
}

/**
 * Herramienta de una operación. `flat`: fresa recta (fondo plano, sin flanco);
 * `cone`: cónica con punta plana de `tipDiameterMm` y `halfAngleDeg` por lado.
 */
export interface MachiningTool {
  id: 'desbaste' | 'cajeado' | 'perfilado' | 'repaso';
  label: string;
  kind: 'flat' | 'cone';
  tipDiameterMm: number;
  halfAngleDeg: number;
  depthMm: number;
}

/**
 * Secuencia real confirmada por el usuario (2026-10-17, POL-089): desbaste
 * general con recta de 6 mm, cajeado con cónica de 15° por lado (punta 1,1 mm
 * según la plantilla nativa «2 Cajeado 1MM»),
 * perfilado con la «0,5» (configurada 0,6 mm, 15°) y, si corresponde, el
 * perfilado fino «0,1» (configurado 0,2 mm, 30°) hasta 0,6 mm. Las tres
 * primeras bajan a la profundidad de la receta.
 */
export function machiningSequence(recipe: StampPlacement['recipe'], withFine: boolean): MachiningTool[] {
  const main = primaryProfile(recipe);
  const tools: MachiningTool[] = [
    { id: 'desbaste', label: 'Desbaste · recta 6 mm', kind: 'flat', tipDiameterMm: 6, halfAngleDeg: 0, depthMm: main.finalDepthMm },
    { id: 'cajeado', label: 'Cajeado · cónica 15°, punta 1,1 mm', kind: 'cone', tipDiameterMm: 1.1, halfAngleDeg: 15, depthMm: main.finalDepthMm },
    { id: 'perfilado', label: 'Perfilado · 0,6 mm 15°', kind: 'cone', tipDiameterMm: main.tipDiameterMm, halfAngleDeg: main.halfAngleDeg, depthMm: main.finalDepthMm },
  ];
  if (withFine) tools.push({ id: 'repaso', label: 'Perfilado fino · 0,2 mm 30°', kind: 'cone', tipDiameterMm: FRESA_FINA.tipDiameterMm, halfAngleDeg: FRESA_FINA.halfAngleDeg, depthMm: FRESA_FINA.finalDepthMm });
  return tools;
}

export function reliefTools(stamp: StampPlacement, inputHash?: string): { tools: MachiningTool[]; note: string; pieces?: FinePiece[] } {
  const { profiles, note, pieces } = reliefPasses(stamp, inputHash);
  return { tools: machiningSequence(stamp.recipe, profiles.length > 1), note, ...(pieces ? { pieces } : {}) };
}

/**
 * Qué pasadas simular: lo mismo que hace el gadget. «Completo» y «automático
 * sin chequear» repasan todo el sello (el gadget, sin análisis vigente, mete el
 * sello entero); «automático» chequeado repasa solo las piezas elegidas
 * (`pieces`) o nada si la 0,6 alcanza.
 */
export function reliefPasses(stamp: StampPlacement, inputHash?: string): { profiles: FresaProfile[]; note: string; pieces?: FinePiece[] } {
  const profiles = [primaryProfile(stamp.recipe)];
  const fine = stamp.fine;
  const checked = fine?.analysisVersion === FRESA_ANALYSIS_VERSION && fine.widthMm === stamp.widthMm
    && fine.heightMm === stamp.heightMm && fine.recipe === stamp.recipe && fine.outcome !== 'sin_analisis'
    && !!fine.inputHash && (inputHash === undefined || fine.inputHash === inputHash);
  if (fine?.mode === 'aspire' || fine?.scope === 'internal' && fine.mode !== 'none') {
    return { profiles, note: 'Principal · repaso parcial sin simular' };
  }
  if (fine?.mode === 'none') return { profiles, note: 'Principal · sin repaso (elegido)' };
  if (fine?.mode === 'whole') { profiles.push(FRESA_FINA); return { profiles, note: 'Principal + repaso completo' }; }
  // Automático.
  if (!checked) { profiles.push(FRESA_FINA); return { profiles, note: 'Principal + repaso completo (sin chequear: así lo hace el gadget)' }; }
  if (!fine!.needsFine) return { profiles, note: 'Principal · sin repaso: la 0,6 alcanza' };
  profiles.push(FRESA_FINA);
  if (fine!.pieces?.length) return { profiles, note: `Principal + repaso en ${fine!.pieces.length} pieza${fine!.pieces.length === 1 ? '' : 's'}`, pieces: fine!.pieces };
  return { profiles, note: 'Principal + repaso completo' };
}

const asTool = (t: FresaProfile | MachiningTool): MachiningTool => 'kind' in t ? t
  : { id: 'perfilado', label: t.label, kind: 'cone', tipDiameterMm: t.tipDiameterMm, halfAngleDeg: t.halfAngleDeg, depthMm: t.finalDepthMm };

/**
 * Profundidad final = la más honda que deja cualquiera de las herramientas
 * (el orden no cambia el resultado). Cónica: los centros alcanzables bajan
 * hasta (holgura - radio de punta) / tan(ángulo), con tope en su profundidad,
 * y la punta plana barre su radio; con un flanco lineal esto es exacto (los
 * flancos de centros más lejanos nunca superan el barrido de la punta).
 * Recta: el centro entra donde la holgura alcanza su radio y barre ese radio
 * a profundidad completa. Se agrega margen para herramientas que trabajan
 * desde afuera del recuadro. Nunca toca el diseño (positivo).
 */
export function machiningDepth(black: Uint8Array, w: number, h: number, cellMm: number, tools: (FresaProfile | MachiningTool)[]): Float32Array {
  const list = tools.map(asTool);
  const pad = Math.ceil(Math.max(0, ...list.map((t) => t.tipDiameterMm / 2)) / cellMm) + 2;
  const W = w + pad * 2, H = h + pad * 2;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) mask.set(black.subarray(y * w, y * w + w), (y + pad) * W + pad);
  const dist = distanceToBlack(mask, W, H);
  const padded = new Float32Array(W * H);
  const clearance = (i: number) => Math.max(0, dist[i] - 0.5) * cellMm;
  for (const tool of list) {
    const radius = tool.tipDiameterMm / 2;
    if (tool.kind === 'flat') {
      const fits = new Uint8Array(W * H);
      for (let i = 0; i < fits.length; i++) fits[i] = clearance(i) >= radius ? 1 : 0;
      const toCenter = distanceToBlack(fits, W, H);
      for (let i = 0; i < padded.length; i++) {
        if (!mask[i] && toCenter[i] * cellMm <= radius + 1e-9) padded[i] = Math.max(padded[i], tool.depthMm);
      }
      continue;
    }
    const slope = Math.tan(tool.halfAngleDeg * Math.PI / 180);
    const centers = new Float32Array(W * H);
    for (let i = 0; i < centers.length; i++) centers[i] = Math.max(0, Math.min(tool.depthMm, (clearance(i) - radius) / slope));
    const reach = Math.ceil(radius / cellMm);
    const offsets: number[] = [];
    for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) {
      if (Math.hypot(x, y) * cellMm <= radius + 1e-9) offsets.push(x, y);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      let depth = padded[i];
      for (let k = 0; k < offsets.length; k += 2) {
        const nx = x + offsets[k], ny = y + offsets[k + 1];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) depth = Math.max(depth, centers[ny * W + nx]);
      }
      padded[i] = depth;
    }
  }
  const result = new Float32Array(w * h);
  for (let y = 0; y < h; y++) result.set(padded.subarray((y + pad) * W + pad, (y + pad) * W + pad + w), y * w);
  return result;
}

/**
 * Operaciones de frente de la base C (plantillas nativas exportadas):
 * «1 Planeado 6MM» baja 0,5 mm toda la planchuela; «1 Cajeado 6MM» desbasta
 * 3 mm entre «Rectangulo exterior» y «Offset 1 vector» (la isla del sello);
 * «2 Cajeado 1MM» va entre «VECTOR» y «Offset exterior vector»; «3 Perfilado»
 * por fuera del VECTOR; «5 Corte 6MM» sigue la línea «Corte» de 3,5 a 9 mm.
 * Profundidades desde la superficie en bruto, salvo indicación.
 */
export const FACE_OPS = {
  planeMm: 0.5,
  /** Desbaste exterior, medido desde la superficie planeada. */
  exteriorDepthMm: 3,
  /**
   * Corte, medido desde la superficie planeada: 9 mm sobre una planchuela de
   * 10 con 0,5 de planeado deja 0,5 mm uniendo los sellos (confirmado, Q-PROG-024).
   */
  cutBottomMm: 9,
  cutToolDiameterMm: 6,
};

export interface BarSegment {
  /** Tramo a lo largo de la planchuela, en mm del mundo (hacia abajo). */
  y0: number; y1: number;
  /** Cuánto se bajó desde la superficie en bruto. */
  depthMm: number;
  kind: 'mecanizado' | 'corte' | 'bruto';
}

/**
 * Tramos de una planchuela después del frente: planeado + desbaste exterior
 * desde la punta hasta 3 mm debajo del último corte (el rectángulo de la
 * capa «Planeado»/«Rectangulo exterior»), una ranura de la recta de 6 mm
 * centrada en cada línea de corte (4 mm debajo del diseño) y el resto en
 * bruto. Las islas de los sellos se dibujan aparte.
 */
export function barSegments(col: { topY: number; bottomY: number }, stamps: { topY: number; heightMm: number }[]): BarSegment[] {
  const start = -col.topY, end = -col.bottomY;
  if (!stamps.length) return [{ y0: start, y1: end, depthMm: 0, kind: 'bruto' }];
  const half = FACE_OPS.cutToolDiameterMm / 2;
  const cuts = stamps.map((s) => -(s.topY - s.heightMm - PREPARATION_RULES.cutBelowDesignMm)).sort((a, b) => a - b);
  const machinedEnd = Math.min(end, cuts[cuts.length - 1] + PREPARATION_RULES.rectangleBelowCutMm);
  const out: BarSegment[] = [];
  let y = start;
  const push = (y1: number, depthMm: number, kind: BarSegment['kind']) => { if (y1 > y + 1e-6) out.push({ y0: y, y1, depthMm, kind }); y = Math.max(y, y1); };
  for (const c of cuts) {
    push(Math.min(machinedEnd, c - half), FACE_OPS.planeMm + FACE_OPS.exteriorDepthMm, 'mecanizado');
    push(Math.min(end, c + half), FACE_OPS.planeMm + FACE_OPS.cutBottomMm, 'corte');
  }
  push(machinedEnd, FACE_OPS.planeMm + FACE_OPS.exteriorDepthMm, 'mecanizado');
  push(end, 0, 'bruto');
  return out;
}

/** Isla (Offset 1 vector) y offset exterior, con los mismos offsets que el gadget. */
export function stampIsland(black: Uint8Array, w: number, h: number, cellMm: number): { island: Uint8Array; exterior: Uint8Array } {
  const [grow, shrink, outer] = PREPARATION_RULES.offsetsMm;
  const toDesign = distanceToBlack(black, w, h);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < outside.length; i++) outside[i] = toDesign[i] * cellMm > grow ? 1 : 0;
  const toOutside = distanceToBlack(outside, w, h);
  const island = new Uint8Array(w * h);
  for (let i = 0; i < island.length; i++) island[i] = black[i] || toOutside[i] * cellMm > Math.abs(shrink) ? 1 : 0;
  const toIsland = distanceToBlack(island, w, h);
  const exterior = new Uint8Array(w * h);
  for (let i = 0; i < exterior.length; i++) exterior[i] = toIsland[i] * cellMm <= outer ? 1 : 0;
  return { island, exterior };
}

/**
 * Superficie del frente de un sello (desde la cara planeada): desbaste
 * exterior a 3 mm con la recta de 6 fuera de la isla, y cajeado/perfilados
 * cónicos dentro del offset exterior hasta la profundidad de la receta. La
 * grilla tiene que traer margen alrededor de la isla (la recta trabaja
 * desde afuera). Nunca toca el diseño.
 */
export function faceDepth(black: Uint8Array, w: number, h: number, cellMm: number, tools: MachiningTool[]): Float32Array {
  const pad = Math.ceil((FACE_OPS.cutToolDiameterMm / 2 + 1) / cellMm);
  const W = w + pad * 2, H = h + pad * 2;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) mask.set(black.subarray(y * w, y * w + w), (y + pad) * W + pad);
  const { island, exterior } = stampIsland(mask, W, H, cellMm);
  const depth = new Float32Array(W * H);
  // Desbaste exterior: la recta de 6 no invade la isla.
  const toIsland = distanceToBlack(island, W, H);
  const radius = FACE_OPS.cutToolDiameterMm / 2;
  const fits = new Uint8Array(W * H);
  for (let i = 0; i < fits.length; i++) fits[i] = Math.max(0, toIsland[i] - 0.5) * cellMm >= radius ? 1 : 0;
  const toCenter = distanceToBlack(fits, W, H);
  for (let i = 0; i < depth.length; i++) if (!island[i] && toCenter[i] * cellMm <= radius + 1e-9) depth[i] = FACE_OPS.exteriorDepthMm;
  // Cónicas: centros dentro del offset exterior, con holgura respecto del diseño.
  const toDesign = distanceToBlack(mask, W, H);
  for (const tool of tools.filter((t) => t.kind === 'cone')) {
    const r = tool.tipDiameterMm / 2, slope = Math.tan(tool.halfAngleDeg * Math.PI / 180);
    const centers = new Float32Array(W * H);
    for (let i = 0; i < centers.length; i++) {
      centers[i] = exterior[i] ? Math.max(0, Math.min(tool.depthMm, (Math.max(0, toDesign[i] - 0.5) * cellMm - r) / slope)) : 0;
    }
    const reach = Math.ceil(r / cellMm);
    const offsets: number[] = [];
    for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) if (Math.hypot(x, y) * cellMm <= r + 1e-9) offsets.push(x, y);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      let d = depth[i];
      for (let k = 0; k < offsets.length; k += 2) {
        const nx = x + offsets[k], ny = y + offsets[k + 1];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) d = Math.max(d, centers[ny * W + nx]);
      }
      depth[i] = d;
    }
  }
  const result = new Float32Array(w * h);
  for (let y = 0; y < h; y++) result.set(depth.subarray((y + pad) * W + pad, (y + pad) * W + pad + w), y * w);
  return result;
}

export interface ReliefMesh {
  /** xyz (z = profundidad negativa) y normal por vértice. */
  vertices: Float32Array;
  lines: Float32Array;
  widthMm: number;
  heightMm: number;
  maxDepthMm: number;
}

/** Una misma malla para contornos y bronce. Líneas de nivel y secciones de los flancos. */
/** Largo mínimo (mm) de una línea de nivel para dibujarla: descarta motas de la grilla. */
const MIN_LINE_MM = 1;

/** Une segmentos sueltos en trazos y quita los trazos cortos (ruido de la grilla). */
function dropShortLines(segments: number[]): number[] {
  const key = (x: number, y: number) => `${Math.round(x * 2000)},${Math.round(y * 2000)}`;
  const count = segments.length / 6;
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map<string, number>();
  for (let i = 0; i < count; i++) for (const o of [0, 3]) {
    const k = key(segments[i * 6 + o], segments[i * 6 + o + 1]);
    const j = owner.get(k);
    if (j === undefined) owner.set(k, i); else parent[find(i)] = find(j);
  }
  const length = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const r = find(i), b = i * 6;
    length.set(r, (length.get(r) ?? 0) + Math.hypot(segments[b + 3] - segments[b], segments[b + 4] - segments[b + 1]));
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if ((length.get(find(i)) ?? 0) >= MIN_LINE_MM) out.push(...segments.slice(i * 6, i * 6 + 6));
  return out;
}

export function buildReliefMesh(depth: Float32Array, w: number, h: number, widthMm: number, heightMm: number, maxDepthMm: number, floorsMm: number[] = []): ReliefMesh {
  const dx = widthMm / (w - 1), dy = heightMm / (h - 1);
  const vertices = new Float32Array((w - 1) * (h - 1) * 6 * 6);
  const lines: number[] = [];
  const normal = new Float32Array(w * h * 3);
  const at = (x: number, y: number) => depth[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (at(x + 1, y) - at(x - 1, y)) / (2 * dx);
    const ny = (at(x, y + 1) - at(x, y - 1)) / (2 * dy);
    const length = Math.hypot(nx, ny, 1), i = (y * w + x) * 3;
    normal.set([nx / length, ny / length, 1 / length], i);
  }
  const point = (index: number): [number, number, number] => [(index % w) * dx, Math.floor(index / w) * dy, -depth[index]];
  let cursor = 0;
  // Aristas reales, como curvas de nivel apenas por dentro de cada cambio de altura:
  // borde del diseño, pie de sus paredes (fondo del cajeado), borde de la isla
  // (justo debajo del fondo) y pie de la isla (rebaje).
  const levels = [0.02, maxDepthMm - 0.02];
  for (const f of floorsMm) if (f > 0.05 && f < maxDepthMm - 0.05) levels.push(f - 0.02, f + 0.02);
  const triangle = (ids: number[]) => {
    for (const id of ids) { vertices.set(point(id), cursor); vertices.set(normal.subarray(id * 3, id * 3 + 3), cursor + 3); cursor += 6; }
    const min = Math.min(...ids.map((id) => depth[id])), max = Math.max(...ids.map((id) => depth[id]));
    for (const level of levels) {
      if (level < min || level >= max) continue;
      const hits: number[][] = [];
      for (let i = 0; i < 3; i++) {
        const a = ids[i], b = ids[(i + 1) % 3];
        if ((depth[a] > level) === (depth[b] > level)) continue;
        const t = (level - depth[a]) / (depth[b] - depth[a]);
        const p = point(a), q = point(b);
        hits.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, -level]);
      }
      if (hits.length === 2) lines.push(...hits[0], ...hits[1]);
    }
  };
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const a = y * w + x, b = a + 1, c = a + w, d = c + 1;
    triangle([a, b, c]); triangle([b, d, c]);
  }
  return { vertices, lines: new Float32Array(dropShortLines(lines)), widthMm, heightMm, maxDepthMm };
}
