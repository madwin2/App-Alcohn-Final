import { useEffect, useState } from 'react';
import { fetchSvgText, isSvgUrl } from '@/lib/fresa/useFresaReport';
import { parseSvgShapes } from '@/lib/fresa/svgShapes';
import type { StampPlacement } from '@/lib/programas/preparation';

export interface Artwork { uri: string; landscape: boolean }
const cache = new Map<string, Promise<Artwork>>();
function artwork(key: string, inline?: string): Promise<Artwork> {
  const hit = cache.get(key);
  if (hit) return hit;
  const result = (inline ? Promise.resolve(inline) : fetchSvgText(key)).then((svg) => {
    const parsed = parseSvgShapes(svg);
    const points = parsed.shapes.filter((s) => s.fill !== 'none' || s.stroke !== 'none').flatMap((s) => s.rings.flat());
    if (!points.length) throw new Error('Sin geometría.');
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    points.forEach((p) => { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); });
    const w = right - left, h = bottom - top;
    if (!(w > 0 && h > 0)) throw new Error('Medida inválida.');
    const root = parsed.doc.documentElement;
    root.setAttribute('viewBox', `${left} ${top} ${w} ${h}`); root.setAttribute('width', String(w)); root.setAttribute('height', String(h));
    return { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`, landscape: w > h };
  });
  cache.set(key, result); result.catch(() => cache.delete(key));
  if (cache.size > 150) cache.delete(cache.keys().next().value as string);
  return result;
}
export function StampArtwork({ stamp, observedSvg }: { stamp: StampPlacement; observedSvg?: string }) {
  const [image, setImage] = useState<Artwork | null>(null);
  const inline = stamp.vectorSvg ?? observedSvg;
  const key = inline ?? stamp.sourceUrl;
  useEffect(() => {
    setImage(null); let alive = true;
    if (inline || isSvgUrl(key)) void artwork(key, inline).then((a) => { if (alive) setImage(a); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key, inline]);
  if (!image) return null;
  const machined = stamp.vectorSvg ? stamp.vectorAlreadyMachined : !!observedSvg;
  const rotate = !machined && image.landscape;
  const w = rotate ? stamp.heightMm : stamp.widthMm;
  const h = rotate ? stamp.widthMm : stamp.heightMm;
  return <g transform={`translate(${stamp.centerX},${-stamp.topY + stamp.heightMm / 2}) rotate(${rotate ? -90 : 0}) scale(${machined ? 1 : -1},1)`} style={{ pointerEvents: 'none' }}>
    <image href={image.uri} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" />
  </g>;
}

/** Dibujo recortado a su geometría, para mostrarlo fuera del soporte SVG. */
export function useArtwork(source: string | undefined, inline?: string): Artwork | null {
  const [image, setImage] = useState<Artwork | null>(null);
  const key = inline ?? source ?? '';
  useEffect(() => {
    setImage(null); let alive = true;
    if (inline || isSvgUrl(key)) void artwork(key, inline).then((a) => { if (alive) setImage(a); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key, inline]);
  return image;
}
