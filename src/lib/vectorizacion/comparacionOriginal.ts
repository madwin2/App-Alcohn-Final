/**
 * Comparación del vector con la imagen original: encontrar lo que se perdió
 * (o apareció) al vectorizar. Caso típico: Vectorizer.AI borra el punto de
 * algunas «i» y en la revisión no se ve.
 *
 * 1. La imagen se pasa a una máscara de tinta (negro = diseño, umbral de Otsu).
 * 2. Se alinea con el vector (escala uniforme + corrimiento): primero por las
 *    cajas, después buscando la superposición máxima con una muestra de la
 *    tinta. Así no depende de cómo se recortó, se achicó en la hoja o se
 *    corrigió la fresa, y una pieza perdida en el borde no la corre.
 * 3. Se rasteriza el vector sobre la grilla de la imagen y se buscan:
 *    - piezas del original que no están en el vector (`falta-pieza`; si es un
 *      punto con un palito debajo, se marca como punto de i/j),
 *    - partes que faltan de una pieza (`falta-parte`),
 *    - cosas del vector que no están en el original (`sobra`: un ojo tapado).
 *    Las diferencias finas (bordes, lo que corrige la fresa) se ignoran con una
 *    tolerancia en mm.
 *
 * Es una sugerencia para revisar, no un veredicto. El núcleo trabaja sobre
 * máscaras (sin canvas) para poder testearlo; la carga de la imagen es lo
 * único que necesita el navegador.
 */
import { docBounds, flattenSub, type EditDoc } from '@/lib/fresa/editDoc';

export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Dónde cae la imagen en unidades del vector: píxel (u, v) → (x + u·scale, y + v·scale). */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  /** Superposición lograda (F1 0–1). Por debajo de `MIN_ALIGN_SCORE` no se compara. */
  score: number;
}

export type DiferenciaKind = 'falta-pieza' | 'falta-parte' | 'sobra';

export interface Diferencia {
  id: string;
  kind: DiferenciaKind;
  /** Pieza chica y redonda con un palito debajo: el punto de una i o una j. */
  punto: boolean;
  /** Caja en unidades del vector. */
  box: { minX: number; minY: number; maxX: number; maxY: number };
  areaMm2: number;
}

export interface ComparacionOriginal {
  status: 'ok' | 'diferencias' | 'sin-alinear' | 'error';
  error?: string;
  placement: Placement | null;
  diferencias: Diferencia[];
  /** Parecido de las dos máscaras (IoU 0–1). */
  parecido: number;
}

export const MIN_ALIGN_SCORE = 0.6;

/** Diferencias más finas que esto (mm) son bordes o correcciones de fresa: no cuentan. */
const TOL_MM = 0.15;
/** Una diferencia tiene que tener al menos este grosor (mm) para contar. */
const THICK_MM = 0.1;
/** Área mínima (mm²) de lo que se reporta: un punto de ~0,4 mm. */
const MIN_AREA_MM2 = 0.12;
/** Una pieza del original con menos de esta parte cubierta por el vector «falta». */
const MISSING_COVER = 0.35;

// ---------------------------------------------------------------- máscara de tinta

/** Umbral de Otsu sobre un histograma de 256 grises. */
export function otsuThreshold(hist: ArrayLike<number>): number {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  if (!total) return 128;
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return t;
}

/**
 * Máscara de tinta de una imagen RGBA (transparente = fondo). Si el borde
 * queda casi todo como tinta, la imagen es en negativo y se invierte.
 */
export function inkMaskFromRGBA(rgba: ArrayLike<number>, width: number, height: number): { mask: Mask; threshold: number; inverted: boolean } {
  const n = width * height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    const g = Math.round(l * a + 255 * (1 - a));
    gray[i] = g;
    hist[g]++;
  }
  // Acotado: en una imagen casi toda blanca Otsu puede cortar en grises claros.
  const threshold = Math.min(200, Math.max(60, otsuThreshold(hist)));
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = gray[i] <= threshold ? 1 : 0;
  let border = 0;
  let inkBorder = 0;
  for (let x = 0; x < width; x++) {
    inkBorder += data[x] + data[(height - 1) * width + x];
    border += 2;
  }
  for (let y = 0; y < height; y++) {
    inkBorder += data[y * width] + data[y * width + width - 1];
    border += 2;
  }
  const inverted = border > 0 && inkBorder / border > 0.6;
  if (inverted) for (let i = 0; i < n; i++) data[i] = 1 - data[i];
  return { mask: { data, width, height }, threshold, inverted };
}

