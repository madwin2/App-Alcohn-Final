/**
 * Lectura de un SVG como "pintura": lista ordenada de figuras rellenas con su
 * color resuelto (negro = relieve del sello, blanco = se saca), en coordenadas
 * del viewBox raíz (todas las transformaciones ya aplicadas).
 *
 * Usa DOMParser (navegador / jsdom). No necesita montar el SVG en la página.
 */
import { flattenEllipse, flattenPathData, flattenRect, parsePointList, type Pt } from './pathData';

/** Matriz afín [a b c d e f] como en SVG: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export type Paint = 'dark' | 'light' | 'none';

export interface ShapeItem {
  /** Elemento de origen (índice en orden de documento), para poder reemplazarlo al corregir. */
  index: number;
  tag: string;
  /** Polígonos (sub-trayectos) en coordenadas del viewBox raíz. */
  rings: Pt[][];
  /** Rings abiertos (solo importan para trazos). */
  openFlags: boolean[];
  fill: Paint;
  fillRule: 'nonzero' | 'evenodd';
  stroke: Paint;
  /** Ancho del trazo en unidades del viewBox raíz (ya escalado). */
  strokeWidth: number;
  /** Coordenadas propias del elemento → viewBox raíz. */
  matrix: Matrix;
  /** Coordenadas del padre → viewBox raíz (para agregarle un `transform`). */
  parentMatrix: Matrix;
}

export interface ParsedSvg {
  shapes: ShapeItem[];
  /** Ancho/alto físicos declarados en el SVG, en mm (null si no se puede saber). */
  declaredWidthMm: number | null;
  declaredHeightMm: number | null;
  viewBox: { x: number; y: number; w: number; h: number } | null;
  /** mm por unidad del viewBox según lo declarado (null si no hay width/height con unidad). */
  declaredMmPerUnit: number | null;
  /** Avisos de lectura (elementos no soportados, trazos, etc.). */
  warnings: string[];
  /** Documento parseado y elementos de cada figura (mismo índice que `shape.index`). */
  doc: Document;
  elements: Element[];
}

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Lleva un desplazamiento del viewBox raíz a las coordenadas de la matriz (sin la traslación). */
export function rootDeltaToLocal(m: Matrix, d: Pt): Pt {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  return { x: (m[3] * d.x - m[2] * d.y) / det, y: (-m[1] * d.x + m[0] * d.y) / det };
}

/** Escala media de una matriz (raíz del determinante). */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

export function parseTransform(raw: string | null): Matrix {
  if (!raw) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const args = (match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length >= 6) t = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const r: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const cx = args[1];
          const cy = args[2];
          t = multiply(multiply([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
        } else {
          t = r;
        }
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  yellow: [255, 255, 0],
};

/** Clasifica un color de relleno: oscuro (relieve), claro (se saca) o nada. */
export function classifyColor(raw: string | null | undefined): Paint | null {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (!v || v === 'inherit') return null;
  if (v === 'none' || v === 'transparent') return 'none';
  if (v.startsWith('url(')) return 'dark'; // degradés/patrones: los tratamos como relleno
  if (v === 'currentcolor') return 'dark';
  let rgb: [number, number, number] | null = null;
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      rgb = [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    } else if (h.length === 6 || h.length === 8) {
      rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
  } else if (v.startsWith('rgb')) {
    const nums = (v.match(/[\d.]+%?/g) ?? []).slice(0, 3).map((s) => (s.endsWith('%') ? (parseFloat(s) * 255) / 100 : parseFloat(s)));
    if (nums.length === 3) rgb = [nums[0], nums[1], nums[2]];
  } else if (NAMED[v]) {
    rgb = NAMED[v];
  }
  if (!rgb) return 'dark';
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum < 0.5 ? 'dark' : 'light';
}

interface StyleCtx {
  fill: string | null;
  fillRule: string | null;
  fillOpacity: string | null;
  stroke: string | null;
  strokeWidth: string | null;
  strokeOpacity: string | null;
  display: string | null;
  visibility: string | null;
  opacity: string | null;
}

const EMPTY_STYLE: StyleCtx = {
  fill: null,
  fillRule: null,
  fillOpacity: null,
  stroke: null,
  strokeWidth: null,
  strokeOpacity: null,
  display: null,
  visibility: null,
  opacity: null,
};

const PROP_MAP: Record<string, keyof StyleCtx> = {
  fill: 'fill',
  'fill-rule': 'fillRule',
  'fill-opacity': 'fillOpacity',
  stroke: 'stroke',
  'stroke-width': 'strokeWidth',
  'stroke-opacity': 'strokeOpacity',
  display: 'display',
  visibility: 'visibility',
  opacity: 'opacity',
};

function parseDeclarations(text: string): Partial<StyleCtx> {
  const out: Partial<StyleCtx> = {};
  for (const decl of text.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).replace(/!important/i, '').trim();
    const prop = PROP_MAP[key];
    if (prop) out[prop] = value;
  }
  return out;
}

/** Reglas simples de <style>: `.clase`, `#id`, `tag` y listas separadas por coma. */
function parseStyleSheets(doc: Document): Array<{ selector: string; decls: Partial<StyleCtx> }> {
  const rules: Array<{ selector: string; decls: Partial<StyleCtx> }> = [];
  const styles = Array.from(doc.getElementsByTagName('style'));
  for (const el of styles) {
    const css = (el.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decls = parseDeclarations(m[2]);
      for (const sel of m[1].split(',')) {
        const selector = sel.trim();
        if (selector) rules.push({ selector, decls });
      }
    }
  }
  return rules;
}

function matchesSelector(el: Element, selector: string): boolean {
  if (selector.startsWith('.')) {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/);
    return selector
      .slice(1)
      .split('.')
      .every((c) => cls.includes(c));
  }
  if (selector.startsWith('#')) return el.getAttribute('id') === selector.slice(1);
  if (/^[a-zA-Z]+$/.test(selector)) return el.localName.toLowerCase() === selector.toLowerCase();
  return false;
}

