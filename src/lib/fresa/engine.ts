/**
 * Puntos de entrada puros del chequeo (corren en el Web Worker o, si no hay,
 * en el hilo principal). Reciben figuras ya leídas y la escala, nunca DOM.
 */
import {
  DEFAULT_ANALYSIS_OPTIONS,
  FRESA_FINA,
  type FresaAnalysisOptions,
  type FresaProfile,
} from './config';
import {
  analyzeBlackRegion,
  buildBlackRegion,
  type FresaCoreResult,
  type FresaZone,
  type PaintShape,
  type ZoneKind,
  type ZoneSeverity,
} from './analyze';
import { planFix, type FixOperation, type PieceMove } from './fix';
import { UM, affine, bounds, type Paths64 } from './geometry';

/** Zonas cercanas agrupadas: lo que el usuario ve como "un lugar a revisar". */
export interface FresaGroup {
  id: string;
  zoneIds: string[];
  severity: ZoneSeverity;
  kinds: ZoneKind[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  center: { x: number; y: number };
  /** Peor (menor) profundidad alcanzada en el grupo (mm). */
  reachDepthMm: number;
  /** Hueco más angosto del grupo (mm). */
  gapWidthMm: number;
}

export interface CheckOutput extends FresaCoreResult {
  groups: FresaGroup[];
  durationMs: number;
}

export interface FixOutput {
  /** Piezas movidas enteras (se reubican en el SVG sin perder curvas), en el espacio del plan. */
  moves: PieceMove[];
  /** Lo que se sacó de negro, en la posición ya movida (espacio del plan). */
  removed: Paths64;
  /** Región negra corregida en el espacio del plan (para el SVG sin figuras propias). */
  newBlack: Paths64;
  removedAreaMm2: number;
  operations: FixOperation[];
  /** Zonas pedidas que se corrigieron / que no se pudieron corregir sin romper el diseño. */
  fixedZoneIds: string[];
  skippedZoneIds: string[];
  /**
   * Escala del espacio en que se planificó la corrección: mm por unidad del SVG
   * = `mmPerUnit · planScale`. Es < 1 cuando hubo que planificar sobre el
   * diseño un poco achicado porque, al abrir espacios, creció.
   */
  planScale: number;
  /**
   * Encaje final para mantener la medida original (unidades del viewBox):
   * p' = (p − from) · scale + to. `scale` 1 = no hizo falta.
   */
  fit: { scale: number; from: { x: number; y: number }; to: { x: number; y: number } };
  /**
   * Último recurso (lo confirma quien revisa): agrandar todo el sello este
   * factor resuelve lo que quedó. Solo hasta `maxScaleUp`.
   */
  scaleUp: { factor: number; resolves: number } | null;
  /** Chequeo del resultado final, ya encajado en la medida original. */
  after: CheckOutput;
}

const RANK: Record<ZoneSeverity, number> = { alta: 0, media: 1, baja: 2 };

/** Agrupa zonas que están a menos de `padMm` entre sí (unión de cajas). */
export function groupZones(zones: FresaZone[], padMm = 0.5): FresaGroup[] {
  const parent = zones.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      // Solo se agrupan zonas de la misma gravedad, para no esconder un rincón
      // chico adentro de un problema grave ni al revés.
      if (zones[i].severity !== zones[j].severity) continue;
      const a = zones[i].bounds;
      const b = zones[j].bounds;
      if (a.minX - padMm <= b.maxX && b.minX - padMm <= a.maxX && a.minY - padMm <= b.maxY && b.minY - padMm <= a.maxY) {
        parent[find(i)] = find(j);
      }
    }
  }
  const byRoot = new Map<number, FresaZone[]>();
  zones.forEach((z, i) => {
    const r = find(i);
    const list = byRoot.get(r) ?? [];
    list.push(z);
    byRoot.set(r, list);
  });
  const groups: FresaGroup[] = [];
  for (const list of byRoot.values()) {
    const severity = list.reduce<ZoneSeverity>((s, z) => (RANK[z.severity] < RANK[s] ? z.severity : s), 'baja');
    const b = {
      minX: Math.min(...list.map((z) => z.bounds.minX)),
      minY: Math.min(...list.map((z) => z.bounds.minY)),
      maxX: Math.max(...list.map((z) => z.bounds.maxX)),
      maxY: Math.max(...list.map((z) => z.bounds.maxY)),
    };
    groups.push({
      id: '',
      zoneIds: list.map((z) => z.id),
      severity,
      kinds: Array.from(new Set(list.map((z) => z.kind))),
      bounds: b,
      center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      reachDepthMm: Math.min(...list.map((z) => z.reachDepthMm)),
      gapWidthMm: Math.min(...list.map((z) => z.gapWidthMm)),
    });
  }
  groups.sort((a, z) =>
    a.severity !== z.severity
      ? RANK[a.severity] - RANK[z.severity]
      : Math.abs(a.center.y - z.center.y) > 1
        ? a.center.y - z.center.y
        : a.center.x - z.center.x,
  );
  groups.forEach((g, k) => (g.id = `g${k + 1}`));
  return groups;
}

