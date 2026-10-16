/**
 * API del chequeo de fresa para la interfaz.
 *
 *   const report = await chequearSvg(svgText, { mode: 'pedido', requestedWidthMm, requestedHeightMm, alimento });
 *   const fixed  = await corregirSvg(svgText, report, zoneIds);
 *
 * - Lee el SVG en el hilo principal (DOMParser) y manda la geometría al Web
 *   Worker; si no hay Worker (tests, navegadores raros) corre acá mismo.
 * - Resuelve la escala igual que el resto del sistema: lo que importa es la
 *   medida a la que se va a fabricar, porque eso define el ancho real de cada
 *   hueco.
 * - Cachea por contenido + medida + versión del algoritmo.
 */
import { KNOWN_MAX_FABRICATION_MM, resolveFabricationSize } from '@/lib/programas/fabricationSize';
import { resolvePlanchuelaRef } from '@/lib/programas/material';
import { containSize } from '@/lib/vectorizacion/svgSize';
import {
  DEFAULT_ANALYSIS_OPTIONS,
  FRESA_ANALYSIS_VERSION,
  MAX_SCALE_UP,
  fresaProfile,
  machiningRecipe,
  type FresaAnalysisOptions,
  type FresaProfile,
} from './config';
import type { PaintShape } from './analyze';
import { runCheck, runFix, type CheckOutput, type FixOutput } from './engine';
import { runPasses, type PassesOutput } from './passes';
import { buildCorrectedSvg, wrapFit } from './exportSvg';
import type { FixOperation } from './fix';
import { applyPieceMoves } from './moveSvg';
import { buildEditDoc, countNodes, removeRedundant, serializeEditDoc, simplifyDoc } from './editDoc';
import { parseSvgShapes, type ParsedSvg } from './svgShapes';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/**
 * A qué medida se analiza el diseño. `alimento`: sello de alimento, que pide
 * más profundidad mínima (ver `FRESA_ALIMENTO`).
 */
export type FresaTarget = (
  /**
   * Sello con medida de fabricación ya guardada (lado largo, mm). La medida
   * pedida, si se conoce, dice la planchuela (tope para agrandar).
   */
  | { mode: 'fabricacion'; longSideMm: number; requestedWidthMm?: number; requestedHeightMm?: number }
  /** Vector nuevo para un sello: se emula lo que hará "Confirmar" (medida pedida → fabricación). */
  | { mode: 'pedido'; requestedWidthMm: number; requestedHeightMm: number }
  /** Escala fija (mm por unidad del SVG); se usa para re-chequear una corrección. */
  | { mode: 'escala'; mmPerUnit: number }
  /** Sin sello: la medida que declara el propio SVG (width/height en mm). */
  | { mode: 'declarado' }
) & { alimento?: boolean; stampType?: string | null };

/** ¿El tipo de sello (StampType o `sellos.tipo`) es de alimento? */
export function esTipoAlimento(tipo: string | null | undefined): boolean {
  return (tipo ?? '').toUpperCase() === 'ALIMENTO';
}

export type FresaSizeSource = 'fabricacion' | 'pedida' | 'sugerida' | 'escala' | 'declarada';

export interface FresaReport {
  key: string;
  status: 'ok' | 'revisar' | 'error';
  error?: string;
  check: CheckOutput | null;
  passes?: PassesOutput;
  /** mm por unidad del viewBox usados en el análisis. */
  mmPerUnit: number;
  /** Medida del dibujo analizado (mm). */
  widthMm: number;
  heightMm: number;
  sizeSource: FresaSizeSource;
  /** Caja para dibujar el SVG y las zonas encima (unidades del viewBox). */
  viewBox: { x: number; y: number; w: number; h: number };
  /**
   * Dónde cae el SVG original completo (su viewport) en esas mismas unidades:
   * para dibujarlo como <image> exactamente debajo de las zonas.
   */
  imageBox: { x: number; y: number; w: number; h: number };
  counts: { alta: number; media: number; baja: number };
  /** Lugares a revisar (grupos) por gravedad. */
  groupCounts: { alta: number; media: number; baja: number };
  warnings: string[];
  profile: FresaProfile;
  /** Medida con la que se analizó (para re-chequear la corrección igual). */
  target: FresaTarget;
}

