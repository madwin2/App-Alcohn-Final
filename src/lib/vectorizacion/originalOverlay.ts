/**
 * Parte de navegador de la comparación con el original: bajar la imagen,
 * sacar su máscara de tinta y armar la capa coloreada que se pone debajo del
 * vector en el editor. La lógica está en `comparacionOriginal.ts`.
 */
import { useEffect, useState } from 'react';
import { buildEditDoc } from '@/lib/fresa/editDoc';
import { compararConDoc, inkMaskFromRGBA, type ComparacionOriginal, type Mask } from './comparacionOriginal';

/** URL (http o data:) o una función que baja el archivo (storage privado). */
export type OriginalSource = string | { key: string; load: () => Promise<Blob> };

export interface OriginalCargado {
  /** Máscara de análisis (lado mayor ≤ 900 px). */
  ink: Mask;
  /** PNG con la tinta en color sobre transparente (misma proporción que `ink`). */
  overlayUrl: string;
}

/** Color de la capa del original en el editor (no se confunde con zonas ni selección). */
export const ORIGINAL_COLOR = '#d946ef';

const ANALYSIS_SIDE = 900;
const OVERLAY_SIDE = 1600;

const sourceKey = (src: OriginalSource) => (typeof src === 'string' ? src : src.key);

const cache = new Map<string, Promise<OriginalCargado>>();

async function blobOf(src: OriginalSource): Promise<Blob> {
  if (typeof src !== 'string') return src.load();
  const res = await fetch(src);
  if (!res.ok) throw new Error(`No se pudo bajar el original (${res.status})`);
  return res.blob();
}

function drawScaled(bitmap: ImageBitmap, maxSide: number) {
  const f = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * f));
  const h = Math.max(1, Math.round(bitmap.height * f));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo leer el original');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

async function load(src: OriginalSource): Promise<OriginalCargado> {
  const bitmap = await createImageBitmap(await blobOf(src));
  try {
    const a = drawScaled(bitmap, ANALYSIS_SIDE);
    const { mask, threshold, inverted } = inkMaskFromRGBA(a.ctx.getImageData(0, 0, a.w, a.h).data, a.w, a.h);

    // Capa: el mismo umbral, a más resolución, pintada en color.
    const o = drawScaled(bitmap, OVERLAY_SIDE);
    const img = o.ctx.getImageData(0, 0, o.w, o.h);
    const d = img.data;
    const r = parseInt(ORIGINAL_COLOR.slice(1, 3), 16);
    const g = parseInt(ORIGINAL_COLOR.slice(3, 5), 16);
    const b = parseInt(ORIGINAL_COLOR.slice(5, 7), 16);
    for (let i = 0; i < d.length; i += 4) {
      const al = d[i + 3] / 255;
      const l = Math.round((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * al + 255 * (1 - al));
      const isInk = inverted ? l > threshold : l <= threshold;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = isInk ? 255 : 0;
    }
    o.ctx.putImageData(img, 0, 0);
    return { ink: mask, overlayUrl: o.canvas.toDataURL('image/png') };
  } finally {
    bitmap.close?.();
  }
}

/** Carga (una vez por fuente) la máscara y la capa del original. */
export function cargarOriginal(src: OriginalSource): Promise<OriginalCargado> {
  const key = sourceKey(src);
  let p = cache.get(key);
  if (!p) {
    p = load(src);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    // Pocas a la vez: las data: URL de revisión pesan.
    if (cache.size > 40) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const results = new Map<string, Promise<ComparacionOriginal>>();
let queue: Promise<unknown> = Promise.resolve();

/**
 * Compara un SVG con su original (en segundo plano, de a uno, cacheado).
 * `mmPerUnit` sale del chequeo de fresa del mismo SVG.
 */
export function compararConOriginal(svgText: string, src: OriginalSource, mmPerUnit: number): Promise<ComparacionOriginal> {
  const key = `${hashText(svgText)}|${hashText(sourceKey(src))}|${mmPerUnit.toPrecision(6)}`;
  let p = results.get(key);
  if (!p) {
    const run = async (): Promise<ComparacionOriginal> => {
      try {
        const original = await cargarOriginal(src);
        await new Promise((r) => setTimeout(r, 0));
        const built = buildEditDoc(svgText);
        if (!built.ok) return { status: 'error', error: built.error, placement: null, diferencias: [], parecido: 0 };
        return compararConDoc(original.ink, built.doc, mmPerUnit);
      } catch (e) {
        return { status: 'error', error: e instanceof Error ? e.message : 'No se pudo comparar.', placement: null, diferencias: [], parecido: 0 };
      }
    };
    p = queue.then(run, run);
    queue = p;
    results.set(key, p);
    if (results.size > 200) results.delete(results.keys().next().value as string);
  }
  return p;
}

/** Comparación de un SVG con su original (null = comparando o sin datos). */
export function useComparacionOriginal(
  svgText: string | null,
  src: OriginalSource | null | undefined,
  mmPerUnit: number | null | undefined,
): ComparacionOriginal | null {
  const [state, setState] = useState<{ key: string; result: ComparacionOriginal } | null>(null);
  const key = svgText && src && mmPerUnit ? `${hashText(svgText)}|${hashText(sourceKey(src))}|${mmPerUnit}` : null;
  useEffect(() => {
    if (!key || !svgText || !src || !mmPerUnit) return;
    let alive = true;
    void compararConOriginal(svgText, src, mmPerUnit).then((result) => alive && setState({ key, result }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state && state.key === key ? state.result : null;
}
