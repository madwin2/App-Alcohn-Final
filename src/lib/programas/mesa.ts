/**
 * Mesa de armado: agregar, mover y llenar sellos sobre el soporte real de la
 * máquina. Funciones puras sobre el documento de preparación; las reglas de
 * validación son las mismas del servidor (validatePreparation).
 */
import type { MecanizadoPersonalizado } from '@/lib/pedidos/mecanizadoPersonalizado';
import {
  createPreparation, validatePreparation, PREPARATION_RULES,
  type PreparationDocument, type PreparationIssue, type PreparationMachine, type PreparationSource,
  type StampPlacement, type SupportColumn,
} from './preparation';

/** Un sello de la cola, con lo necesario para priorizarlo. */
export interface MesaSource extends PreparationSource {
  isPriority?: boolean;
  /** Vencimiento (ISO). */
  deadlineAt?: string;
  /** Fecha del pedido (YYYY-MM-DD). */
  orderDate?: string;
  notes?: string | null;
}

const active = (doc: PreparationDocument) => doc.stamps.filter((s) => !s.excluded);

/**
 * Misma holgura que el tope de fabricación (`fabricationSize` ±0,05 mm).
 * Sin esto, un sello a 36,55 en P38 (usable 36,5) “no entra” y además bloquea
 * soltar cualquier otro en esa planchuela.
 */
export const WIDTH_TOLERANCE_MM = 0.05;

/** Ancho del sello sobre la planchuela (lado corto). */
const shortSide = (s: PreparationSource | Pick<StampPlacement, 'widthMm' | 'heightMm'>) =>
  Math.min(s.widthMm, s.heightMm);

const fitsWidth = (widthMm: number, usableMm: number) => widthMm <= usableMm + WIDTH_TOLERANCE_MM;

export function columnsFor(doc: PreparationDocument, source: PreparationSource): SupportColumn[] {
  return doc.columns.filter((c) => fitsWidth(shortSide(source), c.usableMm));
}

/** ¿Este sello tiene alguna planchuela posible en la máquina? */
export function fitsMachine(doc: PreparationDocument, source: PreparationSource): boolean {
  return columnsFor(doc, source).length > 0;
}

/** Orden de la cola: prioritarios, después el que vence antes, después el más viejo. */
export function compareQueue(a: MesaSource, b: MesaSource): number {
  if (!!a.isPriority !== !!b.isPriority) return a.isPriority ? -1 : 1;
  const da = a.deadlineAt ?? '9999', db = b.deadlineAt ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (a.orderDate ?? '9999').localeCompare(b.orderDate ?? '9999');
}

/** Separación exacta del armado, confirmada para la mesa; no es un mínimo editable. */
export const MESA_GAP_MM = PREPARATION_RULES.minimumGapMm;

/** Orden físico, independiente del orden de alta y de las antiguas marcas de fijado. */
export function columnStamps(doc: PreparationDocument, columnId: string): StampPlacement[] {
  return active(doc).filter((s) => s.columnId === columnId).sort((a, b) => b.topY - a.topY);
}

/** Recalcula la fila completa sin redondear coordenadas: el origen tiene tres decimales. */
function packColumn(col: SupportColumn, stamps: StampPlacement[]): StampPlacement[] {
  let topY = col.topY;
  return stamps.map((s) => {
    const placed = { ...s, columnId: col.id, centerX: col.centerX, topY, pinned: false };
    // Siempre 8 mm (BR-PROG-019); normaliza gapMm viejos al rearmar.
    topY -= s.heightMm + MESA_GAP_MM;
    return placed;
  });
}

function replacePlacements(doc: PreparationDocument, placements: StampPlacement[]): PreparationDocument {
  const byId = new Map(placements.map((s) => [s.instanceId, s]));
  return { ...doc, gapMm: MESA_GAP_MM, stamps: doc.stamps.map((s) => byId.get(s.instanceId) ?? s) };
}

/** Conserva el orden y la planchuela elegidos; cierra huecos y centra cada sello. */
export function reflowMesa(doc: PreparationDocument): PreparationDocument {
  return replacePlacements(doc, doc.columns.flatMap((c) => packColumn(c, columnStamps(doc, c.id))));
}

/** La posición del puntero elige un lugar en la fila, nunca una coordenada libre. */
function insertionIndex(stamps: StampPlacement[], wantedTop: number): number {
  const index = stamps.findIndex((s) => wantedTop > s.topY - s.heightMm / 2);
  return index < 0 ? stamps.length : index;
}