function check(black: Paths64, profile: FresaProfile, options: FresaAnalysisOptions, t0: number): CheckOutput {
  const core = analyzeBlackRegion(black, profile, options, true);
  return { ...core, groups: groupZones(core.zones), durationMs: Math.round(performance.now() - t0) };
}

export function runCheck(
  shapes: PaintShape[],
  mmPerUnit: number,
  profile: FresaProfile = FRESA_FINA,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): CheckOutput {
  const t0 = performance.now();
  const black = buildBlackRegion(shapes, mmPerUnit);
  return check(black, profile, options, t0);
}

/** Solo rellenos oscuros: cada pieza negra sale de figuras propias que se pueden mover. */
export function isSimplePaint(shapes: PaintShape[]): boolean {
  return shapes.every((s) => (s.fill === 'dark' || s.fill === 'none') && s.stroke === 'none');
}

const isSeriousZone = (z: FresaZone) => z.severity !== 'baja' && z.kind !== 'angulo';

const overlapsMm = (a: FresaZone['bounds'], b: FresaZone['bounds'], pad: number) =>
  a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;

const scaleBoundsMm = (b: FresaZone['bounds'], f: number, tx = 0, ty = 0) => ({
  minX: b.minX * f + tx,
  minY: b.minY * f + ty,
  maxX: b.maxX * f + tx,
  maxY: b.maxY * f + ty,
});

/**
 * Corrige las zonas pedidas (ver `planFix`) sin cambiar la medida del sello.
 *
 * Abrir espacios (separar letras, espaciar renglones) puede hacer que el
 * diseño quede más ancho o más alto. En Aspire el gadget lo vuelve a escalar a
 * la medida de fabricación, y eso achica todo, huecos incluidos. Por eso:
 * 1. Se planifica la corrección.
 * 2. Si el diseño creció, se encaja de nuevo en la caja original (escala
 *    pareja, sin deformar) y se chequea así, como va a quedar fabricado.
 * 3. Si al encajarlo vuelve a haber problemas, se re-planifica sobre el diseño
 *    achicado en esa proporción (los espacios se abren lo que haga falta para
 *    que, después de encajar, sigan alcanzando). Hasta 4 vueltas; se queda con
 *    la mejor.
 * 4. Si igual quedan lugares, prueba cuánto habría que agrandar todo el sello
 *    (hasta `maxScaleUp`) para resolverlos: queda como sugerencia.
 */
