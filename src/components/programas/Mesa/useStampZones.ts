import { useEffect, useState } from 'react';
import { chequearSvg, type FresaReport } from '@/lib/fresa/chequeoFresa';
import { fetchSvgText } from '@/lib/fresa/useFresaReport';
import { parseSvgShapes } from '@/lib/fresa/svgShapes';
import { buildBlackRegion, type ZoneSeverity } from '@/lib/fresa/analyze';
import type { Pt } from '@/lib/fresa/pathData';
import { bounds, UM } from '@/lib/fresa/geometry';
import type { StampPlacement } from '@/lib/programas/preparation';

/** `repaso`: lo que la 0,6 deja y saca la 0,2. El resto, lo que sigue sin resolverse. */
export type ZoneTone = ZoneSeverity | 'repaso';
export interface DisplayZone { id: string; rings: Pt[][]; center: { x: number; y: number }; severity: ZoneTone }

/**
 * Zonas de fresa de un sello para la mesa (mm), más las cajas para ubicarlas.
 * Con repaso: lo que saca la 0,2 (verde agua) y lo que ni la 0,2 resuelve. Sin
 * repaso: todo lo que deja la 0,6.
 */
export interface StampZones {
  zones: DisplayZone[];
  /** mm por unidad del SVG con que se analizó (las zonas vienen en mm). */
  mmPerUnit: number;
  /** Dónde cae el SVG completo (lo que dibuja la vista 2D), en unidades. */
  imageBox: FresaReport['imageBox'];
  /** Caja del relieve (lo negro), en unidades: la que usa la simulación 3D. */
  blackBox: { x: number; y: number; w: number; h: number };
  /** alta/media: lo que queda sin resolver; repaso: lugares donde trabaja la 0,2 (0 = la 0,6 alcanza). */
  counts: Record<ZoneTone, number>;
  status: FresaReport['status'];
}

const cache = new Map<string, Promise<StampZones>>();

async function compute(stamp: StampPlacement): Promise<StampZones> {
  const svg = stamp.vectorSvg ?? await fetchSvgText(stamp.sourceUrl);
  // Mismo pedido que la ventana de la fresa: el chequeo queda compartido en su caché.
  const report = await chequearSvg(svg, {
    mode: 'fabricacion', longSideMm: Math.max(stamp.widthMm, stamp.heightMm), stampType: stamp.recipe, alimento: stamp.recipe === 'ALIMENTO',
  });
  const box = bounds(buildBlackRegion(parseSvgShapes(svg).shapes, 1));
  if (!box) throw new Error('Sin geometría.');
  const p = report.passes;
  const show = (z: { id: string; rings: Pt[][]; center: { x: number; y: number } }, severity: ZoneTone): DisplayZone => ({ id: z.id, rings: z.rings, center: z.center, severity });
  // Solo lo que sigue siendo un problema (rojo/ámbar). Lo que saca la 0,2 no se
  // dibuja: eran manchas por todos lados que no decían nada (pedido del usuario).
  const serious = (z: { severity: ZoneSeverity }) => z.severity !== 'baja';
  const source = p?.primary ? (stamp.fine?.mode === 'none' ? p.primary.zones : p.fine.zones) : (report.check?.zones ?? []);
  const zones: DisplayZone[] = source.filter(serious).map((z) => show(z, z.severity));
  const counts: Record<ZoneTone, number> = { alta: 0, media: 0, baja: 0, repaso: p?.repaso.zones.length ?? 0 };
  zones.forEach((z) => { counts[z.severity] += 1; });
  return {
    zones, mmPerUnit: report.mmPerUnit, imageBox: report.imageBox, counts, status: report.status,
    blackBox: { x: box.minX / UM, y: box.minY / UM, w: (box.maxX - box.minX) / UM, h: (box.maxY - box.minY) / UM },
  };
}

/** Chequeo de fresa para dibujar sus zonas sobre la mesa. Solo calcula si `enabled`. */
export function useStampZones(stamp: StampPlacement, enabled: boolean): StampZones | null {
  const key = JSON.stringify([stamp.vectorSvg ?? stamp.sourceUrl, stamp.widthMm, stamp.heightMm, stamp.recipe, stamp.fine?.mode === 'none']);
  const [state, setState] = useState<{ key: string; zones: StampZones | null }>({ key: '', zones: null });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let p = cache.get(key);
    if (!p) {
      p = compute(stamp);
      cache.set(key, p);
      p.catch(() => cache.delete(key));
      if (cache.size > 120) cache.delete(cache.keys().next().value as string);
    }
    p.then((zones) => { if (alive) setState({ key, zones }); }, () => { if (alive) setState({ key, zones: null }); });
    return () => { alive = false; };
  // El key contiene todo lo que usa el chequeo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return enabled && state.key === key ? state.zones : null;
}
