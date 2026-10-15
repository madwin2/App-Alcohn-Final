/**
 * Simulación del relieve del V-carve, para verlo "en 3D" en el editor.
 *
 * Modelo: la fresa cónica pasa por el blanco bajando lo que le deja el ancho.
 * En un punto a distancia δ del negro más cercano, el flanco de la fresa
 * llega a una profundidad δ / tan(flanco); nunca más que la profundidad final
 * del V-carve. El negro queda arriba (altura 0). Es la misma idea que el mapa
 * de profundidad del análisis, pero continua, para dibujarla con luz.
 *
 * Se trabaja sobre una grilla (raster): primero se pinta el negro, después se
 * calcula la distancia de cada celda blanca al negro (transformada de
 * distancia euclídea exacta, Felzenszwalb y Huttenlocher) y con eso la
 * profundidad. El sombreado es una luz rasante (hillshade).
 */
import type { FresaProfile } from './config';

const INF = 1e20;

/** Transformada de distancia 1D (cuadrada) de Felzenszwalb sobre `f` (in place en `d`). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/**
 * Distancia (en celdas) de cada celda a la celda negra más cercana. `black[i]`
 * true = negro (distancia 0). Devuelve distancias euclídeas (no cuadradas).
 */
export function distanceToBlack(black: Uint8Array, w: number, h: number): Float32Array {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = black[i] ? 0 : INF;
  // Columnas.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  // Filas.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

/**
 * Profundidad del V-carve (mm) en cada celda: 0 en el negro, δ/tan(flanco)
 * en el blanco, con tope en la profundidad final.
 */
export function vcarveDepth(dist: Float32Array, cellMm: number, profile: FresaProfile): Float32Array {
  const t = Math.tan((profile.halfAngleDeg * Math.PI) / 180);
  const out = new Float32Array(dist.length);
  for (let i = 0; i < dist.length; i++) {
    // La distancia se mide al centro de la celda negra: medio celda de margen.
    const delta = Math.max(0, dist[i] - 0.5) * cellMm;
    out[i] = dist[i] === 0 ? 0 : Math.min(profile.finalDepthMm, delta / t);
  }
  return out;
}

/** Colores del relieve: bronce arriba, más oscuro cuanto más hondo. */
const TOP = [214, 160, 96];
const BOTTOM = [92, 58, 28];

/**
 * Imagen RGBA del relieve con luz rasante desde arriba a la izquierda.
 * `depth` en mm; `cellMm` tamaño de celda; `exaggeration` estira el relieve
 * (las profundidades son de décimas de mm sobre decenas de mm de ancho).
 */
export function shadeRelief(
  depth: Float32Array,
  w: number,
  h: number,
  cellMm: number,
  maxDepthMm: number,
  exaggeration = 3,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  // Luz: azimut 315° (arriba a la izquierda), altura 40°.
  const az = (315 * Math.PI) / 180;
  const alt = (40 * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.sin(az);
  const ly = -Math.cos(alt) * Math.cos(az);
  const lz = Math.sin(alt);
  const at = (x: number, y: number) => -depth[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * cellMm)) * exaggeration;
      const dzdy = ((at(x, y + 1) - at(x, y - 1)) / (2 * cellMm)) * exaggeration;
      // Normal de la superficie z = -profundidad.
      const nx = -dzdx;
      const ny = -dzdy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const lambert = Math.max(0, (nx * lx + ny * ly + nz * lz) / len);
      const shade = 0.35 + 0.75 * lambert;
      const t = maxDepthMm > 0 ? Math.min(1, depth[i] / maxDepthMm) : 0;
      for (let c = 0; c < 3; c++) {
        const base = TOP[c] + (BOTTOM[c] - TOP[c]) * t;
        out[i * 4 + c] = Math.min(255, base * shade);
      }
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

export interface ReliefImage {
  /** PNG (data URL) para dibujar con <image>. */
  href: string;
  /** Dónde va, en unidades del dibujo. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Relieve de un dibujo (paths `d` en unidades del viewBox con su regla de
 * relleno), en la caja `box` (unidades). Usa un canvas del navegador para
 * pintar el negro. `maxCells`: lado largo de la grilla.
 */
export function renderRelief(
  paths: Array<{ d: string; fillRule: 'nonzero' | 'evenodd' }>,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  mmPerUnit: number,
  profile: FresaProfile,
  maxCells = 640,
): ReliefImage | null {
  if (typeof document === 'undefined') return null;
  const bw = box.maxX - box.minX;
  const bh = box.maxY - box.minY;
  if (!(bw > 0 && bh > 0)) return null;
  const scale = maxCells / Math.max(bw, bh); // celdas por unidad
  const w = Math.max(2, Math.round(bw * scale));
  const h = Math.max(2, Math.round(bh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, -box.minX * scale, -box.minY * scale);
  ctx.fillStyle = '#000';
  for (const p of paths) ctx.fill(new Path2D(p.d), p.fillRule);
  const img = ctx.getImageData(0, 0, w, h);
  const black = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) black[i] = img.data[i * 4 + 3] > 127 ? 1 : 0;
  const cellMm = mmPerUnit / scale;
  const depth = vcarveDepth(distanceToBlack(black, w, h), cellMm, profile);
  const rgba = shadeRelief(depth, w, h, cellMm, profile.finalDepthMm);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const out = ctx.createImageData(w, h);
  out.data.set(rgba);
  ctx.putImageData(out, 0, 0);
  return { href: canvas.toDataURL('image/png'), x: box.minX, y: box.minY, w: bw, h: bh };
}
