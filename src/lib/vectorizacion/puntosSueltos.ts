import { buildEditDoc, computePieces, removeRefs, serializeEditDoc, type Box, type EditDoc } from '@/lib/fresa/editDoc';

/** Una pieza es «chica» si su lado largo no pasa este porcentaje del dibujo entero. */
const LADO_MAX_FRACCION = 0.03;
/** Separación mínima del resto del diseño, como fracción de su lado largo. */
const SEPARACION_MIN_FRACCION = 0.08;
/** Más que esto ya parece algo dibujado a propósito (un renglón, un patrón), no restos. */
const MAX_PUNTOS = 6;

export interface PuntosSueltos {
  cantidad: number;
  /** El mismo SVG sin esos puntos (mismo lienzo y medida declarada). */
  limpio: string;
}

const union = (a: Box | null, b: Box): Box =>
  a
    ? { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }
    : { ...b };

const ladoLargo = (b: Box) => Math.max(b.maxX - b.minX, b.maxY - b.minY);

/** Distancia entre dos cajas (0 si se tocan o se pisan). */
function separacion(a: Box, b: Box): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.hypot(dx, dy);
}

function nodeBounds(doc: EditDoc): Box | null {
  let box: Box | null = null;
  for (const path of doc.paths)
    for (const sub of path.subs)
      for (const n of sub.nodes) box = union(box, { minX: n.p.x, minY: n.p.y, maxX: n.p.x, maxY: n.p.y });
  return box;
}

/**
 * Puntos chicos que quedaron colgados lejos del diseño (restos de la
 * vectorización). Al guardar, el lienzo se ajusta a todo lo dibujado: un punto
 * suelto abajo agranda la caja, el logo queda arriba con blanco abajo y la
 * medida no coincide con lo pedido.
 *
 * null si no hay, o si el SVG no se puede leer como rellenos negros.
 */
export function detectarPuntosSueltos(svgText: string): PuntosSueltos | null {
  const built = buildEditDoc(svgText);
  if (!built.ok) return null;
  const doc = built.doc;
  const rough = nodeBounds(doc);
  if (!rough || ladoLargo(rough) <= 0) return null;
  const pieces = computePieces(doc, ladoLargo(rough) / 2000);
  if (pieces.length < 2) return null;

  let todo: Box | null = null;
  for (const p of pieces) todo = union(todo, p.bounds);
  if (!todo) return null;
  const ladoMax = ladoLargo(todo) * LADO_MAX_FRACCION;
  const chicas = pieces.filter((p) => ladoLargo(p.bounds) <= ladoMax);
  let nucleo: Box | null = null;
  for (const p of pieces) if (!chicas.includes(p)) nucleo = union(nucleo, p.bounds);
  if (!nucleo || ladoLargo(nucleo) <= 0) return null;

  const minSep = ladoLargo(nucleo) * SEPARACION_MIN_FRACCION;
  const sueltas = chicas.filter((p) => separacion(p.bounds, nucleo) > minSep);
  if (!sueltas.length || sueltas.length > MAX_PUNTOS) return null;

  return {
    cantidad: sueltas.length,
    limpio: serializeEditDoc(removeRefs(doc, sueltas.flatMap((p) => p.refs))),
  };
}
