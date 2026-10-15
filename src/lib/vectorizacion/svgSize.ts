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

export function applyPhysicalSize(svgText: string, requestedWidthMm: number, requestedHeightMm: number): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return svgText;
  const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const vbW = vb && vb.length === 4 ? vb[2] : Number(svg.getAttribute('width')) || requestedWidthMm;
  const vbH = vb && vb.length === 4 ? vb[3] : Number(svg.getAttribute('height')) || requestedHeightMm;
  const size = containSize(vbW, vbH, requestedWidthMm, requestedHeightMm);
  svg.setAttribute('width', `${size.widthMm}mm`);
  svg.setAttribute('height', `${size.heightMm}mm`);
  return new XMLSerializer().serializeToString(svg);
}

export function parseViewBoxAspect(svgText: string): number | null {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg) return null;
  const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[3] > 0) return vb[2] / vb[3];
  return null;
}
