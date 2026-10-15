/**
 * Corrección automática: busca, para cada lugar donde no llega la fresa, la
 * operación que menos cambia el diseño y que hace que la fresa pase.
 *
 * Orden de preferencia (como trabaja el operario en Aspire):
 * 1. Ángulos que se cierran en punta: no se tocan (la punta de la fresa los marca).
 * 2. Partes muy juntas de piezas distintas: se separan moviendo letras o líneas
 *    enteras, respetando la alineación del bloque (ver `layout.ts`). La forma de
 *    cada letra queda intacta. Si en un renglón la mayoría de los pares están
 *    justos, se abre el espaciado de todo el renglón por igual (queda parejo);
 *    si no, se separa solo el par.
 * 3. Ojos de letra chicos: se agranda el ojo en paralelo (offset del contorno).
 * 4. Ranuras dentro de una misma pieza: se ensanchan en paralelo.
 *
 * Cada candidata se verifica con el mismo chequeo: se acepta solo si resuelve
 * y no crea un problema nuevo. Las de 3 y 4 además no pueden partir piezas, unir
 * huecos ni dejar trazos negros por debajo de `MIN_BLACK_WIDTH_MM`. Lo que no
 * tiene una solución así queda para editar a mano.
 */
import {
  DEFAULT_ANALYSIS_OPTIONS,
  FRESA_FINA,
  MIN_BLACK_WIDTH_MM,
  cutRadiusAtDepth,
  minGapWidthMm,
  type FresaAnalysisOptions,
  type FresaProfile,
} from './config';
import {
  UM,
  bounds,
  boundsOverlap,
  clipToBounds,
  components,
  difference,
  interiorPoint,
  intersect,
  offset,
  opening,
  pointInRegion,
  rect,
  regionArea,
  translate,
  union,
  type Bounds,
  type Paths64,
} from './geometry';
import { analyzeBlackRegion, type FresaZone } from './analyze';
import { buildLayout, separationPlan, trackingPlan, type Layout, type PieceShift } from './layout';

/** Una pieza que se movió entera: su región original y cuánto se corrió (µm). */
export interface PieceMove {
  region: Paths64;
  dx: number;
  dy: number;
}

export type FixOperation =
  | { kind: 'separar'; axis: 'x' | 'y'; mm: number }
  /** Espacio extra entre todas las letras de un renglón. */
  | { kind: 'espaciar'; axis: 'x'; mm: number }
  | { kind: 'agrandar_ojo'; mm: number }
  | { kind: 'ensanchar'; mm: number };

export interface FixResult {
  /** Región negra corregida (µm). */
  black: Paths64;
  /** Piezas movidas (vacío si no se movió nada). */
  moves: PieceMove[];
  /** Lo que se sacó de negro después de mover (µm), en la posición ya movida. */
  removed: Paths64;
  removedAreaMm2: number;
  operations: FixOperation[];
}

export interface FixOptions {
  /** Mover piezas requiere poder reubicar sus figuras en el SVG. */
  allowMoves: boolean;
}

/** Corrimiento máximo de una separación (mm): más que esto ya cambia el diseño. */
const MAX_SHIFT_MM = 0.8;
/** Espacio extra máximo entre letras al abrir el espaciado de un renglón (mm). */
const MAX_TRACKING_MM = 0.5;
/** Desde qué proporción de pares muy juntos conviene abrir todo el renglón. */
const MIN_TIGHT_SHARE = 0.4;

const isSerious = (z: FresaZone) => (z.severity === 'alta' || z.severity === 'media') && z.kind !== 'angulo';

const zoneBoundsUm = (z: FresaZone): Bounds => ({
  minX: Math.round(z.bounds.minX * UM),
  minY: Math.round(z.bounds.minY * UM),
  maxX: Math.round(z.bounds.maxX * UM),
  maxY: Math.round(z.bounds.maxY * UM),
});

const toUm = (rings: FresaZone['rings']): Paths64 =>
  rings.map((r) => r.map((p) => ({ x: Math.round(p.x * UM), y: Math.round(p.y * UM) })));

const grow = (b: Bounds, pad: number): Bounds => ({
  minX: b.minX - pad,
  minY: b.minY - pad,
  maxX: b.maxX + pad,
  maxY: b.maxY + pad,
});

const unionBounds = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

function seriousIn(
  black: Paths64,
  window: Bounds | null,
  profile: FresaProfile,
  options: FresaAnalysisOptions,
): Bounds[] {
  const region = window ? clipToBounds(black, window, 0) : black;
  return analyzeBlackRegion(region, profile, options).zones.filter(isSerious).map(zoneBoundsUm);
}

