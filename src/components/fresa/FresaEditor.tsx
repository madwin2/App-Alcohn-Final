import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Eraser,
  Hand,
  Loader2,
  MousePointer2,
  Redo2,
  Spline,
  Trash2,
  Undo2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import { useFresaReport } from '@/lib/fresa/useFresaReport';
import {
  buildEditDoc,
  computePieces,
  countNodes,
  deleteNode,
  docBounds,
  moveNodePart,
  offsetPiece,
  pieceAt,
  redundantNodes,
  removeRedundant,
  removeRefs,
  scaleRefs,
  serializeEditDoc,
  simplifyDoc,
  specks,
  subToD,
  translateRefs,
  type EditDoc,
  type EditPiece,
  type NodePart,
  type NodeRef,
  type SubRef,
} from '@/lib/fresa/editDoc';
import type { Pt } from '@/lib/fresa/pathData';
import { SEVERITY_FILL, mm } from '@/lib/fresa/textos';

interface Props {
  /** SVG de partida (el original o el corregido). */
  svgText: string;
  /** Reporte del original: escala (mm por unidad) y perfil de fresa. */
  report: FresaReport;
  onDone: (svg: string, cambios: number) => void;
  onCancel: () => void;
}

type Tool = 'mover' | 'nodos' | 'mano';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Motas: piezas sueltas de menos de esto (mm²). */
const SPECK_MM2 = 0.05;

const refKey = (r: SubRef) => `${r.path}:${r.sub}`;

function fitBox(b: Box, aspect: number): Box {
  if (!(aspect > 0)) return b;
  if (b.w / b.h > aspect) {
    const h = b.w / aspect;
    return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h };
  }
  const w = b.h * aspect;
  return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h };
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 0.05,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  step?: number;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      <input
        className="h-7 w-20 rounded border bg-background px-1.5 text-right tabular-nums"
        inputMode="decimal"
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className="text-muted-foreground">{suffix}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 border-t pt-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/**
 * Editor manual del vector dentro del chequeo de fresa: mover y escalar piezas,
 * offsets en paralelo, mover y borrar nodos, simplificar, borrar motas. El
 * chequeo de fresa se recalcula al soltar cada cambio.
 */