function placementFor(doc: PreparationDocument, source: PreparationSource): StampPlacement {
  const [stamp] = createPreparation(doc.programId, doc.machine, [source]).stamps;
  return { ...stamp, excluded: false, exclusionReason: undefined };
}

export type AddResult = { doc: PreparationDocument; added: true; instanceId: string } | { doc: PreparationDocument; added: false; reason: string };

/** Libre de diseño en una fila (sin contar `stamp`), misma cuenta que el resumen. */
function freeForRow(col: SupportColumn, row: StampPlacement[]): number {
  const totalMm = col.topY - col.bottomY;
  const usedMm = row.reduce(
    (sum, s, i) => sum + s.heightMm + (i < row.length - 1 ? MESA_GAP_MM : 0),
    0,
  );
  const gapBeforeNext = row.length ? MESA_GAP_MM : 0;
  return Math.max(0, Math.floor((totalMm - usedMm - gapBeforeNext) * 10) / 10);
}

/** Inserción atómica: valida toda la fila destino antes de cerrar la fila de origen. */
function insertStamp(doc: PreparationDocument, stamp: StampPlacement, col: SupportColumn, index: number): AddResult {
  if (!col.available) return { doc, added: false, reason: `No hay material en la planchuela de ${col.nominalMm}.` };
  const row = columnStamps(doc, col.id).filter((s) => s.instanceId !== stamp.instanceId);
  // Misma cuenta que “mm libres”: si el diseño entra, se suelta (POL-097; sin cola de corte).
  const free = freeForRow(col, row);
  if (stamp.heightMm > free + PREPARATION_RULES.coordinateToleranceMm) {
    return {
      doc,
      added: false,
      reason: `No queda largo suficiente en la planchuela de ${col.nominalMm} (quedan ${free} mm libres, este sello pide ${Number(stamp.heightMm.toFixed(2))} mm).`,
    };
  }
  row.splice(index, 0, stamp);
  const packed = packColumn(col, row);
  const wide = packed.find((s) => !fitsWidth(s.widthMm, col.usableMm));
  if (wide) {
    return {
      doc,
      added: false,
      reason: `${wide.name} no entra en la planchuela de ${col.nominalMm}: mide ${Number(wide.widthMm.toFixed(2))} mm de ancho (entra hasta ${col.usableMm} mm).`,
    };
  }
  const existing = doc.stamps.some((s) => s.instanceId === stamp.instanceId);
  const origin = existing && doc.columns.find((c) => c.id === stamp.columnId && c.id !== col.id);
  if (origin) {
    packed.push(...packColumn(origin, columnStamps(doc, origin.id).filter((s) => s.instanceId !== stamp.instanceId)));
  }
  const next = replacePlacements(existing ? doc : { ...doc, stamps: [...doc.stamps, stamp] }, packed);
  return { doc: next, added: true, instanceId: stamp.instanceId };
}

/** Suma al final de una fila o inserta donde se soltó, desplazando los siguientes. */
export function addStamp(doc: PreparationDocument, source: MesaSource, at?: { columnId: string; topY: number }): AddResult {
  if (doc.stamps.some((s) => s.selloId === source.id)) return { doc, added: false, reason: `${source.designName} ya está en el programa.` };
  const placement = placementFor(doc, source);
  if (at) {
    const col = doc.columns.find((c) => c.id === at.columnId);
    if (!col) return { doc, added: false, reason: 'Esa planchuela no existe.' };
    return insertStamp(doc, placement, col, insertionIndex(columnStamps(doc, col.id), at.topY));
  }
  const cols = columnsFor(doc, source).filter((c) => c.available)
    .sort((a, b) => Number(b.nominalMm === source.tipoPlanchuela) - Number(a.nominalMm === source.tipoPlanchuela) || a.nominalMm - b.nominalMm);
  if (!cols.length) {
    const widest = Math.max(0, ...doc.columns.map((c) => c.usableMm));
    return {
      doc,
      added: false,
      reason: `${source.designName} mide ${Number(shortSide(source).toFixed(2))} mm de ancho; en esta máquina entra hasta ${widest} mm.`,
    };
  }
  let lastReason = `No queda lugar para ${source.designName} en esta máquina.`;
  for (const col of cols) {
    const result = insertStamp(doc, placement, col, columnStamps(doc, col.id).length);
    if (result.added) return result;
    lastReason = result.reason;
  }
  return { doc, added: false, reason: lastReason };
}

