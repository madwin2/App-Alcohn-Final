import type { PackedCell, PackedSheet } from './types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DRAWABLE = new Set(['path', 'polygon', 'polyline', 'g', 'circle', 'ellipse', 'rect', 'line', 'use', 'image', 'text']);

export function parseViewBox(svgEl: Element): { w: number; h: number } | null {
  const raw = svgEl.getAttribute('viewBox');
  if (!raw) {
    const w = Number(svgEl.getAttribute('width'));
    const h = Number(svgEl.getAttribute('height'));
    if (w > 0 && h > 0) return { w, h };
    return null;
  }
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { w: parts[2], h: parts[3] };
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function cellContainingPoint(placement: PackedSheet, px: number, py: number): PackedCell | null {
  for (const cell of placement.cells) {
    if (px >= cell.x && px <= cell.x + cell.w && py >= cell.y && py <= cell.y + cell.h) {
      return cell;
    }
  }
  let best: PackedCell | null = null;
  let bestDist = Infinity;
  for (const cell of placement.cells) {
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2;
    const dist = (px - cx) ** 2 + (py - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  }
  return best;
}

function num(el: Element, attr: string, fallback = 0): number {
  const value = Number(el.getAttribute(attr));
  return Number.isFinite(value) ? value : fallback;
}

export function geometricBBox(el: Element): Box | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'rect') {
    return { x: num(el, 'x'), y: num(el, 'y'), w: num(el, 'width'), h: num(el, 'height') };
  }
  if (tag === 'circle') {
    const r = num(el, 'r');
    return { x: num(el, 'cx') - r, y: num(el, 'cy') - r, w: r * 2, h: r * 2 };
  }
  if (tag === 'ellipse') {
    const rx = num(el, 'rx');
    const ry = num(el, 'ry');
    return { x: num(el, 'cx') - rx, y: num(el, 'cy') - ry, w: rx * 2, h: ry * 2 };
  }
  return null;
}

function hostSvg(svgEl: SVGSVGElement): HTMLDivElement {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.style.visibility = 'hidden';
  document.body.appendChild(host);
  host.appendChild(svgEl);
  return host;
}

function elementBBox(el: SVGGraphicsElement): Box | null {
  try {
    const bbox = el.getBBox();
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
    }
  } catch {
    // jsdom / SVG no montado
  }
  return geometricBBox(el);
}

function serializeCellSvg(original: SVGSVGElement, nodes: Element[], box: Box): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  const defs = original.querySelector('defs');
  if (defs) svg.appendChild(defs.cloneNode(true));
  const style = original.querySelector('style');
  if (style) svg.appendChild(style.cloneNode(true));
  for (const node of nodes) svg.appendChild(node.cloneNode(true));
  return new XMLSerializer().serializeToString(svg);
}

export function splitSheetSvg(svgText: string, placement: PackedSheet): Map<string, string> {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El SVG de Vectorizer.AI no se pudo parsear');
  }
  const svgEl = doc.documentElement as unknown as SVGSVGElement;
  const viewBox = parseViewBox(svgEl);
  if (!viewBox) throw new Error('El SVG no trae viewBox');
  if (Math.abs(viewBox.w - placement.width) > 1.5 || Math.abs(viewBox.h - placement.height) > 1.5) {
    throw new Error(
      `El viewBox del SVG (${viewBox.w}×${viewBox.h}) no coincide con la hoja (${placement.width}×${placement.height})`,
    );
  }

  const host = typeof document !== 'undefined' ? hostSvg(document.importNode(svgEl, true) as unknown as SVGSVGElement) : null;
  const mounted = (host?.firstChild as SVGSVGElement | null) ?? svgEl;
  const grouped = new Map<string, { nodes: Element[]; boxes: Box[] }>();

  try {
    const children = Array.from(mounted.children);
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'defs' || tag === 'style' || tag === 'title' || tag === 'desc' || tag === 'metadata') continue;
      if (!DRAWABLE.has(tag)) continue;
      const box = elementBBox(child as unknown as SVGGraphicsElement);
      if (!box) continue;
      const cell = cellContainingPoint(placement, box.x + box.w / 2, box.y + box.h / 2);
      if (!cell) continue;
      if (
        box.x < cell.x - 0.5 ||
        box.y < cell.y - 0.5 ||
        box.x + box.w > cell.x + cell.w + 0.5 ||
        box.y + box.h > cell.y + cell.h + 0.5
      ) {
        console.warn('[vectorizacion] elemento cruza el gutter; se asigna por el centro', child.tagName);
      }
      const bucket = grouped.get(cell.imageId) ?? { nodes: [], boxes: [] };
      bucket.nodes.push(child);
      bucket.boxes.push(box);
      grouped.set(cell.imageId, bucket);
    }

    const out = new Map<string, string>();
    for (const cell of placement.cells) {
      const bucket = grouped.get(cell.imageId);
      if (!bucket) continue;
      const union = unionBoxes(bucket.boxes);
      if (!union) continue;
      out.set(cell.imageId, serializeCellSvg(mounted, bucket.nodes, union));
    }
    return out;
  } finally {
    host?.remove();
  }
}