function resolveStyle(
  el: Element,
  parent: StyleCtx,
  rules: Array<{ selector: string; decls: Partial<StyleCtx> }>,
): StyleCtx {
  const own: Partial<StyleCtx> = {};
  // Atributos de presentación < reglas CSS < style="" (orden de cascada de SVG).
  for (const [attr, prop] of Object.entries(PROP_MAP)) {
    const v = el.getAttribute(attr);
    if (v != null) own[prop] = v;
  }
  for (const rule of rules) {
    if (matchesSelector(el, rule.selector)) Object.assign(own, rule.decls);
  }
  const inline = el.getAttribute('style');
  if (inline) Object.assign(own, parseDeclarations(inline));

  // display y opacity no se heredan como valor, pero un padre oculto oculta al hijo.
  return {
    fill: own.fill ?? parent.fill,
    fillRule: own.fillRule ?? parent.fillRule,
    fillOpacity: own.fillOpacity ?? parent.fillOpacity,
    stroke: own.stroke ?? parent.stroke,
    strokeWidth: own.strokeWidth ?? parent.strokeWidth,
    strokeOpacity: own.strokeOpacity ?? parent.strokeOpacity,
    display: own.display === 'none' || parent.display === 'none' ? 'none' : own.display ?? null,
    visibility: own.visibility ?? parent.visibility,
    opacity: own.opacity === '0' || parent.opacity === '0' ? '0' : own.opacity ?? null,
  };
}

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
  '': 25.4 / 96,
};

function lengthToMm(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const f = UNIT_TO_MM[(m[2] ?? '').toLowerCase()];
  return Number.isFinite(v) && f != null ? v * f : null;
}

function num(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (raw == null) return fallback;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

const SKIP_TAGS = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'pattern',
  'marker',
  'lineargradient',
  'radialgradient',
  'filter',
  'style',
  'title',
  'desc',
  'metadata',
  'script',
  'text', // el texto vivo no tiene geometría: se avisa aparte
]);

/**
 * Lee el SVG y devuelve las figuras en orden de pintura.
 * @param tolMm tolerancia de aplanado deseada en mm (se convierte a unidades del viewBox).
 */
