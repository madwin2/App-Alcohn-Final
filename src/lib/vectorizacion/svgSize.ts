import { geometryBox, parseSvgShapes } from '@/lib/fresa/svgShapes';

/**
 * Encaja el diseño (proporción del viewBox) dentro de la medida pedida sin
 * deformarlo.
 *
 * La medida pedida se escribe "lado largo × lado corto" sin importar la
 * orientación (un diseño parado de 10 × 50 mm es un "50×10"). Por eso la caja
 * se gira para que siga la orientación del diseño: si el diseño es más alto
 * que ancho, la caja también. Si no, un diseño parado se achicaría hasta
 * entrar acostado.
 */
export function containSize(
  viewBoxW: number,
  viewBoxH: number,
  boxW: number,
  boxH: number,
): { widthMm: number; heightMm: number } {
  if (viewBoxW <= 0 || viewBoxH <= 0 || boxW <= 0 || boxH <= 0) {
    return { widthMm: boxW, heightMm: boxH };
  }
  if (viewBoxW > viewBoxH !== boxW > boxH && viewBoxW !== viewBoxH && boxW !== boxH) {
    [boxW, boxH] = [boxH, boxW];
  }
  const vbRatio = viewBoxW / viewBoxH;
  const boxRatio = boxW / boxH;
  if (vbRatio > boxRatio) {
    return { widthMm: boxW, heightMm: boxW / vbRatio };
  }
  return { widthMm: boxH * vbRatio, heightMm: boxH };
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/**
 * Ajusta el viewBox (el lienzo) a la caja del dibujo, sin mover nada.
 *
 * El vectorizado trae el lienzo de la imagen recortada, con margen blanco: un
 * dibujo de 40 × 9 puede venir en un lienzo de 40 × 16. Si se encajara el
 * lienzo en la medida pedida, el dibujo quedaría más chico (y con otra
 * proporción) que lo pedido. También deja adentro lo que el editor haya
 * agrandado o girado fuera del lienzo original (si no, se recortaría).
 * Conserva la escala física declarada (mm por unidad).
 */
export function fitViewBoxToDesign(svgText: string): string {
  let parsed: ReturnType<typeof parseSvgShapes>;
  try {
    parsed = parseSvgShapes(svgText, 0.01);
  } catch {
    return svgText;
  }
  const box = geometryBox(parsed);
  if (!box) return svgText;
  const svg = parsed.doc.documentElement;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const k = parsed.declaredMmPerUnit ?? 25.4 / 96;
  svg.setAttribute('viewBox', `${r6(box.minX)} ${r6(box.minY)} ${r6(w)} ${r6(h)}`);
  svg.setAttribute('width', `${r6(w * k)}mm`);
  svg.setAttribute('height', `${r6(h * k)}mm`);
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Lienzo ajustado al dibujo y medida física encajada en la caja pedida (sin
 * deformar). `width`/`height` quedan con la medida real del dibujo en mm.
 */
export function applyPhysicalSize(svgText: string, requestedWidthMm: number, requestedHeightMm: number): string {
  const doc = new DOMParser().parseFromString(fitViewBoxToDesign(svgText), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return svgText;
  const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const vbW = vb && vb.length === 4 ? vb[2] : Number(svg.getAttribute('width')) || requestedWidthMm;
  const vbH = vb && vb.length === 4 ? vb[3] : Number(svg.getAttribute('height')) || requestedHeightMm;
  const size = containSize(vbW, vbH, requestedWidthMm, requestedHeightMm);
  svg.setAttribute('width', `${r6(size.widthMm)}mm`);
  svg.setAttribute('height', `${r6(size.heightMm)}mm`);
  return new XMLSerializer().serializeToString(svg);
}

/** Medida en mm declarada en `width`/`height` (la que deja `applyPhysicalSize`). */
export function declaredSizeMm(svgText: string): { widthMm: number; heightMm: number } | null {
  const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  const w = svg?.getAttribute('width')?.trim().match(/^([\d.]+)mm$/);
  const h = svg?.getAttribute('height')?.trim().match(/^([\d.]+)mm$/);
  const widthMm = w ? Number(w[1]) : NaN;
  const heightMm = h ? Number(h[1]) : NaN;
  return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : null;
}

export function parseViewBoxAspect(svgText: string): number | null {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg) return null;
  const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[3] > 0) return vb[2] / vb[3];
  return null;
}