/**
 * ¿La candidata mejora sin romper nada? Tiene que haber menos lugares con
 * problema y ninguno nuevo (todo lo que queda ya estaba, quizás corrido `pad`).
 */
function improves(
  before: Bounds[],
  candidate: Paths64,
  window: Bounds | null,
  pad: number,
  profile: FresaProfile,
  options: FresaAnalysisOptions,
): boolean {
  const after = seriousIn(candidate, window, profile, options);
  if (after.length >= before.length) return false;
  return after.every((a) => before.some((b) => boundsOverlap(a, b, pad)));
}

// ---------------------------------------------------------------- separar piezas

function assemble(layout: Layout, shift: PieceShift): Paths64 {
  const parts: Paths64 = [];
  for (const p of layout.pieces) {
    const t = shift.get(p.id);
    parts.push(...(t ? translate(p.paths, t.dx, t.dy) : p.paths));
  }
  return union(parts);
}

function shiftedBounds(b: Bounds, t: { dx: number; dy: number } | undefined): Bounds {
  return t ? { minX: b.minX + t.dx, maxX: b.maxX + t.dx, minY: b.minY + t.dy, maxY: b.maxY + t.dy } : b;
}

/** Piezas que bordean la zona, de mayor a menor contacto. */
function piecesTouching(layout: Layout, shift: PieceShift, zone: Paths64, zb: Bounds): number[] {
  const probe = offset(zone, 12);
  const hits: Array<{ id: number; area: number }> = [];
  for (const p of layout.pieces) {
    const t = shift.get(p.id);
    const pb = shiftedBounds(p.bounds, t);
    if (!boundsOverlap(pb, zb, 20)) continue;
    const local = clipToBounds(t ? translate(p.paths, t.dx, t.dy) : p.paths, grow(zb, 20), 0);
    const area = regionArea(intersect(local, probe));
    if (area > 0) hits.push({ id: p.id, area });
  }
  return hits.sort((a, z) => z.area - a.area).map((h) => h.id);
}

function combine(base: PieceShift, delta: PieceShift): PieceShift {
  const out: PieceShift = new Map(base);
  for (const [id, d] of delta) {
    const b = out.get(id) ?? { dx: 0, dy: 0 };
    out.set(id, { dx: b.dx + d.dx, dy: b.dy + d.dy });
  }
  return out;
}

function lineWindow(layout: Layout, pieceIds: Iterable<number>, shift: PieceShift): Bounds | null {
  let w: Bounds | null = null;
  for (const id of pieceIds) {
    const p = layout.pieces[id];
    const b = unionBounds(p.bounds, shiftedBounds(p.bounds, shift.get(id)));
    w = w ? unionBounds(w, b) : b;
  }
  return w ? grow(w, 1.5 * UM) : null;
}

// ---------------------------------------------------------------- offsets locales

/**
 * Regla del grosor mínimo: el corte no puede dejar negro nuevo por debajo del
 * mínimo, ni tocar trazos que ya eran más finos que el mínimo (no afinarlos más).
 */
function keepsMinBlackWidth(before: Paths64, after: Paths64, cut: Paths64): boolean {
  const cb = bounds(cut);
  if (!cb) return true;
  const rb = Math.round((MIN_BLACK_WIDTH_MM / 2) * UM) - 5;
  const win = grow(cb, 3 * rb);
  const B = clipToBounds(before, win, 0);
  const A = clipToBounds(after, win, 0);
  const thinB = difference(B, opening(B, rb));
  const thinA = difference(A, opening(A, rb));
  const newlyThin = regionArea(difference(thinA, offset(thinB, 3)));
  const touchedThin = regionArea(intersect(intersect(B, cut), offset(thinB, Math.round(rb / 2))));
  return newlyThin < 3000 && touchedThin < 3000;
}

/** Cantidad de piezas negras y de blancos en una ventana (para comparar topología). */
function localTopology(black: Paths64, window: Bounds): { black: number; white: number } {
  const local = clipToBounds(black, window, 0);
  return {
    black: components(local).length,
    white: components(difference([rect(window)], local)).length,
  };
}

/** Ensanchar en paralelo: el "alma" de la zona barrida con el radio de la fresa. */
function channelCut(zone: Paths64, R: number): Paths64 | null {
  const zb = bounds(zone);
  if (!zb) return null;
  let lo = 0;
  let hi = Math.max(2, Math.min(zb.maxX - zb.minX, zb.maxY - zb.minY) / 2);
  for (let k = 0; k < 12 && hi - lo > 2; k++) {
    const m = (lo + hi) / 2;
    if (offset(zone, -m).length) lo = m;
    else hi = m;
  }
  let core = offset(zone, -Math.round(lo * 0.85));
  if (!core.length) core = offset(zone, -Math.round(lo * 0.5));
  if (!core.length) core = zone;
  const cut = offset(core, R + 3);
  return cut.length ? cut : null;
}

