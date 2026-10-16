import { useRef, useState } from 'react';
import { buildExecutionPlan, validatePreparation, type PreparationDocument, type StampPlacement } from '@/lib/programas/preparation';
import { StampArtwork } from './StampArtwork';

export function PreparationBoard({ document: doc, selectedId, onSelect, onMove, readOnly = false, observed = {}, showOperations = false }: {
  document: PreparationDocument; selectedId: string | null;
  onSelect: (id: string) => void; onMove: (id: string, columnId: string, topY: number) => void; readOnly?: boolean; observed?: Record<string, string>; showOperations?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; offset: number; column: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; centerX: number; topY: number } | null>(null);
  const execution = showOperations ? buildExecutionPlan(doc) : null;
  const invalid = new Set(validatePreparation(doc).filter((i) => ['WIDTH','LENGTH','SEPARATION','TOOL_ENVELOPE','MATERIAL'].includes(i.code)).map((i) => i.instanceId));
  const left = Math.min(...doc.columns.map((c) => c.centerX - c.toolEnvelopeMm / 2)) - 14;
  const right = Math.max(...doc.columns.map((c) => c.centerX + c.toolEnvelopeMm / 2)) + 14;
  const bottom = Math.max(...doc.columns.map((c) => -c.bottomY)) + 20;
  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  };
  const pointerDown = (event: React.PointerEvent<SVGGElement>, s: StampPlacement) => {
    onSelect(s.instanceId);
    if (readOnly || s.pinned) return;
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    drag.current = { id: s.instanceId, offset: p.y + s.topY, column: s.columnId };
    svg.current?.setPointerCapture(event.pointerId);
  };
  return <svg ref={svg} role="img" aria-label="Soporte y ubicación de los sellos en milímetros" viewBox={`${left} -22 ${right - left} ${bottom + 22}`}
    className="h-[450px] min-h-[320px] w-full flex-none touch-none rounded-lg border bg-muted/20 lg:h-full lg:flex-1"
    onPointerMove={(event) => {
      const p = point(event), current = drag.current;
      if (!p || !current) return;
      const col = [...doc.columns].sort((a, b) => Math.abs(a.centerX - p.x) - Math.abs(b.centerX - p.x))[0];
      setPreview({ id: current.id, centerX: col.centerX, topY: -p.y + current.offset });
    }}
    onPointerUp={(event) => {
      const p = point(event), current = drag.current;
      drag.current = null;
      setPreview(null);
      if (!p || !current) return;
      const col = [...doc.columns].sort((a, b) => Math.abs(a.centerX - p.x) - Math.abs(b.centerX - p.x))[0];
      onMove(current.id, col.id, Math.round((-p.y + current.offset) * 10) / 10);
    }} onPointerCancel={() => { drag.current = null; setPreview(null); }}>
    <title>Soporte de la máquina {doc.machine}. Elegí un sello o arrastralo a otra planchuela.</title>
    {doc.columns.map((c) => <g key={c.id}>
      <rect x={c.centerX - c.toolEnvelopeMm / 2} y={-c.topY} width={c.toolEnvelopeMm} height={c.topY - c.bottomY} fill="currentColor" opacity="0.06" />
      <rect x={c.centerX - c.usableMm / 2} y={-c.topY} width={c.usableMm} height={c.topY - c.bottomY} fill={c.available ? '#b88a4b' : '#a1a1aa'} opacity={c.available ? 0.4 : 0.15} stroke="currentColor" strokeWidth="0.3" />
      <text x={c.centerX} y="-8" textAnchor="middle" fill="currentColor" fontSize="6">{c.nominalMm} mm</text>
      <text x={c.centerX} y={-c.bottomY + 10} textAnchor="middle" fill="currentColor" fontSize="5">{c.available ? `${Math.round(c.topY - c.bottomY)} mm útiles` : 'Sin material'}</text>
    </g>)}
    {doc.stamps.filter((s) => !s.excluded).map((original) => { const s = preview?.id === original.instanceId ? { ...original, centerX: preview.centerX, topY: preview.topY } : original; return <g key={s.instanceId} onPointerDown={(e) => pointerDown(e, s)} className={readOnly ? 'cursor-default' : 'cursor-grab'}>
      <rect x={s.centerX - s.widthMm / 2} y={-s.topY} width={s.widthMm} height={s.heightMm} rx="0.7" fill={invalid.has(s.instanceId) ? '#fecaca' : selectedId === s.instanceId ? '#2563eb' : '#f7e7c5'} fillOpacity="0.65" stroke={invalid.has(s.instanceId) ? '#dc2626' : selectedId === s.instanceId ? '#2563eb' : '#74542d'} strokeWidth={selectedId === s.instanceId || invalid.has(s.instanceId) ? 0.8 : 0.35} />
      <StampArtwork stamp={s} observedSvg={observed[s.instanceId]} />
      <title>{s.name} · {s.heightMm.toFixed(1)} × {s.widthMm.toFixed(1)} mm · {s.recipe}{s.pinned ? ' · Fijo' : ''}</title>
    </g>; })}
    {execution?.stamps.map((s) => <g key={`operation-${s.instanceId}`} style={{ pointerEvents: 'none' }}>
      <line x1={s.cut.x1} x2={s.cut.x2} y1={-s.cut.y} y2={-s.cut.y} stroke="#dc2626" strokeWidth="0.5" strokeDasharray="2 1"><title>Corte transversal del plan</title></line>
      <circle cx={s.drill.x} cy={-s.drill.y} r={s.drill.radiusMm} fill="none" stroke="#0891b2" strokeWidth="0.5"><title>Taladro del plan · diámetro {s.drill.radiusMm * 2} mm</title></circle>
    </g>)}
  </svg>;
}