/** Cambia el orden y/o la planchuela conservando centrado y separación exacta. */
export function moveStamp(doc: PreparationDocument, instanceId: string, columnId: string, topY: number): AddResult {
  const stamp = active(doc).find((s) => s.instanceId === instanceId);
  const col = doc.columns.find((c) => c.id === columnId);
  if (!stamp || !col) return { doc, added: false, reason: 'No se encontró el sello o la planchuela.' };
  const row = columnStamps(doc, col.id).filter((s) => s.instanceId !== instanceId);
  return insertStamp(doc, stamp, col, insertionIndex(row, topY));
}

/** Lleva el sello inmediatamente debajo del último, no al extremo del material. */
export function sendToEnd(doc: PreparationDocument, instanceId: string, columnId?: string): AddResult {
  const stamp = active(doc).find((s) => s.instanceId === instanceId);
  const col = doc.columns.find((c) => c.id === (columnId ?? stamp?.columnId));
  if (!stamp || !col) return { doc, added: false, reason: 'No se encontró el sello.' };
  return insertStamp(doc, stamp, col, columnStamps(doc, col.id).length);
}

/** Alternativa al arrastre: intercambiar con el vecino de arriba o abajo. */
export function shiftStamp(doc: PreparationDocument, instanceId: string, direction: -1 | 1): AddResult {
  const stamp = active(doc).find((s) => s.instanceId === instanceId);
  const col = doc.columns.find((c) => c.id === stamp?.columnId);
  if (!stamp || !col) return { doc, added: false, reason: 'No se encontró el sello.' };
  const row = columnStamps(doc, col.id);
  const index = row.findIndex((s) => s.instanceId === instanceId);
  return insertStamp(doc, stamp, col, Math.max(0, Math.min(row.length - 1, index + direction)));
}

export function removeStamp(doc: PreparationDocument, instanceId: string): PreparationDocument {
  const stamp = doc.stamps.find((s) => s.instanceId === instanceId);
  const col = doc.columns.find((c) => c.id === stamp?.columnId);
  const next = { ...doc, stamps: doc.stamps.filter((s) => s.instanceId !== instanceId) };
  return col ? replacePlacements(next, packColumn(col, columnStamps(next, col.id))) : next;
}

/** Aplica dimensiones/vector y reacomoda la fila; nunca deja un cambio a medias. */
export function updateStampGeometry(doc: PreparationDocument, instanceId: string, change: Partial<Pick<StampPlacement,
  'widthMm' | 'heightMm' | 'vectorSvg' | 'vectorAlreadyMachined' | 'sourceWidthMm' | 'sourceHeightMm'>>): AddResult {
  const stamp = active(doc).find((s) => s.instanceId === instanceId);
  const col = doc.columns.find((c) => c.id === stamp?.columnId);
  if (!stamp || !col) return { doc, added: false, reason: 'No se encontró el sello.' };
  const next = { ...stamp, ...change };
  if (![next.widthMm, next.heightMm].every((n) => Number.isFinite(n) && n > 0)) {
    return { doc, added: false, reason: 'La medida de fabricación debe ser mayor que cero.' };
  }
  if (next.fine) next.fine = { ...next.fine, analysisVersion: undefined, inputHash: '', outcome: 'sin_analisis' };
  return insertStamp(doc, next, col, columnStamps(doc, col.id).findIndex((s) => s.instanceId === instanceId));
}

/** Cambia la medida proporcional y desplaza todo lo que viene debajo, en ambos sentidos. */
export function resizeStamp(doc: PreparationDocument, instanceId: string, heightMm: number): AddResult {
  const stamp = active(doc).find((s) => s.instanceId === instanceId);
  if (!stamp) return { doc, added: false, reason: 'No se encontró el sello.' };
  const height = Math.round(heightMm * 10) / 10;
  return updateStampGeometry(doc, instanceId, { heightMm: height, widthMm: Math.round(height * stamp.widthMm / stamp.heightMm * 10) / 10 });
}

/** Resultado de intentar sumar un sello al final de cada planchuela (para resaltarlas al arrastrar). */
export interface ColumnOption { columnId: string; nominalMm: number; ok: boolean; reason?: string }

export function placementOptions(doc: PreparationDocument, source: MesaSource): ColumnOption[] {
  return doc.columns.map((c) => {
    const r = addStamp(doc, source, { columnId: c.id, topY: -Infinity });
    return r.added ? { columnId: c.id, nominalMm: c.nominalMm, ok: true } : { columnId: c.id, nominalMm: c.nominalMm, ok: false, reason: r.reason };
  });
}

