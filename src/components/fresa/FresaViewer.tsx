import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import type { FresaGroup } from '@/lib/fresa/engine';
import type { ZoneSeverity } from '@/lib/fresa/analyze';
import { SEVERITY_FILL } from '@/lib/fresa/textos';
import { cn } from '@/lib/utils/cn';

export type FresaViewMode = 'original' | 'corregido' | 'diferencias';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  svgText: string;
  /** Reporte cuyas zonas se dibujan (el original o el de la corrección). */
  report: FresaReport;
  /** SVG corregido (si hay una corrección en vista previa). */
  correctedSvg?: string | null;
  /** Cuando cambia, se vuelve a encuadrar todo el diseño. */
  fitKey: string;
  mode: FresaViewMode;
  visibleSeverities: Set<ZoneSeverity>;
  selectedGroupId: string | null;
  hoveredGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
  /** Cambia cuando hay que encuadrar el grupo elegido. */
  focusNonce: number;
  className?: string;
}

const svgDataUrl = (text: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

function zonePath(rings: { x: number; y: number }[][]): string {
  return rings
    .map((r) => `M${r.map((p) => `${p.x.toFixed(4)} ${p.y.toFixed(4)}`).join('L')}Z`)
    .join('');
}

/** Encaja una caja (unidades del SVG) en el aspecto del contenedor, centrada. */
function fitBox(b: Box, aspect: number): Box {
  if (!(aspect > 0)) return b;
  if (b.w / b.h > aspect) {
    const h = b.w / aspect;
    return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h };
  }
  const w = b.h * aspect;
  return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h };
}

/**
 * Visor del chequeo: el SVG real de fondo y las zonas donde no llega la fresa
 * encima, con zoom (rueda / botones) y paneo (arrastrar).
 */