export function maskBounds(m: Mask): { minX: number; minY: number; maxX: number; maxY: number; count: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < m.height; y++) {
    const row = y * m.width;
    for (let x = 0; x < m.width; x++) {
      if (!m.data[row + x]) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return count ? { minX, minY, maxX, maxY, count } : null;
}

// ---------------------------------------------------------------- rasterizado del vector

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: 1 | -1;
}

/**
 * Rasteriza el vector (relleno, con su regla por trayecto) en una grilla de
 * `width`×`height` celdas: la celda (i, j) cubre x ∈ [ox + i·unit, ox + (i+1)·unit).
 * Se muestrea el centro de cada celda. Sin canvas (corre en Node y en workers).
 */
export function rasterizeDoc(doc: EditDoc, ox: number, oy: number, unit: number, width: number, height: number): Mask {
  const data = new Uint8Array(width * height);
  const tol = unit * 0.35;
  const cov = new Int32Array(width);
  for (const path of doc.paths) {
    const edges: Edge[] = [];
    for (const sub of path.subs) {
      const pts = flattenSub(sub, tol);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        // A coordenadas de la grilla (centro de celda en .5).
        const ay = (a.y - oy) / unit;
        const by = (b.y - oy) / unit;
        if (ay === by) continue;
        const ax = (a.x - ox) / unit;
        const bx = (b.x - ox) / unit;
        edges.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1 } : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1 });
      }
    }
    if (!edges.length) continue;
    edges.sort((p, q) => p.y0 - q.y0);
    let next = 0;
    let active: Edge[] = [];
    const xs: { x: number; dir: number }[] = [];
    for (let row = 0; row < height; row++) {
      const yc = row + 0.5;
      while (next < edges.length && edges[next].y0 <= yc) active.push(edges[next++]);
      active = active.filter((e) => e.y1 > yc);
      if (!active.length) {
        if (next >= edges.length) break;
        continue;
      }
      xs.length = 0;
      for (const e of active) {
        if (e.y0 > yc) continue;
        xs.push({ x: e.x0 + ((yc - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), dir: e.dir });
      }
      xs.sort((p, q) => p.x - q.x);
      cov.fill(0);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wind += path.fillRule === 'evenodd' ? 1 : xs[k].dir;
        const inside = path.fillRule === 'evenodd' ? wind % 2 !== 0 : wind !== 0;
        if (!inside) continue;
        // Celdas cuyo centro (i + .5) cae en [x_k, x_k+1).
        const from = Math.max(0, Math.ceil(xs[k].x - 0.5));
        const to = Math.min(width - 1, Math.ceil(xs[k + 1].x - 0.5) - 1);
        for (let i = from; i <= to; i++) cov[i] = 1;
      }
      const rowOff = row * width;
      for (let i = 0; i < width; i++) if (cov[i]) data[rowOff + i] = 1;
    }
  }
  return { data, width, height };
}

// ---------------------------------------------------------------- morfología y componentes

/** Dilatación con un cuadrado de lado 2r+1 (separable). */
export function dilate(m: Mask, r: number): Mask {
  if (r <= 0) return m;
  const { width: w, height: h } = m;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    for (let x = 0; x < Math.min(r, w); x++) count += m.data[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) count += m.data[row + x + r];
      if (x - r - 1 >= 0) count -= m.data[row + x - r - 1];
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, h); y++) count += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) count += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) count -= tmp[(y - r - 1) * w + x];
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return { data: out, width: w, height: h };
}

/** Erosión con un cuadrado de lado 2r+1 (afuera de la imagen cuenta como vacío). */
export function erode(m: Mask, r: number): Mask {
  if (r <= 0) return m;
  const inv: Mask = { data: m.data.map((v) => 1 - v), width: m.width, height: m.height };
  // Afuera = vacío: se dilata el complemento con un borde lleno.
  const pad = r;
  const W = m.width + 2 * pad;
  const H = m.height + 2 * pad;
  const big = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < m.height; y++) big.set(inv.data.subarray(y * m.width, (y + 1) * m.width), (y + pad) * W + pad);
  const d = dilate({ data: big, width: W, height: H }, r);
  const out = new Uint8Array(m.width * m.height);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) out[y * m.width + x] = 1 - d.data[(y + pad) * W + x + pad];
  return { data: out, width: m.width, height: m.height };
}

