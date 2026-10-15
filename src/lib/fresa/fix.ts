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
 *    si no, se separa solo el par. En texto en arco, lo mismo a lo largo del
 *    arco; y si una letra del arco está pegada a un aro u otra pieza, se acerca
 *    o se aleja del centro todo el tramo de texto.
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
import {
  arcTrackingPlan,
  blockPartners,
  buildLayout,
  partnersGrowth,
  separationPlan,
  trackingPlan,
  type Layout,
  type PieceShift,
  type SeparationAxis,
  type SeparationPlan,
} from './layout';

/** Una pieza que se movió entera: su región original y cuánto se corrió (µm). */
export interface PieceMove {
  region: Paths64;
  dx: number;
  dy: number;
}

export type FixOperation =
  | { kind: 'separar'; axis: SeparationAxis; mm: number }
  /** Espacio extra entre todas las letras de un renglón (`arco`: de un texto en arco). */
  | { kind: 'espaciar'; axis: 'x' | 'arco'; mm: number }
  /** Renglones del mismo bloque que se ensancharon para acompañar (quedan parejos). */
  | { kind: 'acompanar'; renglones: number }
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

const placed = (layout: Layout, id: number, shift: PieceShift): Paths64 => {
  const t = shift.get(id);
  return t ? translate(layout.pieces[id].paths, t.dx, t.dy) : layout.pieces[id].paths;
};

/** Distancia mínima entre dos regiones (µm, de a 10), hasta `max`. */
function clearance(a: Paths64, b: Paths64, max: number): number {
  const touches = (d: number) => regionArea(intersect(offset(a, d / 2), offset(b, d / 2))) > 0;
  if (!touches(max)) return max;
  let lo = 0;
  let hi = max;
  while (hi - lo > 10) {
    const m = (lo + hi) / 2;
    if (touches(m)) hi = m;
    else lo = m;
  }
  return hi;
}

/**
 * Un movimiento no puede acercar dos piezas que quedan a menos del hueco
 * mínimo. El análisis puede no notarlo (junto a una punta filosa informa el
 * mismo ancho aunque la punta casi toque), así que se mide la distancia real.
 */