export function FresaViewer({
  svgText,
  report,
  correctedSvg,
  fitKey,
  mode,
  visibleSeverities,
  selectedGroupId,
  hoveredGroupId,
  onSelectGroup,
  focusNonce,
  className,
}: Props) {
  const filterId = useId().replace(/:/g, '');
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1.4);
  const [view, setView] = useState<Box>(report.viewBox);
  const drag = useRef<{ x: number; y: number; view: Box; moved: boolean } | null>(null);

  const original = useMemo(() => svgDataUrl(svgText), [svgText]);
  const corrected = useMemo(() => (correctedSvg ? svgDataUrl(correctedSvg) : null), [correctedSvg]);
  const k = report.mmPerUnit;
  const minView = 1.2 / k; // no acercar más que ~1,2 mm de ancho

  // Aspecto del contenedor (para que el encuadre no deforme).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseBox = report.viewBox;
  const fitAll = useCallback(() => setView(fitBox(baseBox, aspect)), [baseBox, aspect]);

  useEffect(() => {
    fitAll();
    // Re-encuadrar solo al abrir otro diseño o al cambiar el tamaño del visor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, aspect]);

  const groups = useMemo(
    () => (report.check?.groups ?? []).filter((g) => visibleSeverities.has(g.severity)),
    [report, visibleSeverities],
  );
  const zonesById = useMemo(() => new Map((report.check?.zones ?? []).map((z) => [z.id, z])), [report]);

  // Encuadrar el grupo elegido.
  useEffect(() => {
    if (!focusNonce || !selectedGroupId) return;
    const g = (report.check?.groups ?? []).find((x) => x.id === selectedGroupId);
    if (!g) return;
    const padMm = 1.2;
    const b: Box = {
      x: (g.bounds.minX - padMm) / k,
      y: (g.bounds.minY - padMm) / k,
      w: (g.bounds.maxX - g.bounds.minX + 2 * padMm) / k,
      h: (g.bounds.maxY - g.bounds.minY + 2 * padMm) / k,
    };
    const minW = 4 / k;
    if (b.w < minW) {
      b.x -= (minW - b.w) / 2;
      b.w = minW;
    }
    if (b.h < minW) {
      b.y -= (minW - b.h) / 2;
      b.h = minW;
    }
    setView(fitBox(b, aspect));
    // Solo cuando se pide encuadrar (focusNonce), no en cada cambio de aspecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const toUser = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const w = Math.min(report.viewBox.w * 4, Math.max(minView, v.w * factor));
      const f = w / v.w;
      const px = cx ?? v.x + v.w / 2;
      const py = cy ?? v.y + v.h / 2;
      return { x: px - (px - v.x) * f, y: py - (py - v.y) * f, w, h: v.h * f };
    });
  };

  // Rueda: listener nativo no pasivo para poder evitar el scroll de la página.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toUser(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, p?.x, p?.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const pxPerUnit = (hostRef.current?.getBoundingClientRect().width ?? 600) / view.w;
  const strokeW = 1.6 / pxPerUnit; // ~1,6 px en pantalla
  const showZones = mode !== 'diferencias';

  const renderGroupFrame = (g: FresaGroup, idx: number) => {
    const sel = g.id === selectedGroupId;
    const hov = g.id === hoveredGroupId;
    const padMm = 0.35;
    const x = (g.bounds.minX - padMm) / k;
    const y = (g.bounds.minY - padMm) / k;
    const w = (g.bounds.maxX - g.bounds.minX + 2 * padMm) / k;
    const h = (g.bounds.maxY - g.bounds.minY + 2 * padMm) / k;
    const color = SEVERITY_FILL[g.severity];
    const label = 11 / pxPerUnit;
    return (
      <g
        key={g.id}
        className="cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onSelectGroup(g.id);
        }}
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={Math.min(w, h) * 0.2}
          fill={sel || hov ? `${color}22` : 'transparent'}
          stroke={color}
          strokeWidth={sel ? strokeW * 1.8 : strokeW}
          strokeDasharray={sel ? undefined : `${strokeW * 3} ${strokeW * 2}`}
        />
        <g transform={`translate(${x + w} ${y})`}>
          <circle r={label * 0.85} fill={color} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={label}
            fontWeight={700}
            fill="#fff"
            style={{ pointerEvents: 'none' }}
          >
            {idx + 1}
          </text>
        </g>
      </g>
    );
  };

  // Numeración estable: la misma del listado.
  const groupIndex = new Map((report.check?.groups ?? []).map((g, i) => [g.id, i]));

  return (
    <div
      ref={hostRef}
      className={cn(
        'relative h-full min-h-[320px] w-full touch-none select-none overflow-hidden rounded-md border bg-white',
        'bg-[length:20px_20px] bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)]',
        className,
      )}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        const ppu = (hostRef.current?.getBoundingClientRect().width ?? 600) / d.view.w;
        setView({ ...d.view, x: d.view.x - dx / ppu, y: d.view.y - dy / ppu });
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) onSelectGroup(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Pinta de celeste todo lo que tenga tinta: para ver qué se sacó. */}
          <filter id={`cyan-${filterId}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.75  0 0 0 0 0.93  0 0 0 1 0" />
          </filter>
        </defs>
        {mode === 'diferencias' && corrected ? (
          <>
            <image
              href={original}
              x={report.imageBox.x}
              y={report.imageBox.y}
              width={report.imageBox.w}
              height={report.imageBox.h}
              preserveAspectRatio="none"
              filter={`url(#cyan-${filterId})`}
            />
            <image
              href={corrected}
              x={report.imageBox.x}
              y={report.imageBox.y}
              width={report.imageBox.w}
              height={report.imageBox.h}
              preserveAspectRatio="none"
            />
          </>
        ) : (
          <image
            href={mode === 'corregido' && corrected ? corrected : original}
            x={report.imageBox.x}
            y={report.imageBox.y}
            width={report.imageBox.w}
            height={report.imageBox.h}
            preserveAspectRatio="none"
          />
        )}

        {showZones ? (
          <g transform={`scale(${1 / k})`} style={{ pointerEvents: 'none' }}>
            {groups.flatMap((g) =>
              g.zoneIds.map((zid) => {
                const z = zonesById.get(zid);
                if (!z) return null;
                return (
                  <path
                    key={`${g.id}-${zid}`}
                    d={zonePath(z.rings)}
                    fill={SEVERITY_FILL[z.severity]}
                    fillOpacity={g.id === selectedGroupId || g.id === hoveredGroupId ? 0.95 : 0.78}
                    fillRule="nonzero"
                  />
                );
              }),
            )}
          </g>
        ) : null}
        {groups.map((g) => renderGroupFrame(g, groupIndex.get(g.id) ?? 0))}
      </svg>

      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md border bg-background/90 p-1 text-xs shadow-sm">
        <button
          type="button"
          className="rounded px-2 py-1 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoomAt(1 / 1.5)}
          aria-label="Acercar"
        >
          +
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoomAt(1.5)}
          aria-label="Alejar"
        >
          −
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={fitAll}
        >
          Ver todo
        </button>
        <span className="px-1 tabular-nums text-muted-foreground">
          {(view.w * k).toFixed(view.w * k < 10 ? 1 : 0).replace('.', ',')} mm de ancho
        </span>
      </div>
    </div>
  );
}