export interface Component {
  label: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Componentes conexas (8 vecinos). `labels[i]` = número de componente + 1 (0 = vacío). */
export function components(m: Mask): { labels: Int32Array; comps: Component[] } {
  const { width: w, height: h } = m;
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!m.data[start] || labels[start]) continue;
    const label = comps.length + 1;
    const c: Component = { label, area: 0, minX: w, minY: h, maxX: -1, maxY: -1 };
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const j = ny * w + nx;
          if (m.data[j] && !labels[j]) {
            labels[j] = label;
            stack.push(j);
          }
        }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

const andNot = (a: Mask, b: Mask): Mask => ({ data: a.data.map((v, i) => v & (1 - b.data[i])), width: a.width, height: a.height });

// ---------------------------------------------------------------- alineación

/** Caja del dibujo, aplanando con un error de 1/2000 de su tamaño (con 0 no termina nunca). */
function vectorBounds(doc: EditDoc) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of doc.paths)
    for (const sub of path.subs)
      for (const n of sub.nodes) {
        minX = Math.min(minX, n.p.x);
        maxX = Math.max(maxX, n.p.x);
        minY = Math.min(minY, n.p.y);
        maxY = Math.max(maxY, n.p.y);
      }
  if (!Number.isFinite(minX)) return null;
  return docBounds(doc, Math.max(maxX - minX, maxY - minY, 1e-6) / 2000);
}

/** Generador determinístico (misma muestra en cada corrida). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Alinea la máscara del original con el vector: escala uniforme y corrimiento
 * que maximizan la superposición (F1 entre la tinta y el relleno del vector).
 */
export function alignOriginal(ink: Mask, doc: EditDoc): Placement | null {
  const ib = maskBounds(ink);
  const vb = vectorBounds(doc);
  if (!ib || !vb) return null;
  const vbW = vb.maxX - vb.minX;
  const vbH = vb.maxY - vb.minY;
  if (vbW <= 0 || vbH <= 0) return null;
  const span = Math.max(vbW, vbH);

  // Grilla del vector (con margen para corrimientos y escalas mayores).
  const G = 700;
  const c = (span * 1.4) / G;
  const gx0 = vb.minX - span * 0.2;
  const gy0 = vb.minY - span * 0.2;
  const gw = Math.ceil((vbW + span * 0.4) / c);
  const gh = Math.ceil((vbH + span * 0.4) / c);
  const grid = rasterizeDoc(doc, gx0, gy0, c, gw, gh);
  let gridCount = 0;
  for (let i = 0; i < grid.data.length; i++) gridCount += grid.data[i];
  if (!gridCount) return null;
  const vecArea = gridCount * c * c;

  // Muestra de la tinta (centros de píxel).
  const rand = lcg(12345);
  const N = 4000;
  const su = new Float64Array(N);
  const sv = new Float64Array(N);
  let n = 0;
  const p = Math.min(1, N / ib.count);
  for (let y = ib.minY; y <= ib.maxY && n < N; y++)
    for (let x = ib.minX; x <= ib.maxX && n < N; x++) {
      if (!ink.data[y * ink.width + x]) continue;
      if (p < 1 && rand() > p) continue;
      su[n] = x + 0.5;
      sv[n] = y + 0.5;
      n++;
    }
  if (!n) return null;

  const score = (s: number, tx: number, ty: number) => {
    let hits = 0;
    for (let k = 0; k < n; k++) {
      const gi = Math.floor((tx + su[k] * s - gx0) / c);
      const gj = Math.floor((ty + sv[k] * s - gy0) / c);
      if (gi >= 0 && gj >= 0 && gi < gw && gj < gh && grid.data[gj * gw + gi]) hits++;
    }
    const P = hits / n;
    const R = Math.min(1, (P * ib.count * s * s) / vecArea);
    return P + R > 0 ? (2 * P * R) / (P + R) : 0;
  };

  const inkW = ib.maxX - ib.minX + 1;
  const inkH = ib.maxY - ib.minY + 1;
  const inkCx = (ib.minX + ib.maxX + 1) / 2;
  const inkCy = (ib.minY + ib.maxY + 1) / 2;
  const vCx = (vb.minX + vb.maxX) / 2;
  const vCy = (vb.minY + vb.maxY) / 2;
  const sx = vbW / inkW;
  const sy = vbH / inkH;

  let best = { s: sx, tx: 0, ty: 0, f: -1 };
  const search = (s0: number, cx0: number, cy0: number, scaleStep: number, scaleN: number, tStep: number, tN: number) => {
    // (cx0, cy0) = dónde cae el centro de la tinta en el vector.
    for (let i = -scaleN; i <= scaleN; i++) {
      const s = s0 * (1 + i * scaleStep);
      for (let a = -tN; a <= tN; a++)
        for (let b = -tN; b <= tN; b++) {
          const cx = cx0 + a * tStep * span;
          const cy = cy0 + b * tStep * span;
          const tx = cx - inkCx * s;
          const ty = cy - inkCy * s;
          const f = score(s, tx, ty);
          if (f > best.f) best = { s, tx, ty, f };
        }
    }
  };
  for (const s0 of [sx, sy, Math.sqrt(sx * sy)]) search(s0, vCx, vCy, 0.02, 5, 0.01, 6);
  const center = () => ({ cx: best.tx + inkCx * best.s, cy: best.ty + inkCy * best.s });
  let k = center();
  search(best.s, k.cx, k.cy, 0.0025, 4, 0.002, 6);
  k = center();
  search(best.s, k.cx, k.cy, 0.0006, 4, 0.0005, 4);
  return { x: best.tx, y: best.ty, scale: best.s, score: best.f };
}