/** Planchuela vecina (por posición en la máquina) hacia la izquierda (-1) o la derecha (1). */
export function neighborColumn(doc: PreparationDocument, columnId: string, direction: -1 | 1): SupportColumn | null {
  const cols = [...doc.columns].sort((a, b) => a.centerX - b.centerX);
  const i = cols.findIndex((c) => c.id === columnId);
  return i < 0 ? null : cols[i + direction] ?? null;
}

/**
 * Pasa el sello a la planchuela vecina más cercana donde entre, a la misma
 * altura aproximada (conserva el orden relativo). Salta las que no entran.
 */
export function moveToNeighbor(doc: PreparationDocument, instanceId: string, direction: -1 | 1): AddResult {
  const stamp = active(doc).find((s) => s.instanceId === instanceId);
  if (!stamp) return { doc, added: false, reason: 'No se encontró el sello.' };
  let col = neighborColumn(doc, stamp.columnId, direction);
  let firstReason: string | null = null;
  while (col) {
    const r = moveStamp(doc, instanceId, col.id, stamp.topY - stamp.heightMm / 2);
    if (r.added) return r;
    firstReason ??= r.reason;
    col = neighborColumn(doc, col.id, direction);
  }
  return { doc, added: false, reason: firstReason ?? `No hay otra planchuela hacia la ${direction < 0 ? 'izquierda' : 'derecha'}.` };
}

/** Lo del pedido que importa al armar: nota del cliente, prioridad y vencimiento. */
export interface StampInfo {
  notes?: string | null; isPriority?: boolean; deadlineAt?: string;
  /** Sello Personalizado: rosca, profundidades y perfilado pedidos (Pedidos). */
  mecanizado?: MecanizadoPersonalizado;
}

/** Texto corto del vencimiento («vence hoy», «venció ayer»…), o null si no tiene. */
export function dueText(info: StampInfo, today: Date): { text: string; urgent: boolean } | null {
  const days = daysToDeadline({ deadlineAt: info.deadlineAt } as MesaSource, today);
  const urgent = !!info.isPriority || (days !== null && days <= 3);
  if (days === null) return info.isPriority ? { text: 'prioritario', urgent } : null;
  const t = days < 0 ? (days === -1 ? 'venció ayer' : `venció hace ${-days} días`) : days === 0 ? 'vence hoy' : days === 1 ? 'vence mañana' : `vence en ${days} días`;
  return { text: info.isPriority ? `prioritario · ${t}` : t, urgent };
}

export type QueueSection = 'urgentes' | 'semana' | 'despues';
export const QUEUE_SECTION_LABEL: Record<QueueSection, string> = { urgentes: 'Urgentes', semana: 'Esta semana', despues: 'Más adelante' };

