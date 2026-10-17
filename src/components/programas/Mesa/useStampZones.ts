import { useEffect, useState } from 'react';
import { chequearSvg, type FresaReport } from '@/lib/fresa/chequeoFresa';
import { fetchSvgText } from '@/lib/fresa/useFresaReport';
import { parseSvgShapes } from '@/lib/fresa/svgShapes';
import { buildBlackRegion, type FresaZone } from '@/lib/fresa/analyze';
import { bounds, UM } from '@/lib/fresa/geometry';
import type { StampPlacement } from '@/lib/programas/preparation';

/** Zonas del chequeo de fresa de un sello, en unidades del SVG, más las cajas para ubicarlas. */
export interface StampZones {
  zones: FresaZone[];
  /** mm por unidad del SVG con que se analizó (las zonas vienen en mm). */
  mmPerUnit: number;
  /** Dónde cae el SVG completo (lo que dibuja la vista 2D), en unidades. */
  imageBox: FresaReport['imageBox'];
  /** Caja del relieve (lo negro), en unidades: la que usa la simulación 3D. */
  blackBox: { x: number; y: number; w: number; h: number };
  counts: FresaReport['counts'];
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
  return {
    zones: report.check?.zones ?? [], mmPerUnit: report.mmPerUnit, imageBox: report.imageBox, counts: report.counts, status: report.status,
    blackBox: { x: box.minX / UM, y: box.minY / UM, w: (box.maxX - box.minX) / UM, h: (box.maxY - box.minY) / UM },
  };
}

/** Chequeo de fresa para dibujar sus zonas sobre la mesa. Solo calcula si `enabled`. */
export function useStampZones(stamp: StampPlacement, enabled: boolean): StampZones | null {
  const key = JSON.stringify([stamp.vectorSvg ?? stamp.sourceUrl, stamp.widthMm, stamp.heightMm, stamp.recipe]);
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