// ---------------------------------------------------------------- diferencias

/** ¿Hay un palito (trazo vertical angosto) justo debajo de esta pieza? */
function hasStemBelow(ink: Mask, vec: Mask, c: Component): boolean {
  const w = c.maxX - c.minX + 1;
  const h = c.maxY - c.minY + 1;
  if (w / h > 2.2 || h / w > 2.2) return false;
  const cx = Math.round((c.minX + c.maxX) / 2);
  const inkAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < ink.width && y < ink.height && (ink.data[y * ink.width + x] || vec.data[y * vec.width + x]) === 1;
  // Primer trazo debajo, a menos de 2,5 alturas del punto, en la columna del centro (o vecinas).
  for (const x of [cx, cx - Math.round(w / 4), cx + Math.round(w / 4)]) {
    let y = c.maxY + 1;
    const limit = c.maxY + Math.max(3, Math.round(h * 2.5));
    while (y <= limit && !inkAt(x, y)) y++;
    if (y > limit) continue;
    const top = y;
    while (inkAt(x, y)) y++;
    const run = y - top;
    if (run < h * 1.5) continue;
    // Angosto a media altura del trazo: no más de ~2,5 veces el ancho del punto.
    const mid = Math.round(top + run / 2);
    let l = x;
    let r = x;
    while (inkAt(l - 1, mid) && x - l < w * 3) l--;
    while (inkAt(r + 1, mid) && r - x < w * 3) r++;
    if (r - l + 1 <= Math.max(w * 2.5, 3)) return true;
  }
  return false;
}

/**
 * Compara la tinta del original con el vector ya alineado. `mmPerUnit`: mm por
 * unidad del vector (del chequeo de fresa), para las tolerancias en mm.
 */