export interface FresaFixResult {
  svg: string;
  removedAreaMm2: number;
  /** Qué se hizo (separar letras, agrandar ojos, ensanchar ranuras). */
  operations: FixOperation[];
  fixedZoneIds: string[];
  /** Zonas que no se corrigieron porque hacerlo rompía el diseño: editar a mano. */
  skippedZoneIds: string[];
  /**
   * Cuánto se achicó el dibujo para volver a la medida original después de
   * abrir espacios (1 = no hizo falta). Ej. 0,97 = todo quedó 3 % más chico
   * dentro de la misma medida.
   */
  fitScale: number;
  /**
   * Medida real del dibujo corregido (mm), a la escala del original. Nunca es
   * más grande que la original en ningún lado. Al guardar un vector de un sello
   * con medida de fabricación, se guarda esta (el gadget escala por el lado
   * largo y, si no coincide, lo vuelve a escalar).
   */
  fabricationMm: { widthMm: number; heightMm: number };
  /**
   * Último recurso: agrandar el sello (cambia la medida de fabricación)
   * resuelve lo que quedó. Lo tiene que confirmar quien revisa.
   */
  scaleUp: { factor: number; resolves: number; widthMm: number; heightMm: number } | null;
  before: FresaReport;
  after: FresaReport;
}

// ---------------------------------------------------------------- escala

interface GeometryBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Caja de toda la geometría (cualquier color), como la mide Aspire al importar. */
function geometryBox(parsed: ParsedSvg): GeometryBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of parsed.shapes) {
    if (s.fill === 'none' && s.stroke === 'none') continue;
    for (const r of s.rings)
      for (const p of r) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
  }
  return Number.isFinite(minX) && maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null;
}

function resolveScale(
  parsed: ParsedSvg,
  box: GeometryBox,
  target: FresaTarget,
): { mmPerUnit: number; source: FresaSizeSource } {
  const longUnits = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  switch (target.mode) {
    case 'escala':
      return { mmPerUnit: target.mmPerUnit, source: 'escala' };
    case 'fabricacion':
      return { mmPerUnit: target.longSideMm / longUnits, source: 'fabricacion' };
    case 'pedido': {
      // Igual que saveSelloVector: applyPhysicalSize encaja el viewBox en lo
      // pedido; después resolveFabricationSize decide la medida final.
      const vbW = parsed.viewBox?.w ?? box.maxX - box.minX;
      const vbH = parsed.viewBox?.h ?? box.maxY - box.minY;
      const size = containSize(vbW, vbH, target.requestedWidthMm, target.requestedHeightMm);
      const k0 = size.widthMm / vbW;
      const measured = { widthMm: (box.maxX - box.minX) * k0, heightMm: (box.maxY - box.minY) * k0 };
      const res = resolveFabricationSize(target.requestedWidthMm, target.requestedHeightMm, measured);
      const targetLong = Math.max(res.widthMm, res.heightMm);
      return { mmPerUnit: targetLong / longUnits, source: res.needsReview ? 'sugerida' : 'pedida' };
    }
    case 'declarado':
    default:
      return { mmPerUnit: parsed.declaredMmPerUnit ?? 25.4 / 96, source: 'declarada' };
  }
}

// ---------------------------------------------------------------- worker

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, { resolve: (r: WorkerResponse) => void }>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./fresa.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = pending.get(ev.data.id);
      if (p) {
        pending.delete(ev.data.id);
        p.resolve(ev.data);
      }
    };
    worker.onerror = () => {
      // Si el worker no levanta, seguimos en el hilo principal.
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) p.resolve({ id, ok: false, error: '__worker_failed__' });
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

type CheckReq = Omit<Extract<WorkerRequest, { type: 'check' }>, 'id'>;
type FixReq = Omit<Extract<WorkerRequest, { type: 'fix' }>, 'id'>;
type PassesReq = Omit<Extract<WorkerRequest, { type: 'passes' }>, 'id'>;