export function FresaEditor({ svgText, report, onDone, onCancel }: Props) {
  const k = report.mmPerUnit;
  const built = useMemo(() => buildEditDoc(svgText), [svgText]);
  const [history, setHistory] = useState<EditDoc[]>(() => (built.ok ? [built.doc] : []));
  const [idx, setIdx] = useState(0);
  const doc = history[idx] ?? null;
  const [temp, setTemp] = useState<EditDoc | null>(null);
  const shown = temp ?? doc;

  const [tool, setTool] = useState<Tool>('mover');
  const [selKey, setSelKey] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<NodeRef | null>(null);
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [moveX, setMoveX] = useState('0');
  const [moveY, setMoveY] = useState('0');
  const [scalePct, setScalePct] = useState('100');
  const [offsetMm, setOffsetMm] = useState('0.05');
  const [tolMm, setTolMm] = useState('0.01');
  const [notice, setNotice] = useState<string | null>(null);

  const tolUnits = 0.004 / k; // aplanado para piezas y toques
  const pieces = useMemo(() => (shown ? computePieces(shown, tolUnits) : []), [shown, tolUnits]);
  const selected: EditPiece | null = useMemo(
    () => (selKey ? pieces.find((p) => refKey(p.refs[0]) === selKey) ?? null : null),
    [pieces, selKey],
  );

  // Chequeo en vivo (solo de lo confirmado, no mientras se arrastra).
  const docSvg = useMemo(() => (doc ? serializeEditDoc(doc) : null), [doc]);
  const target = useMemo(
    () => ({ mode: 'escala' as const, mmPerUnit: k, alimento: report.profile.id === 'alimento' }),
    [k, report.profile.id],
  );
  const live = useFresaReport(docSvg, target);

  const commit = useCallback(
    (next: EditDoc, msg?: string) => {
      const nh = [...history.slice(0, idx + 1), next].slice(-80);
      setHistory(nh);
      setIdx(nh.length - 1);
      setTemp(null);
      setNotice(msg ?? null);
    },
    [history, idx],
  );
  const undo = () => idx > 0 && (setIdx(idx - 1), setTemp(null), setSelNode(null));
  const redo = () => idx < history.length - 1 && (setIdx(idx + 1), setTemp(null), setSelNode(null));

  // ------------------------------------------------------------ vista
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1.4);
  const base = useMemo<Box>(() => {
    const b = doc ? docBounds(doc, tolUnits) : null;
    if (!b) return report.viewBox;
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
    // Solo el encuadre inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);
  const [view, setView] = useState<Box>(base);
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
  const fitAll = useCallback(() => setView(fitBox(base, aspect)), [base, aspect]);
  useEffect(() => fitAll(), [fitAll]);

  const toUser = (cx: number, cy: number): Pt | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const pxPerUnit = (hostRef.current?.getBoundingClientRect().width ?? 600) / view.w;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toUser(e.clientX, e.clientY);
      const f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      setView((v) => {
        const w = Math.min(base.w * 4, Math.max(0.8 / k, v.w * f));
        const s = w / v.w;
        const px = p?.x ?? v.x + v.w / 2;
        const py = p?.y ?? v.y + v.h / 2;
        return { x: px - (px - v.x) * s, y: py - (py - v.y) * s, w, h: v.h * s };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ------------------------------------------------------------ nodos visibles
  const nodeRefs = useMemo(() => {
    if (!shown) return [] as SubRef[];
    if (showAllNodes) return shown.paths.flatMap((p, pi) => p.subs.map((_, si) => ({ path: pi, sub: si })));
    return selected ? selected.refs : [];
  }, [shown, showAllNodes, selected]);
  const extra = useMemo(
    () => (shown ? redundantNodes(shown, 0.002 / k, selected ? selected.refs : undefined) : []),
    [shown, selected, k],
  );
  const extraKeys = useMemo(() => new Set(extra.map((n) => `${n.path}:${n.sub}:${n.node}`)), [extra]);
  const totalNodes = shown ? countNodes(shown) : 0;
  const pieceNodes = shown && selected ? countNodes(shown, selected.refs) : 0;
  const motas = useMemo(() => specks(pieces, SPECK_MM2, k), [pieces, k]);

  // ------------------------------------------------------------ arrastre
  type Drag =
    | { kind: 'pan'; x: number; y: number; view: Box; moved: boolean }
    | { kind: 'piece'; start: Pt; refs: SubRef[]; moved: boolean }
    | { kind: 'node'; ref: NodeRef; part: NodePart; moved: boolean };
  const drag = useRef<Drag | null>(null);

  const hitNode = (p: Pt): { ref: NodeRef; part: NodePart } | null => {
    if (!shown) return null;
    const r = 7 / pxPerUnit;
    // El cast evita que TS lo fije en null (se asigna dentro de forEach).
    let best = null as { ref: NodeRef; part: NodePart; d: number } | null;
    for (const s of nodeRefs) {
      const sub = shown.paths[s.path]?.subs[s.sub];
      if (!sub) continue;
      sub.nodes.forEach((n, ni) => {
        for (const part of ['p', 'i', 'o'] as NodePart[]) {
          const q = n[part];
          if (!q) continue;
          // Las manijas solo se ven (y se tocan) en el nodo elegido y sus vecinos.
          if (part !== 'p' && !(selNode && selNode.path === s.path && selNode.sub === s.sub && Math.abs(selNode.node - ni) <= 1))
            continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d <= r && (!best || d < best.d)) best = { ref: { ...s, node: ni }, part, d };
        }
      });
    }
    return best ? { ref: best.ref, part: best.part } : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!doc) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hostRef.current?.focus();
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    const panning = tool === 'mano' || e.button === 1 || e.button === 2 || e.altKey;
    if (!panning && tool === 'nodos') {
      const h = hitNode(p);
      if (h) {
        setSelNode(h.ref);
        drag.current = { kind: 'node', ref: h.ref, part: h.part, moved: false };
        return;
      }
    }
    if (!panning) {
      const pc = pieceAt(pieces, p);
      if (pc) {
        setSelKey(refKey(pc.refs[0]));
        if (tool === 'nodos') setSelNode(null);
        if (tool === 'mover') {
          drag.current = { kind: 'piece', start: p, refs: pc.refs, moved: false };
          return;
        }
      } else if (tool !== 'nodos') {
        setSelKey(null);
      }
    }
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, view, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !doc) return;
    if (d.kind === 'pan') {
      const ppu = (hostRef.current?.getBoundingClientRect().width ?? 600) / d.view.w;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView({ ...d.view, x: d.view.x - dx / ppu, y: d.view.y - dy / ppu });
      return;
    }
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    if (d.kind === 'piece') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (Math.hypot(dx, dy) * pxPerUnit > 2) d.moved = true;
      if (d.moved) setTemp(translateRefs(doc, d.refs, dx, dy));
    } else {
      d.moved = true;
      setTemp(moveNodePart(doc, d.ref, d.part, p));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
      if (!d.moved && tool === 'nodos') setSelNode(null);
      return;
    }
    if (d.moved && temp) {
      commit(temp, d.kind === 'piece' ? 'Pieza movida.' : 'Nodo movido.');
    } else {
      setTemp(null);
    }
  };

  // ------------------------------------------------------------ operaciones
  const num = (s: string) => Number(String(s).replace(',', '.'));
  const needSel = () => {
    if (!selected || !doc) {
      setNotice('Elegí una pieza tocándola en el dibujo.');
      return null;
    }
    return selected;
  };
  const doMove = () => {
    const s = needSel();
    if (!s || !doc) return;
    const dx = num(moveX) / k;
    const dy = num(moveY) / k;
    if (!dx && !dy) return;
    commit(translateRefs(doc, s.refs, dx, dy), `Pieza movida ${mm(num(moveX))} / ${mm(num(moveY))} mm.`);
  };
  const doScale = () => {
    const s = needSel();
    if (!s || !doc) return;
    const f = num(scalePct) / 100;
    if (!(f > 0) || f === 1) return;
    commit(scaleRefs(doc, s.refs, f, s.bounds), `Pieza escalada al ${mm(num(scalePct), 1)} %.`);
  };
  const doOffset = (sign: 1 | -1) => {
    const s = needSel();
    if (!s || !doc) return;
    const d = Math.abs(num(offsetMm)) * sign;
    if (!d) return;
    const next = offsetPiece(doc, s, d, k);
    if (!next) {
      setNotice('El offset hacia adentro hizo desaparecer la pieza: probá con menos.');
      return;
    }
    commit(next, sign > 0 ? `Offset exterior de ${mm(Math.abs(d))} mm.` : `Offset interior de ${mm(Math.abs(d))} mm.`);
    // La pieza nueva queda al final: se elige sola.
    const last = next.paths.length - 1;
    setSelKey(`${last}:0`);
  };
  const doDeletePiece = () => {
    const s = needSel();
    if (!s || !doc) return;
    commit(removeRefs(doc, s.refs), 'Pieza borrada.');
    setSelKey(null);
  };
  const doDeleteNode = () => {
    if (!selNode || !doc) return;
    commit(deleteNode(doc, selNode), 'Nodo borrado.');
    setSelNode(null);
  };
  const doRedundant = () => {
    if (!doc) return;
    const { doc: next, removed } = removeRedundant(doc, 0.002 / k, selected?.refs);
    if (!removed) {
      setNotice('No hay nodos de más.');
      return;
    }
    commit(next, `Se sacaron ${removed} nodos de más (la forma no cambia).`);
  };
  const doSimplify = () => {
    if (!doc) return;
    const tol = Math.max(0.001, num(tolMm)) / k;
    const r = simplifyDoc(doc, tol, selected?.refs);
    if (r.after >= r.before) {
      setNotice('No se pudo simplificar más con esa tolerancia.');
      return;
    }
    commit(r.doc, `Curvas simplificadas: de ${r.before} a ${r.after} nodos (error máximo ${mm(num(tolMm), 3)} mm).`);
  };
  const doSpecks = () => {
    if (!doc || !motas.length) return;
    commit(removeRefs(doc, motas.flatMap((m) => m.refs)), `Se borraron ${motas.length} motas.`);
    setSelKey(null);
  };

  const nudge = (dxMm: number, dyMm: number) => {
    if (!selected || !doc) return;
    commit(translateRefs(doc, selected.refs, dxMm / k, dyMm / k), 'Pieza movida.');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.5 : 0.05;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (tool === 'nodos' && selNode) doDeleteNode();
      else if (selected) doDeletePiece();
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (dirs[e.key] && selected) {
      e.preventDefault();
      nudge(...dirs[e.key]);
    }
    if (e.key === 'v' || e.key === 'V') setTool('mover');
    if (e.key === 'a' || e.key === 'A') setTool('nodos');
    if (e.key === 'h' || e.key === 'H') setTool('mano');
  };

  // ------------------------------------------------------------ render
  if (!built.ok) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border bg-muted/30 p-6 text-center text-sm">
        <AlertTriangle className="size-6 text-amber-500" />
        <p className="max-w-md">{built.error}</p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Volver
        </Button>
      </div>
    );
  }

  const strokeW = 1.5 / pxPerUnit;
  const handleR = 3.2 / pxPerUnit;
  const anchorS = 6 / pxPerUnit;
  const bSel = shown ? docBounds(shown, tolUnits) : null;
  const sizeNow = bSel ? { w: (bSel.maxX - bSel.minX) * k, h: (bSel.maxY - bSel.minY) * k } : null;
  const sizeBefore = { w: report.widthMm, h: report.heightMm };
  const sizeChanged = sizeNow && (Math.abs(sizeNow.w - sizeBefore.w) > 0.05 || Math.abs(sizeNow.h - sizeBefore.h) > 0.05);
  const liveProblems = live?.check ? live.groupCounts.alta + live.groupCounts.media : null;

  const toolBtn = (t: Tool, icon: ReactNode, label: string, key: string) => (
    <button
      type="button"
      title={`${label} (${key})`}
      onClick={() => setTool(t)}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-xs',
        tool === t ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:flex-row">
      <div className="flex h-[55vh] min-w-0 shrink-0 flex-col gap-2 md:h-auto md:min-h-[300px] md:flex-1 md:shrink">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
            {toolBtn('mover', <MousePointer2 className="size-3.5" />, 'Mover', 'V')}
            {toolBtn('nodos', <Spline className="size-3.5" />, 'Nodos', 'A')}
            {toolBtn('mano', <Hand className="size-3.5" />, 'Mano', 'H')}
          </div>
          <Button type="button" size="sm" variant="ghost" disabled={idx === 0} onClick={undo} title="Deshacer (Ctrl+Z)">
            <Undo2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={idx >= history.length - 1}
            onClick={redo}
            title="Rehacer (Ctrl+Y)"
          >
            <Redo2 className="size-4" />
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={showAllNodes} onCheckedChange={(v) => setShowAllNodes(Boolean(v))} />
            Ver todos los nodos
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={showZones} onCheckedChange={(v) => setShowZones(Boolean(v))} />
            Ver lugares
          </label>
        </div>
        <div
          ref={hostRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-md border bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'bg-[length:20px_20px] bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)]',
            tool === 'mano' ? 'cursor-grab' : tool === 'nodos' ? 'cursor-crosshair' : 'cursor-default',
          )}
        >
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full"
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {shown?.paths.map((p, pi) => (
              <path key={pi} d={p.subs.map(subToD).join('')} fill="#111" fillRule={p.fillRule} />
            ))}
            {selected && shown ? (
              <g>
                {selected.refs.map((r) => {
                  const sub = shown.paths[r.path]?.subs[r.sub];
                  return sub ? (
                    <path
                      key={refKey(r)}
                      d={subToD(sub)}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={strokeW * 1.4}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null;
                })}
              </g>
            ) : null}
            {showZones && live?.check ? (
              <g transform={`scale(${1 / k})`} style={{ pointerEvents: 'none' }}>
                {live.check.zones
                  .filter((z) => z.severity !== 'baja')
                  .map((z) => (
                    <path
                      key={z.id}
                      d={z.rings.map((r) => `M${r.map((q) => `${q.x} ${q.y}`).join('L')}Z`).join('')}
                      fill={SEVERITY_FILL[z.severity]}
                      fillOpacity={0.75}
                    />
                  ))}
              </g>
            ) : null}
            {shown && (tool === 'nodos' || showAllNodes)
              ? nodeRefs.map((r) => {
                  const sub = shown.paths[r.path]?.subs[r.sub];
                  if (!sub) return null;
                  return (
                    <g key={refKey(r)} style={{ pointerEvents: 'none' }}>
                      {sub.nodes.map((n, ni) => {
                        const isSel = selNode && selNode.path === r.path && selNode.sub === r.sub && selNode.node === ni;
                        const near =
                          selNode && selNode.path === r.path && selNode.sub === r.sub && Math.abs(selNode.node - ni) <= 1;
                        const isExtra = extraKeys.has(`${r.path}:${r.sub}:${ni}`);
                        return (
                          <g key={ni}>
                            {near && tool === 'nodos'
                              ? (['i', 'o'] as const).map((part) =>
                                  n[part] ? (
                                    <g key={part}>
                                      <line
                                        x1={n.p.x}
                                        y1={n.p.y}
                                        x2={n[part]!.x}
                                        y2={n[part]!.y}
                                        stroke="#64748b"
                                        strokeWidth={strokeW * 0.8}
                                        vectorEffect="non-scaling-stroke"
                                      />
                                      <circle cx={n[part]!.x} cy={n[part]!.y} r={handleR} fill="#fff" stroke="#2563eb" strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
                                    </g>
                                  ) : null,
                                )
                              : null}
                            <rect
                              x={n.p.x - anchorS / 2}
                              y={n.p.y - anchorS / 2}
                              width={anchorS}
                              height={anchorS}
                              fill={isSel ? '#2563eb' : isExtra ? '#f97316' : '#fff'}
                              stroke={isExtra ? '#f97316' : '#2563eb'}
                              strokeWidth={strokeW}
                              vectorEffect="non-scaling-stroke"
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })
              : null}
          </svg>
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md border bg-background/90 p-1 text-xs shadow-sm">
            <button
              type="button"
              className="rounded px-2 py-1 hover:bg-muted"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={fitAll}
            >
              Ver todo
            </button>
            <span className="px-1 tabular-nums text-muted-foreground">{mm(view.w * k, view.w * k < 10 ? 1 : 0)} mm de ancho</span>
          </div>
        </div>
        <p className="shrink-0 text-[11px] text-muted-foreground">
          <strong>Mover</strong>: tocá una pieza y arrastrala; flechas mueven 0,05 mm (Shift: 0,5 mm). <strong>Nodos</strong>:
          arrastrá un nodo o sus manijas; Supr borra el nodo elegido. Rueda para acercar; Alt o clic derecho + arrastrar para
          moverte. Ctrl+Z deshace.
        </p>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-2 text-sm md:w-[340px] md:overflow-y-auto">
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border p-2 text-xs',
            liveProblems == null
              ? 'bg-muted/40'
              : liveProblems === 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
          )}
        >
          {liveProblems == null ? (
            <Loader2 className="mt-0.5 size-3.5 animate-spin" />
          ) : liveProblems === 0 ? (
            <CheckCircle2 className="mt-0.5 size-3.5" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5" />
          )}
          <span>
            {liveProblems == null
              ? 'Chequeando…'
              : liveProblems === 0
                ? 'Todo se separa: la fresa baja lo suficiente.'
                : `${liveProblems} lugar${liveProblems === 1 ? '' : 'es'} donde se pierde el diseño (en rojo/amarillo).`}
            {sizeNow ? (
              <span className={cn('block', sizeChanged ? 'font-medium text-amber-700 dark:text-amber-300' : 'opacity-80')}>
                Medida: {mm(sizeNow.w, 1)} × {mm(sizeNow.h, 1)} mm
                {sizeChanged ? ` (antes ${mm(sizeBefore.w, 1)} × ${mm(sizeBefore.h, 1)})` : ''}
              </span>
            ) : null}
          </span>
        </div>
        {notice ? <p className="rounded bg-muted/60 p-2 text-xs">{notice}</p> : null}

        <Section title="Nodos">
          <p className="text-xs text-muted-foreground">
            {totalNodes.toLocaleString('es-AR')} en total
            {selected ? ` · ${pieceNodes.toLocaleString('es-AR')} en la pieza elegida` : ''}
            {extra.length ? (
              <>
                {' · '}
                <span className="text-orange-600">{extra.length} de más</span> (naranja)
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" disabled={!extra.length} onClick={doRedundant}>
              Quitar nodos de más
            </Button>
            {tool === 'nodos' && selNode ? (
              <Button type="button" size="sm" variant="outline" onClick={doDeleteNode}>
                <Trash2 className="mr-1 size-3.5" />
                Borrar nodo
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Error máx.</span>
              <select
                className="h-7 rounded border bg-background px-1 text-xs"
                value={tolMm}
                onChange={(e) => setTolMm(e.target.value)}
              >
                {['0.005', '0.01', '0.02', '0.05'].map((v) => (
                  <option key={v} value={v}>
                    {v.replace('.', ',')} mm
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" onClick={doSimplify}>
              Simplificar curvas
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {selected ? 'Se aplica a la pieza elegida.' : 'Se aplica a todo el dibujo (elegí una pieza para limitarlo).'}{' '}
            "Quitar nodos de más" no cambia la forma; "Simplificar curvas" la cambia como mucho el error elegido.
          </p>
        </Section>

        <Section title={selected ? `Pieza elegida · ${mm((selected.bounds.maxX - selected.bounds.minX) * k)} × ${mm((selected.bounds.maxY - selected.bounds.minY) * k)} mm` : 'Pieza'}>
          {!selected ? (
            <p className="text-xs text-muted-foreground">Tocá una pieza (una letra, el ícono) para moverla, escalarla u hacerle offset.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <NumField label="Mover X" value={moveX} onChange={setMoveX} suffix="mm" />
                <NumField label="Mover Y" value={moveY} onChange={setMoveY} suffix="mm" />
                <Button type="button" size="sm" variant="outline" onClick={doMove}>
                  Mover
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <NumField label="Escala" value={scalePct} onChange={setScalePct} suffix="%" step={1} />
                <Button type="button" size="sm" variant="outline" onClick={doScale}>
                  Escalar
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <NumField label="Offset" value={offsetMm} onChange={setOffsetMm} suffix="mm" step={0.01} />
                <Button type="button" size="sm" variant="outline" onClick={() => doOffset(1)} title="Engorda la pieza en paralelo">
                  Exterior
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => doOffset(-1)} title="Afina la pieza en paralelo">
                  Interior
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Escalar es parejo (no deforma), desde el centro de la pieza. El offset engorda o afina en paralelo; la
                pieza queda con curvas suaves.
              </p>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={doDeletePiece}>
                <Trash2 className="mr-1 size-3.5" />
                Borrar pieza
              </Button>
            </div>
          )}
        </Section>

        <Section title="Limpieza">
          <Button type="button" size="sm" variant="outline" disabled={!motas.length} onClick={doSpecks}>
            <Eraser className="mr-1 size-3.5" />
            Borrar {motas.length} mota{motas.length === 1 ? '' : 's'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Piezas sueltas de menos de {mm(SPECK_MM2)} mm² (restos de la vectorización).
          </p>
        </Section>

        <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
          <Button type="button" disabled={idx === 0 || !doc} onClick={() => doc && onDone(serializeEditDoc(doc), idx)}>
            Listo
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </aside>
    </div>
  );
}
