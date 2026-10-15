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
import { UM, bounds, type Paths64 } from './geometry';

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
  /** Piezas movidas enteras (se reubican en el SVG sin perder curvas). */
  moves: PieceMove[];
  /** Lo que se sacó de negro, en la posición ya movida. */
  removed: Paths64;
  newBlack: Paths64;
  removedAreaMm2: number;
  operations: FixOperation[];
  /** Zonas pedidas que se corrigieron / que no se pudieron corregir sin romper el diseño. */
  fixedZoneIds: string[];
  skippedZoneIds: string[];
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

/** Corrige las zonas pedidas (ver `planFix`) y vuelve a chequear. */
export function runFix(
  shapes: PaintShape[],
  mmPerUnit: number,
  zoneIds: string[],
  profile: FresaProfile = FRESA_FINA,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): FixOutput {
  const t0 = performance.now();
  const original = buildBlackRegion(shapes, mmPerUnit);
  const first = analyzeBlackRegion(original, profile, options);
  const wanted = new Set(zoneIds);
  const targets = first.zones.filter((z) => wanted.has(z.id));
  const plan = planFix(original, targets, profile, options, { allowMoves: isSimplePaint(shapes) });
  const after = check(plan.black, profile, options, t0);

  // Una zona pedida quedó resuelta si ya no hay un problema donde estaba
  // (corrida lo que se movió la pieza que la bordeaba).
  const remaining = after.zones.filter((z) => z.severity !== 'baja');
  const shiftNear = (z: FresaZone) => {
    const m = plan.moves.find((mv) => {
      const b = bounds(mv.region);
      return b && z.bounds.minX * UM <= b.maxX && b.minX <= z.bounds.maxX * UM && z.bounds.minY * UM <= b.maxY && b.minY <= z.bounds.maxY * UM;
    });
    return m ? { dx: m.dx / UM, dy: m.dy / UM } : { dx: 0, dy: 0 };
  };
  const fixedZoneIds: string[] = [];
  const skippedZoneIds: string[] = [];
  for (const t of targets) {
    const s = shiftNear(t);
    const tb = { minX: t.bounds.minX + s.dx, maxX: t.bounds.maxX + s.dx, minY: t.bounds.minY + s.dy, maxY: t.bounds.maxY + s.dy };
    const still = remaining.some(
      (z) => z.bounds.minX <= tb.maxX + 0.05 && tb.minX <= z.bounds.maxX + 0.05 && z.bounds.minY <= tb.maxY + 0.05 && tb.minY <= z.bounds.maxY + 0.05,
    );
    (still ? skippedZoneIds : fixedZoneIds).push(t.id);
  }

  return {
    moves: plan.moves,
    removed: plan.removed,
    newBlack: plan.black,
    removedAreaMm2: plan.removedAreaMm2,
    operations: plan.operations,
    fixedZoneIds,
    skippedZoneIds,
    after,
  };
}
