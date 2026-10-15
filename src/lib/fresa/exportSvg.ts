/**
 * Arma el SVG corregido a partir del original.
 *
 * Para no degradar el archivo, solo se reemplazan las figuras que la corrección
 * tocó: el resto de los <path> queda byte a byte igual (con sus curvas). Las
 * figuras tocadas pasan a ser polígonos finos (error < 2 µm), que Aspire
 * importa sin problema.
 *
 * Si el SVG usa rellenos blancos o trazos (donde el orden de pintura importa),
 * se reemplaza todo el dibujo por una sola figura negra equivalente.
 */
import { buildBlackRegion, type PaintShape } from './analyze';
import { UM, bounds, boundsOverlap, clipToBounds, difference, intersect, simplify, type Paths64 } from './geometry';
import type { ParsedSvg } from './svgShapes';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Encaja el dibujo en la medida original: mete todo lo dibujable en un grupo
 * con p' = (p − from) · scale + to (unidades del viewBox). Escala pareja, sin
 * deformar; el viewBox y la medida declarada no cambian.
 */
export function wrapFit(
  svgText: string,
  fit: { scale: number; from: { x: number; y: number }; to: { x: number; y: number } },
): string {
  if (!(fit.scale < 0.9995)) return svgText;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  const g = doc.createElementNS(SVG_NS, 'g');
  const n = (v: number) => Number(v.toFixed(6));
  g.setAttribute(
    'transform',
    `translate(${n(fit.to.x)} ${n(fit.to.y)}) scale(${n(fit.scale)}) translate(${n(-fit.from.x)} ${n(-fit.from.y)})`,
  );
  g.setAttribute('data-alcohn', 'encaje-medida');
  const keep = new Set(['defs', 'style', 'title', 'desc', 'metadata']);
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 1 && keep.has((child as Element).localName.toLowerCase())) continue;
    g.appendChild(child);
  }
  root.appendChild(g);
  return new XMLSerializer().serializeToString(root);
}

/** Paths64 (µm) → atributo `d` en unidades del viewBox. */
export function pathsToD(paths: Paths64, mmPerUnit: number, decimals = 4): string {
  const f = 1 / (mmPerUnit * UM);
  const fmt = (v: number) => {
    const s = (v * f).toFixed(decimals);
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  };
  return paths
    .filter((p) => p.length >= 3)
    .map((p) => `M${p.map((q) => `${fmt(q.x)} ${fmt(q.y)}`).join('L')}Z`)
    .join('');
}

function isSimplePaint(shapes: PaintShape[]): boolean {
  return shapes.every((s) => (s.fill === 'dark' || s.fill === 'none') && s.stroke === 'none');
}

function makePath(doc: Document, d: string): Element {
  const el = doc.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', '#000000');
  el.setAttribute('fill-rule', 'nonzero');
  el.setAttribute('data-alcohn', 'corregido-fresa');
  return el;
}

/**
 * @param parsed SVG ya leído (se modifica su documento; volver a leer si hace falta el original).
 * @param removed lo que la corrección sacó de negro (µm).
 * @param newBlack región negra final (µm), para el modo de reemplazo total.
 */
export function buildCorrectedSvg(
  parsed: ParsedSvg,
  mmPerUnit: number,
  removed: Paths64,
  newBlack: Paths64,
): string {
  const { doc, elements, shapes } = parsed;
  const root = doc.documentElement;
  const removedBounds = bounds(removed);
  if (!removedBounds) return new XMLSerializer().serializeToString(root);

  if (isSimplePaint(shapes)) {
    for (const shape of shapes) {
      if (shape.fill !== 'dark') continue;
      const region = buildBlackRegion([shape], mmPerUnit);
      const rb = bounds(region);
      if (!rb || !boundsOverlap(rb, removedBounds)) continue;
      const local = clipToBounds(removed, rb, 10);
      if (!intersect(region, local).length) continue;
      const nextRegion = simplify(difference(region, local), 2);
      const el = elements[shape.index];
      if (!el?.parentNode) continue;
      el.parentNode.removeChild(el);
      if (nextRegion.length) root.appendChild(makePath(doc, pathsToD(nextRegion, mmPerUnit)));
    }
  } else {
    for (const el of elements) el.parentNode?.removeChild(el);
    root.appendChild(makePath(doc, pathsToD(simplify(newBlack, 2), mmPerUnit)));
  }
  return new XMLSerializer().serializeToString(root);
}