export function runFix(
  shapes: PaintShape[],
  mmPerUnit: number,
  zoneIds: string[],
  profile: FresaProfile = FRESA_FINA,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
  maxScaleUp = 1,
): FixOutput {
  const t0 = performance.now();
  const original = buildBlackRegion(shapes, mmPerUnit);
  const B0 = bounds(original);
  const first = analyzeBlackRegion(original, profile, options);
  const wanted = new Set(zoneIds);
  const targets = first.zones.filter((z) => wanted.has(z.id));
  const allowMoves = isSimplePaint(shapes);
  const k = mmPerUnit * UM; // µm por unidad del SVG
  const c0 = B0 ? { x: (B0.minX + B0.maxX) / 2, y: (B0.minY + B0.maxY) / 2 } : { x: 0, y: 0 };

  type Attempt = {
    s: number;
    plan: ReturnType<typeof planFix>;
    g: number;
    real: Paths64;
    after: CheckOutput;
    serious: number;
    cN: { x: number; y: number };
  };
  let best: Attempt | null = null;
  let s = 1;
  for (let iter = 0; iter < 4 && B0; iter++) {
    const blackS = s === 1 ? original : buildBlackRegion(shapes, mmPerUnit * s);
    // Las zonas pedidas, ubicadas en este espacio (escalado desde el origen).
    const tb = targets.map((t) => scaleBoundsMm(t.bounds, s));
    const zonesS =
      s === 1
        ? targets
        : analyzeBlackRegion(blackS, profile, options).zones.filter(
            (z) => isSeriousZone(z) && tb.some((b) => overlapsMm(z.bounds, b, 0.3)),
          );
    const plan = planFix(blackS, zonesS, profile, options, { allowMoves });
    const Bn = bounds(plan.black) ?? B0;
    // Caja en unidades del SVG: original vs. corregida.
    const w0 = (B0.maxX - B0.minX) / k;
    const h0 = (B0.maxY - B0.minY) / k;
    const wn = (Bn.maxX - Bn.minX) / (k * s);
    const hn = (Bn.maxY - Bn.minY) / (k * s);
    const g = Math.min(1, w0 / wn, h0 / hn);
    const cN = { x: (Bn.minX + Bn.maxX) / 2, y: (Bn.minY + Bn.maxY) / 2 }; // µm del plan
    // Resultado real: plan · (g/s), con el centro llevado al del original.
    const f = g / s;
    const real = affine(plan.black, f, c0.x - cN.x * f, c0.y - cN.y * f);
    const after = check(real, profile, options, t0);
    const serious = after.zones.filter(isSeriousZone).length;
    const attempt: Attempt = { s, plan, g, real, after, serious, cN };
    if (!best || serious < best.serious || (serious === best.serious && g > best.g)) best = attempt;
    if (serious === 0 || g >= 0.999) break;
    const next = s * g * 0.998;
    if (next < 0.85 || Math.abs(next - s) < 0.002) break;
    s = next;
  }

  // Nunca empeorar: si el resultado completo tiene más lugares con problema que
  // el original (cada paso se valida en una ventana; el conjunto puede
  // sumar alguno en otro lado), no se toca el diseño.
  const firstSerious = first.zones.filter(isSeriousZone).length;
  if (best && best.serious > firstSerious) best = null;

  if (!best || !B0) {
    const after = check(original, profile, options, t0);
    return {
      moves: [],
      removed: [],
      newBlack: original,
      removedAreaMm2: 0,
      operations: [],
      fixedZoneIds: [],
      skippedZoneIds: targets.map((t) => t.id),
      planScale: 1,
      fit: { scale: 1, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      scaleUp: null,
      after,
    };
  }

  const { plan, g, real, after, cN } = best;
  const sBest = best.s;
  const f = g / sBest;
  const tx = (c0.x - cN.x * f) / UM;
  const ty = (c0.y - cN.y * f) / UM;

  // Una zona pedida quedó resuelta si ya no hay un problema donde estaba
  // (llevada al resultado final: escala del plan, corrimiento de la pieza que
  // la bordeaba y encaje).
  const remaining = after.zones.filter(isSeriousZone);
  const shiftNear = (b: FresaZone['bounds']) => {
    const m = plan.moves.find((mv) => {
      const mb = bounds(mv.region);
      return mb && b.minX * UM <= mb.maxX && mb.minX <= b.maxX * UM && b.minY * UM <= mb.maxY && mb.minY <= b.maxY * UM;
    });
    return m ? { dx: m.dx / UM, dy: m.dy / UM } : { dx: 0, dy: 0 };
  };
  const fixedZoneIds: string[] = [];
  const skippedZoneIds: string[] = [];
  for (const t of targets) {
    const inPlan = scaleBoundsMm(t.bounds, sBest);
    const sh = shiftNear(inPlan);
    const moved = scaleBoundsMm(inPlan, 1, sh.dx, sh.dy);
    const tb = scaleBoundsMm(moved, f, tx, ty);
    const still = remaining.some((z) => overlapsMm(z.bounds, tb, 0.05));
    (still ? skippedZoneIds : fixedZoneIds).push(t.id);
  }

  // Último recurso: agrandar un poco todo el sello (desde el centro).
  let scaleUp: FixOutput['scaleUp'] = null;
  if (remaining.length && maxScaleUp > 1.005) {
    for (let u = 1.01; u <= maxScaleUp + 1e-9; u = Math.round((u + 0.01) * 100) / 100) {
      const bigger = affine(real, u, c0.x * (1 - u), c0.y * (1 - u));
      const left = analyzeBlackRegion(bigger, profile, options).zones.filter(isSeriousZone).length;
      if (left === 0) {
        scaleUp = { factor: u, resolves: remaining.length };
        break;
      }
    }
  }

  return {
    moves: plan.moves,
    removed: plan.removed,
    newBlack: plan.black,
    removedAreaMm2: plan.removedAreaMm2 * f * f,
    operations: plan.operations,
    fixedZoneIds,
    skippedZoneIds,
    planScale: sBest,
    fit: {
      scale: g,
      from: { x: cN.x / (k * sBest), y: cN.y / (k * sBest) },
      to: { x: c0.x / k, y: c0.y / k },
    },
    scaleUp,
    after,
  };
}
