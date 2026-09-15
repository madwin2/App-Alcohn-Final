export function containSize(
  viewBoxW: number,
  viewBoxH: number,
  boxW: number,
  boxH: number,
): { widthMm: number; heightMm: number } {
  if (viewBoxW <= 0 || viewBoxH <= 0 || boxW <= 0 || boxH <= 0) {
    return { widthMm: boxW, heightMm: boxH };
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