async function inWorker(req: CheckReq): Promise<CheckOutput>;
async function inWorker(req: FixReq): Promise<FixOutput>;
async function inWorker(req: PassesReq): Promise<PassesOutput>;
async function inWorker(req: CheckReq | FixReq | PassesReq): Promise<CheckOutput | FixOutput | PassesOutput> {
  const local = () =>
    req.type === 'passes' ? runPasses(req.shapes, req.mmPerUnit, req.profile, req.recipe, req.options) : req.type === 'check'
      ? runCheck(req.shapes, req.mmPerUnit, req.profile, req.options)
      : runFix(req.shapes, req.mmPerUnit, req.zoneIds, req.profile, req.options, req.maxScaleUp);
  const w = getWorker();
  if (!w) return local();
  const id = ++seq;
  const res = await new Promise<WorkerResponse>((resolve) => {
    pending.set(id, { resolve });
    w.postMessage({ ...req, id } as WorkerRequest);
  });
  if (!res.ok) {
    if (res.error === '__worker_failed__') return local();
    throw new Error(res.error);
  }
  return res.result;
}

// ---------------------------------------------------------------- caché

const CACHE_MAX = 150;
const cache = new Map<string, Promise<FresaReport>>();

function hashText(s: string): string {
  // FNV-1a 32 bits, dos pasadas con semillas distintas: suficiente para cachear.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`;
}

function targetKey(t: FresaTarget): string {
  return `${machiningRecipe(t.stampType, t.alimento) ?? 'SIN_RECETA'}:${sizeKey(t)}`;
}

function sizeKey(t: FresaTarget): string {
  switch (t.mode) {
    case 'fabricacion':
      return `f${t.longSideMm.toFixed(2)}`;
    case 'pedido':
      return `p${t.requestedWidthMm.toFixed(2)}x${t.requestedHeightMm.toFixed(2)}`;
    case 'escala':
      return `e${t.mmPerUnit.toPrecision(8)}`;
    default:
      return 'd';
  }
}

export function fresaCacheKey(svgText: string, target: FresaTarget): string {
  return `v${FRESA_ANALYSIS_VERSION}:${hashText(svgText)}:${targetKey(target)}`;
}

// ---------------------------------------------------------------- API

const plainShapes = (parsed: ParsedSvg): PaintShape[] =>
  parsed.shapes.map((s) => ({
    rings: s.rings,
    openFlags: s.openFlags,
    fill: s.fill,
    fillRule: s.fillRule,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
  }));

function emptyCounts() {
  return { alta: 0, media: 0, baja: 0 };
}

function errorReport(key: string, message: string, profile: FresaProfile, target: FresaTarget): FresaReport {
  return {
    target,
    key,
    status: 'error',
    error: message,
    check: null,
    mmPerUnit: 1,
    widthMm: 0,
    heightMm: 0,
    sizeSource: 'declarada',
    viewBox: { x: 0, y: 0, w: 1, h: 1 },
    imageBox: { x: 0, y: 0, w: 1, h: 1 },
    counts: emptyCounts(),
    groupCounts: emptyCounts(),
    warnings: [],
    profile,
  };
}