export function compararMascaras(ink: Mask, doc: EditDoc, placement: Placement, mmPerUnit: number): ComparacionOriginal {
  const vec = rasterizeDoc(doc, placement.x, placement.y, placement.scale, ink.width, ink.height);
  const mmPx = mmPerUnit * placement.scale;
  const px = (mmV: number) => Math.max(1, Math.round(mmV / mmPx));
  const minArea = Math.max(6, MIN_AREA_MM2 / (mmPx * mmPx));
  const rTol = px(TOL_MM);
  const rThick = px(THICK_MM);

  let inter = 0;
  let uni = 0;
  for (let i = 0; i < ink.data.length; i++) {
    inter += ink.data[i] & vec.data[i];
    uni += ink.data[i] | vec.data[i];
  }
  const parecido = uni ? inter / uni : 1;

  const toDoc = (c: { minX: number; minY: number; maxX: number; maxY: number }) => ({
    minX: placement.x + c.minX * placement.scale,
    minY: placement.y + c.minY * placement.scale,
    maxX: placement.x + (c.maxX + 1) * placement.scale,
    maxY: placement.y + (c.maxY + 1) * placement.scale,
  });
  const areaMm2 = (a: number) => a * mmPx * mmPx;
  const diferencias: Diferencia[] = [];

  // 1. Piezas enteras del original que el vector no tiene.
  const inkC = components(ink);
  const vecNear = dilate(vec, 1);
  const cover = new Int32Array(inkC.comps.length);
  for (let i = 0; i < ink.data.length; i++) {
    const l = inkC.labels[i];
    if (l && vecNear.data[i]) cover[l - 1]++;
  }
  const reported = new Set<number>();
  for (const c of inkC.comps) {
    if (c.area < minArea) continue;
    if (cover[c.label - 1] / c.area >= MISSING_COVER) continue;
    reported.add(c.label);
    diferencias.push({
      id: `fp-${c.label}`,
      kind: 'falta-pieza',
      punto: hasStemBelow(ink, vec, c),
      box: toDoc(c),
      areaMm2: areaMm2(c.area),
    });
  }

  // Muchas piezas chicas perdidas son un patrón (manchas, puntillado), no letras:
  // no se llaman «punto de i».
  if (diferencias.length > 4) for (const d of diferencias) d.punto = false;

  // 2. Partes que faltan (o sobran): lo que queda afuera con tolerancia y tiene grosor.
  const blobs = (a: Mask, b: Mask, kind: 'falta-parte' | 'sobra', skip?: Int32Array) => {
    const diff = andNot(a, dilate(b, rTol));
    const thick = erode(diff, rThick);
    const dc = components(diff);
    const survives = new Uint8Array(dc.comps.length);
    const skipped = new Int32Array(dc.comps.length);
    for (let i = 0; i < diff.data.length; i++) {
      const l = dc.labels[i];
      if (!l) continue;
      if (thick.data[i]) survives[l - 1] = 1;
      if (skip && reported.has(skip[i])) skipped[l - 1]++;
    }
    for (const c of dc.comps) {
      if (!survives[c.label - 1] || c.area < minArea) continue;
      if (skipped[c.label - 1] > c.area * 0.5) continue;
      diferencias.push({ id: `${kind === 'sobra' ? 's' : 'fq'}-${c.label}`, kind, punto: false, box: toDoc(c), areaMm2: areaMm2(c.area) });
    }
  };
  blobs(ink, vec, 'falta-parte', inkC.labels);
  blobs(vec, ink, 'sobra');

  const order: Record<DiferenciaKind, number> = { 'falta-pieza': 0, 'falta-parte': 1, sobra: 2 };
  diferencias.sort((p, q) => order[p.kind] - order[q.kind] || Number(q.punto) - Number(p.punto) || q.areaMm2 - p.areaMm2);
  return {
    status: diferencias.length ? 'diferencias' : 'ok',
    placement,
    diferencias: diferencias.slice(0, 40),
    parecido,
  };
}

/** Alinea y compara de una vez. */
export function compararConDoc(ink: Mask, doc: EditDoc, mmPerUnit: number, placement?: Placement | null): ComparacionOriginal {
  const place = placement ?? alignOriginal(ink, doc);
  if (!place) return { status: 'error', error: 'No hay dibujo para comparar.', placement: null, diferencias: [], parecido: 0 };
  if (place.score < MIN_ALIGN_SCORE) return { status: 'sin-alinear', placement: place, diferencias: [], parecido: 0 };
  return compararMascaras(ink, doc, place, mmPerUnit);
}

/** Texto corto de una diferencia. */
export function textoDiferencia(d: Diferencia): string {
  if (d.kind === 'falta-pieza') return d.punto ? 'Falta el punto de una i' : 'Falta una pieza del original';
  if (d.kind === 'falta-parte') return 'Falta una parte del original';
  return 'Hay algo que no está en el original';
}

/** Resumen en una línea: «Falta el punto de 2 i · 1 pieza». */
export function resumenDiferencias(ds: Diferencia[]): string {
  const puntos = ds.filter((d) => d.kind === 'falta-pieza' && d.punto).length;
  const piezas = ds.filter((d) => d.kind === 'falta-pieza' && !d.punto).length;
  const partes = ds.filter((d) => d.kind === 'falta-parte').length;
  const sobras = ds.filter((d) => d.kind === 'sobra').length;
  const out: string[] = [];
  if (puntos) out.push(puntos === 1 ? 'falta el punto de una i' : `falta el punto de ${puntos} i`);
  if (piezas) out.push(`${piezas} pieza${piezas === 1 ? '' : 's'} que falta${piezas === 1 ? '' : 'n'}`);
  if (partes) out.push(`${partes} parte${partes === 1 ? '' : 's'} que falta${partes === 1 ? '' : 'n'}`);
  if (sobras) out.push(`${sobras} cosa${sobras === 1 ? '' : 's'} que no está${sobras === 1 ? '' : 'n'} en el original`);
  const s = out.join(' · ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