function keepsClearance(layout: Layout, from: PieceShift, to: PieceShift, minGapUm: number): boolean {
  const same = (a?: { dx: number; dy: number }, b?: { dx: number; dy: number }) =>
    (a?.dx ?? 0) === (b?.dx ?? 0) && (a?.dy ?? 0) === (b?.dy ?? 0);
  for (const p of layout.pieces) {
    if (same(from.get(p.id), to.get(p.id))) continue;
    const box = grow(unionBounds(shiftedBounds(p.bounds, from.get(p.id)), shiftedBounds(p.bounds, to.get(p.id))), minGapUm + 20);
    const p0 = placed(layout, p.id, from);
    const p1 = placed(layout, p.id, to);
    for (const q of layout.pieces) {
      if (q.id === p.id) continue;
      const qa = from.get(q.id);
      const qb = to.get(q.id);
      if (!boundsOverlap(shiftedBounds(q.bounds, qa), box) && !boundsOverlap(shiftedBounds(q.bounds, qb), box)) continue;
      const after = clearance(p1, clipToBounds(placed(layout, q.id, to), box, 0), minGapUm);
      if (after >= minGapUm) continue;
      const before = clearance(p0, clipToBounds(placed(layout, q.id, from), box, 0), minGapUm);
      if (after < before - 10) return false;
    }
  }
  return true;
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
  const minGapUm = Math.round(minGap * UM);
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
    //    Igual en un tramo de texto en arco, a lo largo del arco.
    type Row = { kind: 'x' | 'arco'; idx: number };
    const rowOf = (id: number): (Row & { glyph: number }) | null => {
      const li = layout.lineOf.get(id);
      if (li != null) return { kind: 'x', idx: li, glyph: layout.glyphOf.get(id)! };
      const ai = layout.arcOf.get(id);
      if (ai != null) return { kind: 'arco', idx: ai, glyph: layout.arcGlyphOf.get(id)! };
      return null;
    };
    const tight = new Map<string, Row & { pairs: Set<number>; need: number }>();
    for (const z of analyzeBlackRegion(current, profile, options).zones) {
      if (z.kind !== 'paso_angosto' || !isTarget(z)) continue;
      const [a, b] = piecesTouching(layout, shift, toUm(z.rings), zoneBoundsUm(z));
      if (a == null || b == null) continue;
      const ra = rowOf(a);
      const rb = rowOf(b);
      if (!ra || !rb || ra.kind !== rb.kind || ra.idx !== rb.idx || Math.abs(ra.glyph - rb.glyph) !== 1) continue;
      const key = `${ra.kind}${ra.idx}`;
      const entry = tight.get(key) ?? { kind: ra.kind, idx: ra.idx, pairs: new Set<number>(), need: 0 };
      entry.pairs.add(Math.min(ra.glyph, rb.glyph));
      entry.need = Math.max(entry.need, Math.max(0.03, minGap - z.gapWidthMm + 0.03) * UM);
      tight.set(key, entry);
    }
    // Renglones ya ensanchados (por su cuenta o acompañando a otro del bloque).
    const adjusted = new Set<number>();
    const ordered = [...tight.values()].sort((a, z) => z.need - a.need);
    for (const { kind, idx, pairs, need } of ordered) {
      if (kind === 'x' && adjusted.has(idx)) continue;
      const glyphs = kind === 'x' ? layout.lines[idx].glyphs : layout.arcs[idx].glyphs;
      const plan = kind === 'x' ? trackingPlan(layout, idx) : arcTrackingPlan(layout, idx);
      if (!plan || pairs.size / (glyphs.length - 1) < MIN_TIGHT_SHARE) continue;
      // Con los renglones del bloque (si los hay) y, si eso no sirve, solo.
      const partners = kind === 'x' ? blockPartners(layout, idx) : [];
      const variants: Array<{ partners: number[]; shiftsFor: (t: number) => PieceShift }> = [];
      if (partners.length) {
        variants.push({
          partners,
          shiftsFor: (t) => combine(plan(t), partnersGrowth(layout, idx, t * (glyphs.length - 1))),
        });
      }
      variants.push({ partners: [], shiftsFor: plan });
      let done = false;
      for (const v of variants) {
        if (done) break;
        const ids = [...glyphs.flat(), ...v.partners.flatMap((pi) => layout.lines[pi].glyphs.flat())];
        const window = lineWindow(layout, ids, new Map());
        const wide = window && grow(window, MAX_TRACKING_MM * UM * glyphs.length);
        const before = seriousIn(current, wide, profile, options);
        // Se queda con el paso que más resuelve (el menor si empatan): en un arco
        // el hueco entre letras es una cuña y el ancho informado no alcanza para
        // saber cuánto abrir.
        let chosen: { t: number; next: PieceShift; candidate: Paths64; left: number } | null = null;
        const steps = [need, need + 50, need + 120, need + 220, need + 350]
          .map(Math.round)
          .filter((x) => x <= MAX_TRACKING_MM * UM);
        for (const t of steps) {
          const next = combine(shift, v.shiftsFor(t));
          const candidate = assemble(layout, next);
          if (components(candidate).length !== layout.pieces.length) continue;
          if (!keepsClearance(layout, shift, next, minGapUm)) continue;
          if (!improves(before, candidate, wide, t * glyphs.length + 50, profile, options)) continue;
          const left = seriousIn(candidate, wide, profile, options).length;
          if (!chosen || left < chosen.left) chosen = { t, next, candidate, left };
          if (left === 0) break;
        }
        if (chosen) {
          shift = chosen.next;
          current = chosen.candidate;
          operations.push({ kind: 'espaciar', axis: kind, mm: chosen.t / UM });
          if (kind === 'x') {
            adjusted.add(idx);
            for (const pi of v.partners) adjusted.add(pi);
            if (v.partners.length) operations.push({ kind: 'acompanar', renglones: v.partners.length });
          }
          done = true;
        }
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
        // El centro del hueco dice de qué lado de un arco está la otra pieza
        // (los corrimientos previos son chicos al lado del alto de una letra).
        let plan = separationPlan(layout, touching[0], touching[1], {
          x: Math.round(z.center.x * UM),
          y: Math.round(z.center.y * UM),
        });
        if (!plan) {
          failed.push(zb);
          continue;
        }
        let accepted = false;
        const need = Math.max(0.03, minGap - z.gapWidthMm + 0.03) * UM;
        // Separar dos letras de un renglón lo ensancha: los renglones del bloque
        // acompañan en la misma proporción (si eso no sirve, se prueba solo).
        const lineIdx = plan.axis === 'x' ? layout.lineOf.get(touching[0]) : undefined;
        // Un par suelto mueve poco: solo arrastra a renglones justificados.
        const partnerCount = lineIdx != null ? blockPartners(layout, lineIdx, true).length : 0;
        if (lineIdx != null && partnerCount) {
          const solo = plan;
          plan = {
            axis: 'x',
            maxUm: solo.maxUm,
            shiftsFor: (d) => combine(solo.shiftsFor(d), partnersGrowth(layout, lineIdx, d, true)),
            fallback: solo,
          };
        }
        // Si el plan no sirve se prueba su alternativa (en un arco: la letra sola).
        for (let p: SeparationPlan | undefined = plan; p && !accepted; p = p.fallback) {
          const cap = Math.min(MAX_SHIFT_MM * UM, p.maxUm ?? Infinity);
          // Primero, casi sin margen: cuando la pieza está encajada entre dos
          // cosas (una letra de arco entre dos aros) cada centésima cuenta.
          const steps = [need - 25, need, need + 50, need + 120, need + 220, need + 350]
            .map(Math.round)
            .filter((d) => d >= 30 && d <= cap);
          const maxStep = steps[steps.length - 1] ?? 0;
          const widest = p.shiftsFor(maxStep);
          // Entre renglones (y) se mueve medio diseño: se re-chequea todo.
          const window = p.axis === 'y' ? null : lineWindow(layout, widest.keys(), combine(shift, widest));
          const near = grow(zb, maxStep + 1.5 * UM);
          const beforeNear = seriousIn(current, near, profile, options);
          let beforeWide: Bounds[] | null = null;
          for (const d of steps) {
            const next = combine(shift, p.shiftsFor(d));
            const candidate = assemble(layout, next);
            // Mover nunca puede encimar piezas (dos letras pegadas "resuelven" el hueco).
            if (components(candidate).length !== layout.pieces.length) continue;
            if (!keepsClearance(layout, shift, next, minGapUm)) continue;
            if (!improves(beforeNear, candidate, near, d + 50, profile, options)) continue;
            beforeWide ??= seriousIn(current, window, profile, options);
            if (improves(beforeWide, candidate, window, d + 50, profile, options)) {
              shift = next;
              current = candidate;
              operations.push({ kind: 'separar', axis: p.axis, mm: d / UM });
              // Solo si se usó la variante con el bloque (no la alternativa sola).
              if (partnerCount && p === plan) operations.push({ kind: 'acompanar', renglones: partnerCount });
              accepted = true;
              acceptedInRound++;
              break;
            }
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
