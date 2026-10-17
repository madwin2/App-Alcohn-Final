import { useEffect, useState } from 'react';
import { fetchSvgText } from '@/lib/fresa/useFresaReport';
import { parseSvgShapes } from '@/lib/fresa/svgShapes';
import { buildBlackRegion } from '@/lib/fresa/analyze';
import { bounds, UM } from '@/lib/fresa/geometry';
import { buildReliefMesh, FACE_OPS, faceDepth, reliefTools } from '@/lib/programas/mesaRelief';
import { renderMachiningMesh, type ReliefRender } from '@/lib/programas/mesaReliefRender';
import { preparationFingerprint, type StampPlacement } from '@/lib/programas/preparation';

export interface StampRelief extends ReliefRender { note: string }
const cache = new Map<string, Promise<StampRelief>>();

/** Rasteriza la geometría final respetando pintura blanca, trazos y orientación de fabricación. */
/** `pad`: margen (mm) alrededor del recuadro para ver la isla y el desbaste exterior. */
export interface ReliefPad { x: number; top: number; bottom: number }
function compute(svg: string, stamp: StampPlacement, pad: ReliefPad): StampRelief {
  const black = buildBlackRegion(parseSvgShapes(svg).shapes, 1);
  const box = bounds(black);
  if (!box) throw new Error('Sin geometría para simular.');
  const bw = (box.maxX - box.minX) / UM, bh = (box.maxY - box.minY) / UM;
  if (!(bw > 0 && bh > 0)) throw new Error('Medida inválida.');
  const path = new Path2D(black.map((ring) => `M${ring.map((p) => `${p.x / UM} ${p.y / UM}`).join('L')}Z`).join(''));
  const alreadyMachined = !!stamp.vectorSvg && !!stamp.vectorAlreadyMachined;
  const rotate = !alreadyMachined && bw > bh;
  const cells = Math.min(520, Math.max(160, Math.ceil(stamp.heightMm / 0.08)));
  const cellMm = stamp.heightMm / cells;
  const px = Math.round(pad.x / cellMm), pt = Math.round(pad.top / cellMm), pb = Math.round(pad.bottom / cellMm);
  const w = Math.max(3, Math.round(stamp.widthMm / cellMm) + 1) + px * 2, h = cells + 1 + pt + pb;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo leer el dibujo.');
  ctx.translate(w / 2, pt + (h - pt - pb) / 2);
  if (!alreadyMachined) ctx.scale(-1, 1);
  if (rotate) ctx.rotate(-Math.PI / 2);
  const iw = w - px * 2, ih = h - pt - pb;
  ctx.scale((rotate ? ih : iw) / bw, (rotate ? iw : ih) / bh);
  ctx.translate(-(box.minX + box.maxX) / (2 * UM), -(box.minY + box.maxY) / (2 * UM));
  ctx.fill(path, 'nonzero');
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] > 127 ? 1 : 0;
  const { tools, note } = reliefTools(stamp, preparationFingerprint(svg));
  const depth = faceDepth(mask, w, h, cellMm, tools);
  const recipeDepth = Math.max(...tools.filter((t) => t.id !== 'repaso').map((t) => t.depthMm));
  const mesh = buildReliefMesh(depth, w, h, (w - 1) * cellMm, (h - 1) * cellMm, FACE_OPS.exteriorDepthMm, [recipeDepth]);
  const render = renderMachiningMesh(mesh);
  // El origen de la malla está corrido por el margen: se vuelve al recuadro del sello.
  return { ...render, leftMm: render.leftMm - px * cellMm, topMm: render.topMm - pt * cellMm, note };
}

export function useStampRelief(stamp: StampPlacement, enabled: boolean, pad: ReliefPad = { x: 0, top: 0, bottom: 0 }): { relief: StampRelief | null; error: boolean } {
  const [state, setState] = useState<{ key: string; relief: StampRelief | null; error: boolean }>({ key: '', relief: null, error: false });
  // Dos SVG del mismo largo y prefijo pueden tener geometrías diferentes.
  const source = stamp.vectorSvg ?? stamp.sourceUrl;
  const key = JSON.stringify([source, stamp.widthMm, stamp.heightMm, stamp.recipe, !!stamp.vectorAlreadyMachined, stamp.fine, pad.x, pad.top, pad.bottom]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let promise = cache.get(key);
    if (!promise) {
      promise = (stamp.vectorSvg ? Promise.resolve(stamp.vectorSvg) : fetchSvgText(stamp.sourceUrl))
        .then((svg) => new Promise<StampRelief>((resolve, reject) => {
          window.setTimeout(() => { try { resolve(compute(svg, stamp, pad)); } catch (e) { reject(e); } }, 0);
        }));
      cache.set(key, promise);
      void promise.catch(() => cache.delete(key));
      if (cache.size > 80) cache.delete(cache.keys().next().value as string);
    }
    void promise.then((relief) => { if (alive) setState({ key, relief, error: false }); }, () => { if (alive) setState({ key, relief: null, error: true }); });
    return () => { alive = false; };
  // El key contiene todos los datos usados para la geometría y su presentación.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return enabled && state.key === key ? state : { relief: null, error: false };
}