/** Días hasta el vencimiento (negativo = vencido), o null sin fecha. */
export function daysToDeadline(source: MesaSource, today: Date): number | null {
  if (!source.deadlineAt) return null;
  const d = new Date(source.deadlineAt.length <= 10 ? `${source.deadlineAt}T00:00:00` : source.deadlineAt);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** Urgentes: prioritario o vence en 3 días o menos. Esta semana: vence en 7 días o menos. */
export function queueSection(source: MesaSource, today: Date): QueueSection {
  const days = daysToDeadline(source, today);
  if (source.isPriority || (days !== null && days <= 3)) return 'urgentes';
  if (days !== null && days <= 7) return 'semana';
  return 'despues';
}

/** Suma de la cola, en orden, todo lo que entre. Devuelve los ids agregados. */
export function fillFromQueue(doc: PreparationDocument, queue: MesaSource[]): { doc: PreparationDocument; added: string[] } {
  let next = doc;
  const added: string[] = [];
  for (const source of [...queue].sort(compareQueue)) {
    if (!fitsMachine(next, source)) continue;
    const r = addStamp(next, source);
    if (r.added) { next = r.doc; added.push(source.id); }
  }
  return { doc: next, added };
}

/** Ordena y ubica los sellos del programa sobre el soporte, en el orden en que llegaron. */
export function placeSources(base: PreparationDocument, stamps: MesaSource[]): PreparationDocument {
  let doc = base;
  for (const s of stamps) {
    if (doc.stamps.some((x) => x.selloId === s.id)) continue;
    const r = addStamp(doc, s);
    // Si no entra se agrega igual: los controles lo marcan y no se pierde de vista.
    doc = r.added ? r.doc : reflowMesa({ ...doc, stamps: [...doc.stamps, ...createPreparation(doc.programId, doc.machine, [s]).stamps] });
  }
  return doc;
}

/** Sellos que se están sumando o quitando en el servidor: la recarga no los pisa. */
export interface MesaPending { adding: Set<string>; removing: Set<string> }

/** Mantiene el borrador al día con los sellos asignados (otra PC, tablero, realtime). */
export function reconcileMesa(doc: PreparationDocument, stamps: MesaSource[], pending?: MesaPending): PreparationDocument {
  const base = ensureFullUsableLength(doc);
  const ids = new Set(stamps.map((s) => s.id));
  const kept = base.stamps.filter((s) => ids.has(s.selloId) || pending?.adding.has(s.selloId));
  const next = kept.length === base.stamps.length ? base : reflowMesa({ ...base, stamps: kept });
  return placeSources(next, pending ? stamps.filter((s) => !pending.removing.has(s.id)) : stamps);
}

export interface ColumnUsage { columnId: string; nominalMm: number; usedMm: number; freeMm: number; totalMm: number; count: number }

/**
 * Alto de diseño (mm) que todavía entra en la planchuela al rearmar con 8 mm
 * entre sellos. Es la misma cuenta que usa `insertStamp` al soltar: no mira
 * huecos visuales ni reserva cola de corte (POL-097).
 */
export function maxAddableHeightMm(doc: PreparationDocument, columnId: string): number {
  const col = doc.columns.find((c) => c.id === columnId);
  if (!col) return 0;
  return freeForRow(col, columnStamps(doc, columnId));
}

/**
 * Corrige el default legacy de C (`bottomY: -400` con `topY: -8.958` → ~391 mm)
 * para que el largo útil sea 400 mm desde el origen del primer sello (igual que G/XL).
 * No toca planchuelas acortadas a mano (otro `bottomY`).
 */
export function ensureFullUsableLength(doc: PreparationDocument): PreparationDocument {
  if (doc.machine !== 'C') return doc;
  let changed = false;
  const columns = doc.columns.map((c) => {
    if (c.bottomY !== -400) return c;
    const bottomY = c.topY - 400;
    if (Math.abs(c.bottomY - bottomY) < 0.05) return c;
    changed = true;
    return { ...c, bottomY };
  });
  return changed ? { ...doc, columns } : doc;
}

/**
 * Ocupación de cada planchuela. `freeMm` = `maxAddableHeightMm` (criterio del soltar).
 */
export function columnUsage(doc: PreparationDocument): ColumnUsage[] {
  return doc.columns.map((c) => {
    const stamps = columnStamps(doc, c.id);
    const totalMm = c.topY - c.bottomY;
    const usedMm = stamps.reduce(
      (sum, s, i) => sum + s.heightMm + (i < stamps.length - 1 ? MESA_GAP_MM : 0),
      0,
    );
    return {
      columnId: c.id,
      nominalMm: c.nominalMm,
      count: stamps.length,
      totalMm,
      usedMm: Math.min(totalMm, usedMm),
      freeMm: maxAddableHeightMm(doc, c.id),
    };
  });
}

export type CheckState = 'ok' | 'warning' | 'error' | 'pending';
export interface CheckGroup { id: string; label: string; state: CheckState; items: PreparationIssue[]; hint?: string }

const GROUPS: { id: string; label: string; codes: string[] }[] = [
  { id: 'entra', label: 'Entra en las planchuelas', codes: ['WIDTH', 'LENGTH', 'MACHINING_LENGTH', 'TOOL_ENVELOPE', 'COLUMN', 'DUPLICATE_COLUMN'] },
  { id: 'separacion', label: 'Separación de corte de 8 mm', codes: ['SEPARATION', 'GAP'] },
  { id: 'material', label: 'Material en las planchuelas', codes: ['MATERIAL'] },
  { id: 'vectores', label: 'Vectores vigentes', codes: ['VECTOR', 'SOURCE_CHANGED', 'ASPECT', 'REMOVED', 'MISSING', 'DUPLICATE', 'IDENTITY', 'GEOMETRY', 'EXCLUDED_PENDING', 'EXCLUDED_REASON'] },
  { id: 'maquina', label: 'Máquina configurada', codes: ['SUPPORT', 'RECIPE', 'PERIMETER_TEMPLATE', 'INVALID'] },
];

/**
 * Controles agrupados en lenguaje del taller, más el estado del repaso fino.
 * `legacy`: el programa va con el gadget anterior, que no usa el soporte ni las
 * plantillas de la preparación; esos controles no aplican.
 */
export function mesaChecks(doc: PreparationDocument, sources?: PreparationSource[], opts: { legacy?: boolean } = {}): CheckGroup[] {
  const issues = validatePreparation(doc, sources);
  const groups: CheckGroup[] = GROUPS.filter((g) => !(opts.legacy && g.id === 'maquina')).map((g) => {
    const items = issues.filter((i) => g.codes.includes(i.code));
    return { id: g.id, label: g.label, items, state: items.some((i) => i.severity === 'error') ? 'error' : items.length ? 'warning' : 'ok' };
  });
  const leftovers = issues.filter((i) => !GROUPS.some((g) => g.codes.includes(i.code)) && i.code !== 'EMPTY');
  if (leftovers.length) groups[0] = { ...groups[0], items: [...groups[0].items, ...leftovers], state: 'error' };
  const stamps = active(doc);
  // Sin analysisVersion = nunca se chequeó (o se cambió algo después).
  const unchecked = stamps.filter((s) => !s.fine?.analysisVersion);
  const failed = stamps.filter((s) => s.fine?.analysisVersion && s.fine.outcome === 'sin_analisis');
  const review = stamps.filter((s) => s.fine?.analysisVersion && /^revisar/.test(s.fine.outcome));
  groups.push({
    id: 'fresa', label: 'Fresa y repaso fino',
    state: !stamps.length || unchecked.length ? 'pending' : review.length || failed.length ? 'warning' : 'ok',
    items: [
      ...review.map((s): PreparationIssue => ({ code: 'FRESA', severity: 'warning', instanceId: s.instanceId, message: `${s.name}: revisar la fresa antes de Aspire.` })),
      ...failed.map((s): PreparationIssue => ({ code: 'FRESA_SIN_ANALISIS', severity: 'warning', instanceId: s.instanceId, message: `${s.name}: no se pudo chequear; va con repaso completo.` })),
    ],
    hint: unchecked.length ? `${unchecked.length} sin chequear: se chequean al guardar.` : undefined,
  });
  return groups;
}

export type MesaStep = 'armado' | 'revisar' | 'aspire' | 'fabricar';
export interface MesaProgress { step: MesaStep; done: Record<MesaStep, boolean>; blocking: string | null }

/**
 * Etapa del programa: armado (hay sellos y entran), revisar (guardado y
 * chequeado, sin errores), aspire (Aspire devolvió la revisión vigente) y
 * fabricar (archivo de esa revisión confirmado).
 */
export function mesaProgress(doc: PreparationDocument, state: { savedRevision: number | null; dirty: boolean; syncedRevision: number | null; fileRevision: number | null }, sources?: PreparationSource[], opts: { legacy?: boolean } = {}): MesaProgress {
  const checks = mesaChecks(doc, sources, opts);
  const hasStamps = active(doc).length > 0;
  const layoutOk = hasStamps && checks.filter((g) => ['entra', 'separacion', 'material', 'vectores'].includes(g.id)).every((g) => g.state !== 'error');
  // Con el gadget anterior, un programa que ya sincronizó no espera un chequeo nuevo de fresa: no cambia lo hecho en Aspire.
  const alreadyInAspire = !!opts.legacy && state.savedRevision !== null && state.syncedRevision === state.savedRevision;
  const ready = layoutOk && checks.every((g) => g.state !== 'error' && (g.state !== 'pending' || alreadyInAspire)) && !state.dirty && state.savedRevision !== null;
  const synced = ready && state.syncedRevision === state.savedRevision;
  const filed = synced && state.fileRevision === state.savedRevision;
  const done = { armado: layoutOk, revisar: ready, aspire: synced, fabricar: filed };
  const step: MesaStep = !layoutOk ? 'armado' : !ready ? 'revisar' : !synced ? 'aspire' : 'fabricar';
  const firstError = checks.flatMap((g) => g.items).find((i) => i.severity === 'error');
  const blocking = !hasStamps ? 'Sumá sellos desde la cola.'
    : firstError ? firstError.message
      : state.dirty || state.savedRevision === null ? 'Guardá para chequear la fresa y fijar la revisión.'
        : !ready ? 'Chequeá la fresa de los sellos antes de Aspire.'
        : !synced ? 'Abrí Aspire y sincronizá con el gadget.' : !filed ? 'Falta subir el archivo de Aspire.' : null;
  return { step, done, blocking };
}

export function emptyDocument(programId: string, machine: PreparationMachine): PreparationDocument {
  return ensureFullUsableLength(createPreparation(programId, machine, []));
}