async function computeReport(
  svgText: string,
  target: FresaTarget,
  key: string,
  profile: FresaProfile,
  options: FresaAnalysisOptions,
): Promise<FresaReport> {
  let parsed: ParsedSvg;
  try {
    parsed = parseSvgShapes(svgText, options.flattenTolMm);
  } catch (e) {
    return errorReport(key, e instanceof Error ? e.message : 'No se pudo leer el SVG.', profile, target);
  }
  const box = geometryBox(parsed);
  if (!box) return errorReport(key, 'El SVG no tiene figuras para analizar.', profile, target);
  const { mmPerUnit, source } = resolveScale(parsed, box, target);
  if (!(mmPerUnit > 0) || !Number.isFinite(mmPerUnit)) {
    return errorReport(key, 'No se pudo determinar la medida del diseño.', profile, target);
  }
  let check: CheckOutput;
  let passes: PassesOutput;
  try {
    passes = await inWorker({ type: 'passes', shapes: plainShapes(parsed), mmPerUnit, profile, recipe: machiningRecipe(target.stampType, target.alimento), options });
    check = passes.fine;
  } catch (e) {
    return errorReport(key, e instanceof Error ? e.message : 'Falló el análisis.', profile, target);
  }
  const counts = emptyCounts();
  for (const z of check.zones) counts[z.severity]++;
  const groupCounts = emptyCounts();
  for (const g of check.groups) groupCounts[g.severity]++;
  const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.04;
  const pxMm = 25.4 / 96;
  const imageBox = parsed.viewBox ?? {
    x: 0,
    y: 0,
    w: parsed.declaredWidthMm != null ? parsed.declaredWidthMm / pxMm : box.maxX,
    h: parsed.declaredHeightMm != null ? parsed.declaredHeightMm / pxMm : box.maxY,
  };
  return {
    key,
    status: counts.alta + counts.media > 0 ? 'revisar' : 'ok',
    check,
    passes,
    mmPerUnit,
    widthMm: (box.maxX - box.minX) * mmPerUnit,
    heightMm: (box.maxY - box.minY) * mmPerUnit,
    sizeSource: source,
    viewBox: { x: box.minX - pad, y: box.minY - pad, w: box.maxX - box.minX + 2 * pad, h: box.maxY - box.minY + 2 * pad },
    imageBox,
    counts,
    groupCounts,
    warnings: parsed.warnings,
    profile,
    target,
  };
}