/** Agrandar el ojo en paralelo: offset del hueco entero hasta que entre la fresa. */
function holeCuts(black: Paths64, z: FresaZone, R: number): Paths64[] {
  const zb = zoneBoundsUm(z);
  const win = grow(zb, R * 3);
  const white = difference([rect(win)], clipToBounds(black, win, 0));
  const center = { x: Math.round(z.center.x * UM), y: Math.round(z.center.y * UM) };
  const hole = components(white).find((c) => pointInRegion(center, c.paths));
  if (!hole) return [];
  const r = interiorPoint(hole).radiusUm;
  const base = Math.max(10, R - r + 10);
  return [base, base + 30, base + 70].map((d) => offset(hole.paths, Math.round(d)));
}

// ---------------------------------------------------------------- plan

export function planFix(
  black: Paths64,
  targets: FresaZone[],
  profile: FresaProfile = FRESA_FINA,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
  fixOptions: FixOptions = { allowMoves: true },
): FixResult {
  const R = Math.round(cutRadiusAtDepth(profile, profile.minDepthMm) * UM);
  const minGap = minGapWidthMm(profile);
  const operations: FixOperation[] = [];
  const targetBounds = targets.filter(isSerious).map(zoneBoundsUm);
  // Las zonas se corren cuando se mueven letras: se reconocen por cercanía.
  const isTarget = (z: FresaZone) =>
    isSerious(z) && targetBounds.some((t) => boundsOverlap(zoneBoundsUm(z), t, MAX_SHIFT_MM * UM * 2));

  // 1) Separar piezas.
  const layout = buildLayout(black);
  let shift: PieceShift = new Map();
  let current = black;
  if (fixOptions.allowMoves) {
    // a) Renglones donde la mayoría de los pares de letras están muy juntos:
    //    se abre el espaciado de todo el renglón por igual (queda parejo).
    const tight = new Map<number, { pairs: Set<number>; need: number }>();
    for (const z of analyzeBlackRegion(current, profile, options).zones) {
      if (z.kind !== 'paso_angosto' || !isTarget(z)) continue;
      const [a, b] = piecesTouching(layout, shift, toUm(z.rings), zoneBoundsUm(z));
      if (a == null || b == null) continue;
      const la = layout.lineOf.get(a);
      const ga = layout.glyphOf.get(a);
      const gb = layout.glyphOf.get(b);
      if (la == null || la !== layout.lineOf.get(b) || ga == null || gb == null || Math.abs(ga - gb) !== 1) continue;
      const entry = tight.get(la) ?? { pairs: new Set<number>(), need: 0 };
      entry.pairs.add(Math.min(ga, gb));
      entry.need = Math.max(entry.need, Math.max(0.03, minGap - z.gapWidthMm + 0.03) * UM);
      tight.set(la, entry);
    }
    for (const [li, { pairs, need }] of tight) {
      const line = layout.lines[li];
      const plan = trackingPlan(layout, li);
      if (!plan || pairs.size / (line.glyphs.length - 1) < MIN_TIGHT_SHARE) continue;
      const window = grow(line.bounds, MAX_TRACKING_MM * UM * line.glyphs.length + 1.5 * UM);
      const before = seriousIn(current, window, profile, options);
      for (const t of [need, need + 50, need + 120].map(Math.round).filter((v) => v <= MAX_TRACKING_MM * UM)) {
        const next = combine(shift, plan(t));
        const candidate = assemble(layout, next);
        if (components(candidate).length !== layout.pieces.length) continue;
        if (!improves(before, candidate, window, t * line.glyphs.length + 50, profile, options)) continue;
        shift = next;
        current = candidate;
        operations.push({ kind: 'espaciar', axis: 'x', mm: t / UM });
        break;
      }
    }

    // b) Pares sueltos: se separa solo ese par.
    const failed: Bounds[] = [];
    // Por ronda, un análisis completo. Dentro de la ronda cada zona se sigue
    // con el corrimiento de sus dos piezas; si ya se separaron entre sí por un
    // movimiento anterior, se deja para la ronda siguiente.
    for (let round = 0; round < 6; round++) {
      const zones = analyzeBlackRegion(current, profile, options).zones.filter(
        (q) => q.kind === 'paso_angosto' && isTarget(q) && !failed.some((f) => boundsOverlap(f, zoneBoundsUm(q), 30)),
      );
      if (!zones.length) break;
      const shiftAtAnalysis = new Map(shift);
      let acceptedInRound = 0;
      for (const z of zones) {
        const zb0 = zoneBoundsUm(z);
        const touching = piecesTouching(layout, shiftAtAnalysis, toUm(z.rings), zb0);
        if (touching.length < 2) {
          failed.push(zb0);
          continue;
        }
        const since = (id: number) => {
          const now = shift.get(id) ?? { dx: 0, dy: 0 };
          const then = shiftAtAnalysis.get(id) ?? { dx: 0, dy: 0 };
          return { dx: now.dx - then.dx, dy: now.dy - then.dy };
        };
        const da = since(touching[0]);
        const db = since(touching[1]);
        if (da.dx !== db.dx || da.dy !== db.dy) continue;
        const zb = shiftedBounds(zb0, da);
        const plan = separationPlan(layout, touching[0], touching[1]);
        if (!plan) {
          failed.push(zb);
          continue;
        }
        let accepted = false;
        const need = Math.max(0.03, minGap - z.gapWidthMm + 0.03) * UM;
        const steps = [need, need + 50, need + 120, need + 220, need + 350]
          .map(Math.round)
          .filter((d) => d <= MAX_SHIFT_MM * UM);
        const maxStep = steps[steps.length - 1] ?? 0;
        const widest = plan.shiftsFor(maxStep);
        const window = plan.axis === 'x' ? lineWindow(layout, widest.keys(), combine(shift, widest)) : null;
        const near = grow(zb, maxStep + 1.5 * UM);
        const beforeNear = seriousIn(current, near, profile, options);
        let beforeWide: Bounds[] | null = null;
        for (const d of steps) {
          const next = combine(shift, plan.shiftsFor(d));
          const candidate = assemble(layout, next);
          // Mover nunca puede encimar piezas (dos letras pegadas "resuelven" el hueco).
          if (components(candidate).length !== layout.pieces.length) continue;
          if (!improves(beforeNear, candidate, near, d + 50, profile, options)) continue;
          beforeWide ??= seriousIn(current, window, profile, options);
          if (improves(beforeWide, candidate, window, d + 50, profile, options)) {
            shift = next;
            current = candidate;
            operations.push({ kind: 'separar', axis: plan.axis, mm: d / UM });
            accepted = true;
            acceptedInRound++;
            break;
          }
        }
        if (!accepted) failed.push(zb);
      }
      if (!acceptedInRound) break;
    }
  }
  const moved = current;
  // 2) Offsets locales (ojos y ranuras), sin romper el diseño.
  // Por ronda, un análisis completo; una zona cerca de algo ya cortado en la
  // misma ronda espera a la siguiente.
  const failedEdits: Bounds[] = [];
  for (let round = 0; round < 4; round++) {
    const zones = analyzeBlackRegion(current, profile, options).zones.filter(
      (q) => isTarget(q) && !failedEdits.some((f) => boundsOverlap(f, zoneBoundsUm(q), 30)),
    );
    if (!zones.length) break;
    const touched: Bounds[] = [];
    for (const z of zones) {
      const zb = zoneBoundsUm(z);
      if (touched.some((t) => boundsOverlap(t, zb))) continue;
      const cuts =
        z.kind === 'hueco_cerrado'
          ? holeCuts(current, z, R)
          : [channelCut(toUm(z.rings), R)].filter((c): c is Paths64 => !!c);
      let accepted = false;
      for (const cut of cuts) {
        const cb = bounds(cut);
        if (!cb) continue;
        const window = grow(unionBounds(zb, cb), R + 100);
        const candidate = difference(current, cut);
        const removedNow = difference(clipToBounds(current, window, 0), clipToBounds(candidate, window, 0));
        if (!removedNow.length) continue;
        const before = localTopology(current, window);
        const after = localTopology(candidate, window);
        if (before.black !== after.black || before.white !== after.white) continue;
        if (!keepsMinBlackWidth(current, candidate, removedNow)) continue;
        const checkWindow = grow(window, 1.5 * UM);
        if (!improves(seriousIn(current, checkWindow, profile, options), candidate, checkWindow, 50, profile, options))
          continue;
        current = candidate;
        operations.push({
          kind: z.kind === 'hueco_cerrado' ? 'agrandar_ojo' : 'ensanchar',
          mm: regionArea(removedNow) / (UM * UM),
        });
        touched.push(checkWindow);
        accepted = true;
        break;
      }
      if (!accepted) failedEdits.push(zb);
    }
    if (!touched.length) break;
  }

  const removed = difference(moved, current);
  const moves: PieceMove[] = [];
  for (const p of layout.pieces) {
    const t = shift.get(p.id);
    if (t && (t.dx || t.dy)) moves.push({ region: p.paths, dx: t.dx, dy: t.dy });
  }
  return {
    black: current,
    moves,
    removed,
    removedAreaMm2: regionArea(removed) / (UM * UM),
    operations,
  };
}
