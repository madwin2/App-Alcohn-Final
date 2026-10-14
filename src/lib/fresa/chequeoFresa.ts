/**
 * API del chequeo de fresa para la interfaz.
 *
 *   const report = await chequearSvg(svgText, { mode: 'pedido', requestedWidthMm, requestedHeightMm });
 *   const fixed  = await corregirSvg(svgText, report, zoneIds);
 *
 * - Lee el SVG en el hilo principal (DOMParser) y manda la geometría al Web
 *   Worker; si no hay Worker (tests, navegadores raros) corre acá mismo.
 * - Resuelve la escala igual que el resto del sistema: lo que importa es la
 *   medida a la que se va a fabricar, porque eso define el ancho real de cada
 *   hueco.
 * - Cachea por contenido + medida + versión del algoritmo.
 */
import { resolveFabricationSize } from '@/lib/programas/fabricationSize';
import { containSize } from '@/lib/vectorizacion/svgSize';
import {
  DEFAULT_ANALYSIS_OPTIONS,
  FRESA_ANALYSIS_VERSION,
  FRESA_FINA,
  type FresaAnalysisOptions,
  type FresaProfile,
} from './config';
import type { PaintShape } from './analyze';
import { runCheck, runFix, type CheckOutput, type FixOutput } from './engine';
import { buildCorrectedSvg } from './exportSvg';
import { parseSvgShapes, type ParsedSvg } from './svgShapes';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/** A qué medida se analiza el diseño. */
export type FresaTarget =
  /** Sello con medida de fabricación ya guardada (lado largo, mm). */
  | { mode: 'fabricacion'; longSideMm: number }
  /** Vector nuevo para un sello: se emula lo que hará "Confirmar" (medida pedida → fabricación). */
  | { mode: 'pedido'; requestedWidthMm: number; requestedHeightMm: number }
  /** Escala fija (mm por unidad del SVG); se usa para re-chequear una corrección. */
  | { mode: 'escala'; mmPerUnit: number }
  /** Sin sello: la medida que declara el propio SVG (width/height en mm). */
  | { mode: 'declarado' };

export type FresaSizeSource = 'fabricacion' | 'pedida' | 'sugerida' | 'escala' | 'declarada';

export interface FresaReport {
  key: string;
  status: 'ok' | 'revisar' | 'error';
  error?: string;
  check: CheckOutput | null;
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
}

export interface FresaFixResult {
  svg: string;
  removedAreaMm2: number;
  fixedZoneIds: string[];
  /** Zonas que no se corrigieron porque hacerlo rompía el diseño: editar a mano. */
  skippedZoneIds: string[];
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

async function inWorker(req: CheckReq): Promise<CheckOutput>;
async function inWorker(req: FixReq): Promise<FixOutput>;
async function inWorker(req: CheckReq | FixReq): Promise<CheckOutput | FixOutput> {
  const local = () =>
    req.type === 'check'
      ? runCheck(req.shapes, req.mmPerUnit, req.profile, req.options)
      : runFix(req.shapes, req.mmPerUnit, req.zoneIds, req.profile, req.options);
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

function errorReport(key: string, message: string, profile: FresaProfile): FresaReport {
  return {
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
    return errorReport(key, e instanceof Error ? e.message : 'No se pudo leer el SVG.', profile);
  }
  const box = geometryBox(parsed);
  if (!box) return errorReport(key, 'El SVG no tiene figuras para analizar.', profile);
  const { mmPerUnit, source } = resolveScale(parsed, box, target);
  if (!(mmPerUnit > 0) || !Number.isFinite(mmPerUnit)) {
    return errorReport(key, 'No se pudo determinar la medida del diseño.', profile);
  }
  let check: CheckOutput;
  try {
    check = await inWorker({ type: 'check', shapes: plainShapes(parsed), mmPerUnit, profile, options });
  } catch (e) {
    return errorReport(key, e instanceof Error ? e.message : 'Falló el análisis.', profile);
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
  };
}

/** Analiza un SVG. Cacheado: llamar varias veces con lo mismo no recalcula. */
export function chequearSvg(
  svgText: string,
  target: FresaTarget,
  profile: FresaProfile = FRESA_FINA,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): Promise<FresaReport> {
  const key = fresaCacheKey(svgText, target);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = computeReport(svgText, target, key, profile, options);
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
  const fix = await inWorker({
    type: 'fix',
    shapes: plainShapes(parsed),
    mmPerUnit: before.mmPerUnit,
    zoneIds,
    profile: before.profile,
    options,
  });
  const svg = buildCorrectedSvg(parsed, before.mmPerUnit, fix.removed, fix.newBlack);
  // Se re-chequea el archivo final (no el resultado intermedio), a la misma
  // escala: lo que se guarda es exactamente lo que se analizó.
  const after = await chequearSvg(svg, { mode: 'escala', mmPerUnit: before.mmPerUnit }, before.profile, options);
  return {
    svg,
    removedAreaMm2: fix.removedAreaMm2,
    fixedZoneIds: fix.fixedZoneIds,
    skippedZoneIds: fix.skippedZoneIds,
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
  return `${n} lugar${n === 1 ? '' : 'es'} donde no llega la fresa`;
}