/** Analiza un SVG. Cacheado: llamar varias veces con lo mismo no recalcula. */
export function chequearSvg(
  svgText: string,
  target: FresaTarget,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<FresaReport> {
  const key = `${fresaCacheKey(svgText, target)}:${JSON.stringify(options)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = computeReport(svgText, target, key, fresaProfile(machiningRecipe(target.stampType, target.alimento) === 'ALIMENTO'), options);
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  p.then((r) => {
    if (r.status === 'error') cache.delete(key);
  });
  return p;
}

/** Corrige las zonas elegidas y devuelve el SVG nuevo, ya re-chequeado. */
export async function corregirSvg(
  svgText: string,
  before: FresaReport,
  zoneIds: string[],
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<FresaFixResult> {
  if (before.status === 'error' || !before.check) throw new Error('No hay análisis para corregir.');
  const parsed = parseSvgShapes(svgText, options.flattenTolMm);
  const maxScaleUp = scaleUpLimit(before);
  const fix = await inWorker({
    type: 'fix',
    shapes: plainShapes(parsed),
    mmPerUnit: before.mmPerUnit,
    zoneIds,
    profile: before.profile,
    options,
    maxScaleUp,
  });
  // Las piezas y los cortes vienen en el espacio en que se planificó.
  const planMmPerUnit = before.mmPerUnit * fix.planScale;
  let base = parsed;
  if (fix.moves.length) {
    applyPieceMoves(parsed, planMmPerUnit, fix.moves);
    base = parseSvgShapes(new XMLSerializer().serializeToString(parsed.doc.documentElement), options.flattenTolMm);
  }
  const svg = wrapFit(buildCorrectedSvg(base, planMmPerUnit, fix.removed, fix.newBlack), fix.fit);
  // Se re-chequea el archivo final (no el resultado intermedio) con la misma
  // medida que el original: así se fabrica (el gadget escala a esa medida).
  const after = await chequearSvg(svg, sameScaleTarget(before), options);
  // Nunca empeorar lo que ve el usuario: si quedan más lugares que antes, no
  // se propone ningún cambio.
  const places = (r: FresaReport) => r.groupCounts.alta + r.groupCounts.media;
  if (after.status === 'error' || places(after) > places(before)) {
    return {
      svg: svgText,
      removedAreaMm2: 0,
      operations: [],
      fixedZoneIds: [],
      skippedZoneIds: zoneIds,
      fitScale: 1,
      fabricationMm: { widthMm: before.widthMm, heightMm: before.heightMm },
      scaleUp: null,
      before,
      after: before,
    };
  }
  return {
    svg,
    removedAreaMm2: fix.removedAreaMm2,
    operations: fix.operations,
    fixedZoneIds: fix.fixedZoneIds,
    skippedZoneIds: fix.skippedZoneIds,
    fitScale: fix.fit.scale,
    fabricationMm: { widthMm: after.widthMm, heightMm: after.heightMm },
    scaleUp: fix.scaleUp
      ? {
          factor: fix.scaleUp.factor,
          resolves: fix.scaleUp.resolves,
          widthMm: after.widthMm * fix.scaleUp.factor,
          heightMm: after.heightMm * fix.scaleUp.factor,
        }
      : null,
    before,
    after,
  };
}

/**
 * Para re-chequear una corrección: misma medida de fabricación que el original
 * (el dibujo corregido ya está encajado en la misma caja, así que la escala
 * coincide con la del original).
 */
/**
 * Errores máximos (mm) que se prueban al simplificar, del más al menos
 * simplificador. 0,02 mm está muy por debajo de lo que marca la fresa más
 * fina (punta de 0,1 mm) y de lo que se ve en un sello.
 */
export const SIMPLIFY_TOLS_MM = [0.02, 0.01] as const;

const places = (r: FresaReport) => r.groupCounts.alta + r.groupCounts.media;

/**
 * Saca todos los nodos que se puedan sin cambiar el diseño: prueba los errores
 * de `SIMPLIFY_TOLS_MM` y se queda con el primero que no cambia la medida ni
 * empeora el chequeo de fresa. `report`: chequeo de `svgText`. Devuelve null si
 * no se pudo leer el SVG para editar (blancos, trazos) o no ahorra nodos.
 */
export async function simplificarSinDeformar(
  svgText: string,
  report: FresaReport,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<{ svg: string; report: FresaReport; antes: number; despues: number; tolMm: number } | null> {
  if (report.status === 'error') return null;
  const built = buildEditDoc(svgText);
  if (!built.ok) return null;
  const antes = countNodes(built.doc);
  for (const tolMm of SIMPLIFY_TOLS_MM) {
    const tol = tolMm / report.mmPerUnit;
    const clean = removeRedundant(built.doc, 0.002 / report.mmPerUnit).doc;
    const { doc, after } = simplifyDoc(clean, tol);
    // Que valga la pena: al menos un 5 % menos de nodos.
    if (after > antes * 0.95) continue;
    const svg = serializeEditDoc(doc);
    const r = await chequearSvg(svg, sameScaleTarget(report), options);
    const sameSize = Math.abs(r.widthMm - report.widthMm) <= 0.05 && Math.abs(r.heightMm - report.heightMm) <= 0.05;
    if (r.status !== 'error' && sameSize && places(r) <= places(report)) {
      return { svg, report: r, antes, despues: after, tolMm };
    }
  }
  return null;
}

/**
 * Corrección automática completa: corrige donde no llega la fresa (si hace
 * falta) y después simplifica los nodos sin cambiar el diseño. Siempre
 * simplifica, aunque la fresa ya llegue bien. Devuelve null si no hay nada
 * para cambiar.
 */
export async function corregirYSimplificar(
  svgText: string,
  before: FresaReport,
  zoneIds: string[],
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<FresaFixResult | null> {
  if (before.status === 'error' || !before.check) return null;
  let fix: FresaFixResult | null = null;
  if (before.status === 'revisar' && zoneIds.length) {
    const f = await corregirSvg(svgText, before, zoneIds, options);
    if (f.operations.length) fix = f;
  }
  const base = fix ? fix.svg : svgText;
  const baseReport = fix ? fix.after : before;
  const simp = await simplificarSinDeformar(base, baseReport, options);
  if (!fix && !simp) return null;
  const operations = [...(fix?.operations ?? [])];
  if (simp) operations.push({ kind: 'simplificar', antes: simp.antes, despues: simp.despues, tolMm: simp.tolMm });
  const after = simp ? simp.report : baseReport;
  return {
    svg: simp ? simp.svg : base,
    removedAreaMm2: fix?.removedAreaMm2 ?? 0,
    operations,
    fixedZoneIds: fix?.fixedZoneIds ?? [],
    skippedZoneIds: fix?.skippedZoneIds ?? (before.status === 'revisar' ? zoneIds : []),
    fitScale: fix?.fitScale ?? 1,
    fabricationMm: fix?.fabricationMm ?? { widthMm: before.widthMm, heightMm: before.heightMm },
    scaleUp: fix?.scaleUp ?? null,
    before,
    after,
  };
}

/** Zonas que la corrección automática intenta resolver (no los ángulos). */
export function zonasCorregibles(report: FresaReport): string[] {
  return (report.check?.zones ?? []).filter((z) => z.severity !== 'baja').map((z) => z.id);
}

const autoCache = new Map<string, Promise<{ report: FresaReport; fix: FresaFixResult | null }>>();
let autoChain: Promise<unknown> = Promise.resolve();

/**
 * Chequeo + corrección automática de un vector recién hecho, en segundo plano.
 * Se hacen de a uno (es pesado) y se cachean por contenido + medida.
 */
export function autoCorregir(
  svgText: string,
  target: FresaTarget,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<{ report: FresaReport; fix: FresaFixResult | null }> {
  const key = `auto:${fresaCacheKey(svgText, target)}`;
  const hit = autoCache.get(key);
  if (hit) return hit;
  const run = autoChain.then(async () => {
    const report = await chequearSvg(svgText, target, options);
    if (report.status === 'error') return { report, fix: null };
    try {
      return { report, fix: await corregirYSimplificar(svgText, report, zonasCorregibles(report), options) };
    } catch {
      return { report, fix: null };
    }
  });
  autoChain = run.catch(() => undefined);
  autoCache.set(key, run);
  if (autoCache.size > 200) autoCache.delete(autoCache.keys().next().value as string);
  return run;
}

function sameScaleTarget(before: FresaReport): FresaTarget {
  return { mode: 'escala', mmPerUnit: before.mmPerUnit, alimento: before.target.alimento, stampType: before.target.stampType };
}

/**
 * Hasta cuánto se puede agrandar como último recurso: `MAX_SCALE_UP`, sin que
 * el lado menor pase el tope de la planchuela. Si no se sabe la planchuela de
 * un sello con medida de fabricación, no se ofrece.
 */
function scaleUpLimit(r: FresaReport): number {
  const t = r.target;
  let reqW: number | undefined;
  let reqH: number | undefined;
  if (t.mode === 'pedido') {
    reqW = t.requestedWidthMm;
    reqH = t.requestedHeightMm;
  } else if (t.mode === 'fabricacion') {
    reqW = t.requestedWidthMm;
    reqH = t.requestedHeightMm;
    if (!(reqW && reqH)) return 1;
  } else if (t.mode === 'escala') {
    return 1;
  }
  const minor = Math.min(r.widthMm, r.heightMm);
  if (!(minor > 0)) return 1;
  if (reqW && reqH) {
    const tipo = resolvePlanchuelaRef({ anchoRealCm: reqW / 10, largoRealCm: reqH / 10 });
    const tope = tipo != null ? KNOWN_MAX_FABRICATION_MM[tipo] ?? null : null;
    if (tope != null) return Math.max(1, Math.min(MAX_SCALE_UP, (tope + 0.05) / minor));
  }
  return MAX_SCALE_UP;
}

/**
 * Resultado de una edición manual (editor del chequeo): se re-chequea con la
 * misma escala que el original. La medida puede cambiar si se agrandó o movió
 * algo hacia afuera; se informa en `fabricationMm`.
 */
export async function resultadoManual(
  svg: string,
  before: FresaReport,
  cambios: number,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<FresaFixResult> {
  const after = await chequearSvg(svg, sameScaleTarget(before), options);
  return {
    svg,
    removedAreaMm2: 0,
    operations: [{ kind: 'manual', cambios }],
    fixedZoneIds: [],
    skippedZoneIds: [],
    fitScale: 1,
    fabricationMm: { widthMm: after.widthMm, heightMm: after.heightMm },
    scaleUp: null,
    before,
    after,
  };
}

/** Texto corto para chips y tooltips. */
export function resumenFresa(r: FresaReport | null | undefined): string {
  if (!r) return 'Analizando…';
  if (r.status === 'error') return 'No se pudo analizar';
  const g = r.groupCounts;
  if (g.alta + g.media === 0) return 'La fresa llega bien';
  const n = g.alta + g.media;
  return `${n} lugar${n === 1 ? '' : 'es'} donde se pierde el diseño`;
}