export function parseSvgShapes(svgText: string, tolMm = 0.004): ParsedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  const warnings: string[] = [];
  if (!root || root.localName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El archivo no es un SVG válido.');
  }

  const vbRaw = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const viewBox =
    vbRaw && vbRaw.length === 4 && vbRaw.every(Number.isFinite) && vbRaw[2] > 0 && vbRaw[3] > 0
      ? { x: vbRaw[0], y: vbRaw[1], w: vbRaw[2], h: vbRaw[3] }
      : null;
  const declaredWidthMm = lengthToMm(root.getAttribute('width'));
  const declaredHeightMm = lengthToMm(root.getAttribute('height'));
  let declaredMmPerUnit: number | null = null;
  if (viewBox && declaredWidthMm && declaredHeightMm) {
    // preserveAspectRatio por defecto (xMidYMid meet): escala uniforme = la menor.
    declaredMmPerUnit = Math.min(declaredWidthMm / viewBox.w, declaredHeightMm / viewBox.h);
  } else if (!viewBox && declaredWidthMm) {
    const unit = (root.getAttribute('width') ?? '').trim().match(/(mm|cm|in|pt|pc|px)$/i)?.[1] ?? 'px';
    declaredMmPerUnit = UNIT_TO_MM[unit.toLowerCase()];
  } else {
    declaredMmPerUnit = UNIT_TO_MM.px;
  }

  // Tolerancia en unidades del viewBox. Si no sabemos la escala física, una
  // fracción del tamaño del dibujo.
  const baseTolUnits =
    declaredMmPerUnit && declaredMmPerUnit > 0
      ? tolMm / declaredMmPerUnit
      : viewBox
        ? Math.max(viewBox.w, viewBox.h) / 20000
        : 0.01;

  const rules = parseStyleSheets(doc);
  const shapes: ShapeItem[] = [];
  const elements: Element[] = [];
  let index = 0;
  let textCount = 0;
  let imageCount = 0;
  let strokeCount = 0;

  const walk = (el: Element, parentMatrix: Matrix, parentStyle: StyleCtx) => {
    const tag = el.localName.toLowerCase();
    if (tag === 'text') textCount++;
    if (tag === 'image') imageCount++;
    if (SKIP_TAGS.has(tag)) return;
    const style = resolveStyle(el, parentStyle, rules);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    const matrix = el === root ? parentMatrix : multiply(parentMatrix, parseTransform(el.getAttribute('transform')));

    if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') {
      for (const child of Array.from(el.children)) walk(child, matrix, style);
      return;
    }

    const tolUnits = baseTolUnits / matrixScale(matrix);
    let local: Array<{ points: Pt[]; closed: boolean }> = [];
    switch (tag) {
      case 'path':
        local = flattenPathData(el.getAttribute('d') ?? '', tolUnits);
        break;
      case 'polygon':
        local = [{ points: parsePointList(el.getAttribute('points') ?? ''), closed: true }];
        break;
      case 'polyline':
        local = [{ points: parsePointList(el.getAttribute('points') ?? ''), closed: false }];
        break;
      case 'rect':
        local = [
          {
            points: flattenRect(
              num(el, 'x'),
              num(el, 'y'),
              num(el, 'width'),
              num(el, 'height'),
              num(el, 'rx'),
              num(el, 'ry'),
              tolUnits,
            ),
            closed: true,
          },
        ];
        break;
      case 'circle': {
        const r = num(el, 'r');
        local = [{ points: flattenEllipse(num(el, 'cx'), num(el, 'cy'), r, r, tolUnits), closed: true }];
        break;
      }
      case 'ellipse':
        local = [
          {
            points: flattenEllipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'), tolUnits),
            closed: true,
          },
        ];
        break;
      case 'line':
        local = [
          {
            points: [
              { x: num(el, 'x1'), y: num(el, 'y1') },
              { x: num(el, 'x2'), y: num(el, 'y2') },
            ],
            closed: false,
          },
        ];
        break;
      default:
        return;
    }
    const myIndex = index++;
    elements.push(el);
    const rings = local.filter((s) => s.points.length >= 2);
    if (!rings.length) return;

    const fillOpacity = style.fillOpacity != null ? parseFloat(style.fillOpacity) : 1;
    let fill: Paint = classifyColor(style.fill ?? 'black') ?? 'dark';
    if (fillOpacity === 0 || tag === 'line') fill = 'none';
    let stroke: Paint = classifyColor(style.stroke ?? 'none') ?? 'none';
    const strokeOpacity = style.strokeOpacity != null ? parseFloat(style.strokeOpacity) : 1;
    const swUnits = style.strokeWidth != null ? parseFloat(style.strokeWidth) : 1;
    if (strokeOpacity === 0 || !(swUnits > 0)) stroke = 'none';
    if (stroke !== 'none') strokeCount++;

    shapes.push({
      index: myIndex,
      tag,
      rings: rings.map((r) => r.points.map((p) => applyMatrix(matrix, p))),
      openFlags: rings.map((r) => !r.closed),
      fill,
      fillRule: (style.fillRule ?? '').trim() === 'evenodd' ? 'evenodd' : 'nonzero',
      stroke,
      strokeWidth: swUnits * matrixScale(matrix),
      matrix,
      parentMatrix,
    });
  };

  walk(root, IDENTITY, { ...EMPTY_STYLE });

  if (textCount) warnings.push(`Tiene ${textCount} texto(s) sin convertir a curvas: no se pueden analizar.`);
  if (imageCount) warnings.push(`Tiene ${imageCount} imagen(es) incrustada(s): no se pueden analizar.`);
  if (strokeCount) warnings.push(`Tiene ${strokeCount} figura(s) con trazo (stroke): se analizaron convirtiendo el trazo en relleno.`);

  return { shapes, declaredWidthMm, declaredHeightMm, viewBox, declaredMmPerUnit, warnings, doc, elements };
}
