export interface SvgMeasurement {
  widthMm: number;
  heightMm: number;
  aspectRatio: number; // widthMm / heightMm
}

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96, // 96dpi, default de SVG/CSS
};

interface ParsedLength {
  value: number;
  unit: string;
  mm: number;
}

function parseLength(raw: string | null): ParsedLength | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || 'px').toLowerCase();
  const factor = UNIT_TO_MM[unit];
  if (factor == null) return null;
  return { value, unit, mm: value * factor };
}

/** Mide un archivo SVG recién elegido por el usuario (antes o después de subirlo). */
export async function measureSvgFile(file: File): Promise<SvgMeasurement | null> {
  try {
    const text = await file.text();
    return measureSvgString(text);
  } catch {
    return null;
  }
}

/** Mide el bounding box real de la geometría de un SVG (no del artboard) y lo convierte a mm. */
export function measureSvgString(svgText: string): SvgMeasurement | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return null;

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.documentElement;
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg') return null;
  if (doc.getElementsByTagName('parsererror').length > 0) return null;

  // getBBox() necesita el elemento montado en el DOM (oculto, fuera de flujo).
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.style.visibility = 'hidden';
  document.body.appendChild(host);

  try {
    const imported = document.importNode(svgEl, true) as unknown as SVGSVGElement;
    host.appendChild(imported);

    let bbox: DOMRect | null = null;
    try {
      bbox = imported.getBBox();
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

    const widthAttr = parseLength(svgEl.getAttribute('width'));
    const heightAttr = parseLength(svgEl.getAttribute('height'));
    const viewBoxAttr = svgEl.getAttribute('viewBox');
    const viewBoxParts = viewBoxAttr ? viewBoxAttr.trim().split(/[\s,]+/).map(Number) : null;
    const viewBoxW = viewBoxParts && viewBoxParts.length === 4 ? viewBoxParts[2] : null;
    const viewBoxH = viewBoxParts && viewBoxParts.length === 4 ? viewBoxParts[3] : null;

    let scaleX: number;
    let scaleY: number;

    if (widthAttr && heightAttr && viewBoxW && viewBoxH) {
      // Con viewBox: el bbox está en el espacio de coordenadas del viewBox.
      scaleX = widthAttr.mm / viewBoxW;
      scaleY = heightAttr.mm / viewBoxH;
    } else if (widthAttr && heightAttr) {
      // Sin viewBox: 1 user unit == 1 unidad declarada en width/height.
      scaleX = UNIT_TO_MM[widthAttr.unit];
      scaleY = UNIT_TO_MM[heightAttr.unit];
    } else {
      // Sin width/height explícitos: asumir px a 96dpi (default de SVG).
      scaleX = UNIT_TO_MM.px;
      scaleY = UNIT_TO_MM.px;
    }

    const widthMm = bbox.width * scaleX;
    const heightMm = bbox.height * scaleY;
    if (widthMm <= 0 || heightMm <= 0) return null;

    return { widthMm, heightMm, aspectRatio: widthMm / heightMm };
  } finally {
    document.body.removeChild(host);
  }
}
