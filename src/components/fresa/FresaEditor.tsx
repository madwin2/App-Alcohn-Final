import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Eraser,
  Hand,
  Keyboard,
  Loader2,
  Magnet,
  Maximize2,
  MousePointer2,
  Redo2,
  Spline,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { cn } from '@/lib/utils/cn';
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import { useFresaReport } from '@/lib/fresa/useFresaReport';
import {
  buildEditDoc,
  computePieces,
  countNodes,
  deleteNode,
  docBounds,
  isSmooth,
  moveNodePart,
  offsetPieces,
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
  type Box as DocBox,
  type EditDoc,
  type EditPiece,
  type NodePart,
  type NodeRef,
  type SubRef,
} from '@/lib/fresa/editDoc';
import {
  alignShifts,
  boxesTouch,
  constrainAxis,
  distributeShifts,
  neighborGaps,
  shiftBox,
  snapMove,
  snapPoint,
  unionBox,
  type AlignMode,
  type Guide,
} from '@/lib/fresa/editTools';
import type { Pt } from '@/lib/fresa/pathData';
import { renderRelief } from '@/lib/fresa/vcarveRelief';
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
/** Distancia mínima en pantalla entre nodos para poder tocarlos (px). */
const NODE_MIN_SPACING_PX = 9;
/** Distancia del imán en pantalla (px). */
const SNAP_PX = 6;

const GUIDE_COLOR = '#d946ef';

const refKey = (r: SubRef) => `${r.path}:${r.sub}`;
const keyOf = (p: EditPiece) => refKey(p.refs[0]);
const sameNode = (a: NodeRef | null, b: NodeRef) => !!a && a.path === b.path && a.sub === b.sub && a.node === b.node;

function fitBox(b: Box, aspect: number): Box {
  if (!(aspect > 0)) return b;
  if (b.w / b.h > aspect) {
    const h = b.w / aspect;
    return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h };
  }
  const w = b.h * aspect;
  return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h };
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold">{title}</h4>
        {extra ? <span className="text-[11px] text-muted-foreground">{extra}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const iconBtn =
  'inline-flex size-7 items-center justify-center rounded border bg-background text-foreground hover:bg-muted disabled:opacity-40';

/**
 * Editor manual del vector dentro del chequeo de fresa: elegir una o varias
 * piezas, moverlas (con imán y guías), cambiarles el tamaño y el grosor,
 * alinearlas y distribuirlas, mover y borrar nodos, simplificar, borrar motas.
 * El chequeo de fresa se recalcula al soltar cada cambio.
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
  /** Piezas elegidas (clave de su contorno de afuera); la primera es la "principal". */
  const [selKeys, setSelKeys] = useState<string[]>([]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<NodeRef | null>(null);
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showRelief, setShowRelief] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [stepMm, setStepMm] = useState('0.05');
  const [scalePct, setScalePct] = useState('100');
  const [offsetMm, setOffsetMm] = useState('0.05');
  const [tolMm, setTolMm] = useState('0.01');
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragInfo, setDragInfo] = useState<{ dx: number; dy: number } | null>(null);
  const [marquee, setMarquee] = useState<DocBox | null>(null);
  const spaceDown = useRef(false);

  const tolUnits = 0.004 / k; // aplanado para piezas y toques
  const pieces = useMemo(() => (shown ? computePieces(shown, tolUnits) : []), [shown, tolUnits]);
  const byKey = useMemo(() => new Map(pieces.map((p) => [keyOf(p), p])), [pieces]);
  const selection = useMemo(
    () => selKeys.map((key) => byKey.get(key)).filter((p): p is EditPiece => !!p),
    [selKeys, byKey],
  );
  const primary: EditPiece | null = selection[0] ?? null;
  const selRefs = useMemo(() => selection.flatMap((p) => p.refs), [selection]);
  const selBox = useMemo(() => unionBox(selection.map((p) => p.bounds)), [selection]);
  const hovered = hoverKey && !selKeys.includes(hoverKey) ? byKey.get(hoverKey) ?? null : null;

  const setSelection = (keys: string[]) => {
    setSelKeys(keys);
    setSelNode(null);
  };

  // Chequeo en vivo (solo de lo confirmado, no mientras se arrastra).
  const docSvg = useMemo(() => (doc ? serializeEditDoc(doc) : null), [doc]);
  const target = useMemo(
    () => ({ mode: 'escala' as const, mmPerUnit: k, alimento: report.profile.id === 'alimento' }),
    [k, report.profile.id],
  );
  const live = useFresaReport(docSvg, target);
  const liveGroups = useMemo(() => (live?.check?.groups ?? []).filter((g) => g.severity !== 'baja'), [live]);

  const commit = useCallback(
    (next: EditDoc, text?: string, tone: 'ok' | 'warn' = 'ok') => {
      const nh = [...history.slice(0, idx + 1), next].slice(-80);
      setHistory(nh);
      setIdx(nh.length - 1);
      setTemp(null);
      setNotice(text ? { text, tone } : null);
    },
    [history, idx],
  );
  const say = (text: string, tone: 'ok' | 'warn' = 'warn') => setNotice({ text, tone });
  const undo = () => {
    if (idx === 0) return;
    setIdx(idx - 1);
    setTemp(null);
    setSelNode(null);
    setNotice({ text: 'Deshecho.', tone: 'ok' });
  };
  const redo = () => {
    if (idx >= history.length - 1) return;
    setIdx(idx + 1);
    setTemp(null);
    setSelNode(null);
    setNotice({ text: 'Rehecho.', tone: 'ok' });
  };

  // ------------------------------------------------------------ vista
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1.4);
  const designBox = useMemo(() => (built.ok ? docBounds(built.doc, tolUnits) : null), [built, tolUnits]);
  const base = useMemo<Box>(() => {
    const b = designBox;
    if (!b) return report.viewBox;
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
  }, [designBox, report.viewBox]);
  const [view, setView] = useState<Box>(base);
  const [hostW, setHostW] = useState(600);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setAspect(r.width / r.height);
        setHostW(r.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitAll = useCallback(() => setView(fitBox(base, aspect)), [base, aspect]);
  // Encuadre inicial una sola vez; después, si cambia el tamaño del lienzo, se
  // conserva el zoom y el centro (no vuelve a "ver todo").
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) {
      fitted.current = true;
      fitAll();
      return;
    }
    setView((v) => {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      const h = v.w / aspect;
      return { x: cx - v.w / 2, y: cy - h / 2, w: v.w, h };
    });
  }, [aspect, fitAll]);
  const zoomTo = (b: DocBox, padMm = 1.5) => {
    const pad = padMm / k;
    const w = Math.max(b.maxX - b.minX + 2 * pad, 4 / k);
    const h = Math.max(b.maxY - b.minY + 2 * pad, 4 / k);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    setView(fitBox({ x: cx - w / 2, y: cy - h / 2, w, h }, aspect));
  };

  const toUser = (cx: number, cy: number): Pt | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const pxPerUnit = hostW / view.w;

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

  // ------------------------------------------------------------ relieve 3D
  // Se calcula para lo que se ve (con margen), así al acercarse queda nítido.
  // Espera un instante a que termine el zoom o el paneo.
  const [reliefBox, setReliefBox] = useState<DocBox | null>(null);
  useEffect(() => {
    if (!showRelief || !designBox) return;
    const t = window.setTimeout(() => {
      // Margen: lo que puede "ver" la fresa más allá del borde (su radio a la
      // profundidad final), para que el corte de la grilla no falsee la profundidad.
      const reach = (report.profile.finalDepthMm * Math.tan((report.profile.halfAngleDeg * Math.PI) / 180) + 0.3) / k;
      const minX = Math.max(view.x, designBox.minX - reach) - reach;
      const minY = Math.max(view.y, designBox.minY - reach) - reach;
      const maxX = Math.min(view.x + view.w, designBox.maxX + reach) + reach;
      const maxY = Math.min(view.y + view.h, designBox.maxY + reach) + reach;
      setReliefBox(maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null);
    }, 150);
    return () => window.clearTimeout(t);
  }, [showRelief, designBox, view.x, view.y, view.w, view.h, k, report.profile]);
  const relief = useMemo(() => {
    if (!showRelief || !doc || !reliefBox) return null;
    return renderRelief(
      doc.paths.map((p) => ({ d: p.subs.map(subToD).join(''), fillRule: p.fillRule })),
      reliefBox,
      k,
      report.profile,
      700,
    );
  }, [showRelief, doc, reliefBox, k, report.profile]);

  // ------------------------------------------------------------ nodos
  const nodeRefs = useMemo(() => {
    if (!shown) return [] as SubRef[];
    if (showAllNodes) return shown.paths.flatMap((p, pi) => p.subs.map((_, si) => ({ path: pi, sub: si })));
    return tool === 'nodos' && primary ? primary.refs : [];
  }, [shown, showAllNodes, primary, tool]);
  // ¿Los nodos están lo bastante separados en pantalla para tocarlos?
  const nodesTouchable = useMemo(() => {
    if (!shown || !nodeRefs.length) return false;
    const gaps: number[] = [];
    for (const r of nodeRefs) {
      const n = shown.paths[r.path]?.subs[r.sub]?.nodes ?? [];
      for (let i = 1; i < n.length && gaps.length < 600; i++) gaps.push(Math.hypot(n[i].p.x - n[i - 1].p.x, n[i].p.y - n[i - 1].p.y));
    }
    if (!gaps.length) return true;
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] * pxPerUnit >= NODE_MIN_SPACING_PX;
  }, [shown, nodeRefs, pxPerUnit]);
  const extra = useMemo(
    () => (shown ? redundantNodes(shown, 0.002 / k, selRefs.length ? selRefs : undefined) : []),
    [shown, selRefs, k],
  );
  // Cuántos nodos quedarían al simplificar (para mostrarlo en el botón).
  const simplified = useMemo(() => {
    if (!doc) return null;
    const tol = Math.max(0.001, Number(tolMm.replace(',', '.'))) / k;
    return simplifyDoc(doc, tol, selRefs.length ? selRefs : undefined);
  }, [doc, tolMm, k, selRefs]);
  const extraKeys = useMemo(() => new Set(extra.map((n) => `${n.path}:${n.sub}:${n.node}`)), [extra]);
  const totalNodes = shown ? countNodes(shown) : 0;
  const selNodes = shown && selRefs.length ? countNodes(shown, selRefs) : 0;
  const motas = useMemo(() => specks(pieces, SPECK_MM2, k), [pieces, k]);
  const selNodeData = selNode && shown ? shown.paths[selNode.path]?.subs[selNode.sub]?.nodes[selNode.node] : undefined;

  // ------------------------------------------------------------ arrastre
  type Drag =
    | { kind: 'pan'; x: number; y: number; view: Box; moved: boolean }
    | { kind: 'move'; start: Pt; refs: SubRef[]; box: DocBox; others: DocBox[]; moved: boolean }
    | { kind: 'marquee'; start: Pt; additive: boolean; moved: boolean }
    | { kind: 'node'; ref: NodeRef; part: NodePart; xs: number[]; ys: number[]; moved: boolean };
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);

  const hitNode = (p: Pt): { ref: NodeRef; part: NodePart } | null => {
    if (!shown || !nodesTouchable) return null;
    const r = 8 / pxPerUnit;
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
          const score = part === 'p' ? d : d * 0.8;
          if (d <= r && (!best || score < best.d)) best = { ref: { ...s, node: ni }, part, d: score };
        }
      });
    }
    return best ? { ref: best.ref, part: best.part } : null;
  };

  /** x e y de los otros nodos de la pieza (imán para un nodo). */
  const nodeSnapLines = (ref: NodeRef): { xs: number[]; ys: number[] } => {
    const xs: number[] = [];
    const ys: number[] = [];
    if (!doc || !primary) return { xs, ys };
    for (const r of primary.refs) {
      const nodes = doc.paths[r.path]?.subs[r.sub]?.nodes ?? [];
      nodes.forEach((n, ni) => {
        if (r.path === ref.path && r.sub === ref.sub && ni === ref.node) return;
        xs.push(n.p.x);
        ys.push(n.p.y);
      });
    }
    return { xs, ys };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!doc) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hostRef.current?.focus();
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    const panning = tool === 'mano' || spaceDown.current || e.button === 1 || e.button === 2;
    const startPan = () => {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, view, moved: false };
      setDragging('pan');
    };
    if (panning) return startPan();

    if (tool === 'nodos' && primary) {
      const h = hitNode(p);
      if (h) {
        setSelNode(h.ref);
        const { xs, ys } = nodeSnapLines(h.ref);
        drag.current = { kind: 'node', ref: h.ref, part: h.part, xs, ys, moved: false };
        setDragging('node');
        return;
      }
    }

    const pc = pieceAt(pieces, p);
    if (pc) {
      const key = keyOf(pc);
      let keys = selKeys;
      if (e.shiftKey && tool === 'mover') {
        // Shift: suma o saca de la selección (no arrastra).
        keys = selKeys.includes(key) ? selKeys.filter((x) => x !== key) : [...selKeys, key];
        setSelection(keys);
        return;
      }
      if (!selKeys.includes(key)) {
        keys = [key];
        setSelection(keys);
      } else if (tool === 'nodos') {
        // En nodos, la pieza tocada pasa a ser la principal.
        keys = [key, ...selKeys.filter((x) => x !== key)];
        setSelKeys(keys);
      }
      if (tool === 'mover') {
        const chosen = keys.map((x) => byKey.get(x)).filter((q): q is EditPiece => !!q);
        const box = unionBox(chosen.map((q) => q.bounds))!;
        const others = pieces.filter((q) => !keys.includes(keyOf(q))).map((q) => q.bounds);
        drag.current = { kind: 'move', start: p, refs: chosen.flatMap((q) => q.refs), box, others, moved: false };
        setDragging('move');
      }
      return;
    }

    if (tool === 'mover') {
      drag.current = { kind: 'marquee', start: p, additive: e.shiftKey, moved: false };
      setDragging('marquee');
      return;
    }
    startPan();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      // Resaltar lo que se va a agarrar.
      if (tool === 'mano' || !doc) return;
      const p = toUser(e.clientX, e.clientY);
      const pc = p ? pieceAt(pieces, p) : null;
      const key = pc ? keyOf(pc) : null;
      if (key !== hoverKey) setHoverKey(key);
      return;
    }
    if (!doc) return;
    if (d.kind === 'pan') {
      const ppu = hostW / d.view.w;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView({ ...d.view, x: d.view.x - dx / ppu, y: d.view.y - dy / ppu });
      return;
    }
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    const useSnap = snapOn && !(e.ctrlKey || e.metaKey);
    const threshold = SNAP_PX / pxPerUnit;
    if (d.kind === 'marquee') {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * pxPerUnit > 3) d.moved = true;
      setMarquee({
        minX: Math.min(d.start.x, p.x),
        minY: Math.min(d.start.y, p.y),
        maxX: Math.max(d.start.x, p.x),
        maxY: Math.max(d.start.y, p.y),
      });
      return;
    }
    if (d.kind === 'move') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (Math.hypot(dx, dy) * pxPerUnit > 2) d.moved = true;
      if (!d.moved) return;
      let axes = { x: true, y: true };
      if (e.shiftKey) {
        const c = constrainAxis(dx, dy);
        dx = c.dx;
        dy = c.dy;
        axes = { x: c.axis === 'x', y: c.axis === 'y' };
      }
      let g: Guide[] = [];
      if (useSnap) {
        const center = designBox ? { xs: [(designBox.minX + designBox.maxX) / 2], ys: [(designBox.minY + designBox.maxY) / 2] } : {};
        const r = snapMove(d.box, dx, dy, { boxes: d.others, ...center }, threshold, axes);
        dx = r.dx;
        dy = r.dy;
        g = r.guides;
      }
      setGuides(g);
      setDragInfo({ dx, dy });
      setTemp(translateRefs(doc, d.refs, dx, dy));
      return;
    }
    // Nodo o manija.
    d.moved = true;
    let q = p;
    const g: Guide[] = [];
    if (useSnap && d.part === 'p') {
      const s = snapPoint(p, d.xs, d.ys, threshold);
      q = { x: s.x, y: s.y };
      if (s.span.x != null) g.push({ axis: 'x', x: s.span.x, y1: view.y, y2: view.y + view.h });
      if (s.span.y != null) g.push({ axis: 'y', y: s.span.y, x1: view.x, x2: view.x + view.w });
    }
    setGuides(g);
    setTemp(moveNodePart(doc, d.ref, d.part, q));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    setGuides([]);
    setDragInfo(null);
    if (!d) return;
    if (d.kind === 'pan') {
      // Un toque en el fondo (sin arrastrar) suelta la selección.
      if (!d.moved && tool !== 'mano' && !spaceDown.current) {
        if (selNode) setSelNode(null);
        else setSelection([]);
      }
      return;
    }
    if (d.kind === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (!d.moved || !m) {
        if (!d.additive) setSelection([]);
        return;
      }
      const hit = pieces.filter((pc) => boxesTouch(pc.bounds, m)).map(keyOf);
      setSelection(d.additive ? Array.from(new Set([...selKeys, ...hit])) : hit);
      if (hit.length) setNotice({ text: `${hit.length} pieza${hit.length === 1 ? '' : 's'} elegida${hit.length === 1 ? '' : 's'}.`, tone: 'ok' });
      return;
    }
    if (d.moved && temp) {
      const n = d.kind === 'move' ? selection.length : 0;
      commit(
        temp,
        d.kind === 'move'
          ? n > 1
            ? `${n} piezas movidas.`
            : 'Pieza movida.'
          : d.part === 'p'
            ? 'Nodo movido.'
            : 'Manija movida.',
      );
    } else {
      setTemp(null);
    }
  };

  // ------------------------------------------------------------ operaciones
  const num = (s: string) => Number(String(s).replace(',', '.'));
  const step = Math.max(0.001, num(stepMm) || 0.05);
  const nSel = selection.length;
  const what = nSel > 1 ? `${nSel} piezas` : 'Pieza';

  const nudge = (dxMm: number, dyMm: number) => {
    if (!nSel || !doc) return;
    commit(translateRefs(doc, selRefs, dxMm / k, dyMm / k), `${what} movida${nSel > 1 ? 's' : ''} ${mm(Math.hypot(dxMm, dyMm))} mm.`);
  };
  const scaleBy = (f: number) => {
    if (!nSel || !doc || !selBox || !(f > 0) || f === 1) return;
    commit(scaleRefs(doc, selRefs, f, selBox), `${what} al ${mm(f * 100, 1)} % de su tamaño.`);
  };
  const doOffset = (sign: 1 | -1) => {
    if (!nSel || !doc) return;
    const d = Math.abs(num(offsetMm)) * sign;
    if (!d) return;
    const r = offsetPieces(doc, selection, d, k);
    if (!r) {
      say('Afinar tanto hace desaparecer alguna pieza: probá con menos.');
      return;
    }
    commit(r.doc, sign > 0 ? `${what} engordada${nSel > 1 ? 's' : ''} ${mm(Math.abs(d))} mm.` : `${what} afinada${nSel > 1 ? 's' : ''} ${mm(Math.abs(d))} mm.`);
    // Las piezas nuevas quedan al final: se eligen solas.
    const fresh = computePieces(r.doc, tolUnits).filter((p) => p.refs[0].path >= r.firstNewPath);
    setSelection(fresh.map(keyOf));
  };
  const doAlign = (mode: AlignMode) => {
    if (nSel < 2 || !doc) return;
    const shifts = alignShifts(selection.map((p) => p.bounds), mode);
    let next = doc;
    selection.forEach((p, i) => {
      if (shifts[i].dx || shifts[i].dy) next = translateRefs(next, p.refs, shifts[i].dx, shifts[i].dy);
    });
    commit(next, `${nSel} piezas alineadas.`);
  };
  const doDistribute = (axis: 'x' | 'y') => {
    if (nSel < 3 || !doc) return;
    const shifts = distributeShifts(selection.map((p) => p.bounds), axis);
    let next = doc;
    selection.forEach((p, i) => {
      if (shifts[i].dx || shifts[i].dy) next = translateRefs(next, p.refs, shifts[i].dx, shifts[i].dy);
    });
    commit(next, `${nSel} piezas con el mismo espacio entre sí.`);
  };
  const doDeleteSelection = () => {
    if (!nSel || !doc) return;
    commit(removeRefs(doc, selRefs), `${what} borrada${nSel > 1 ? 's' : ''}. Ctrl+Z para recuperar${nSel > 1 ? 'las' : 'la'}.`);
    setSelection([]);
  };
  const doDeleteNode = () => {
    if (!selNode || !doc) return;
    commit(deleteNode(doc, selNode), 'Nodo borrado.');
    setSelNode(null);
  };
  const doRedundant = () => {
    if (!doc) return;
    const { doc: next, removed } = removeRedundant(doc, 0.002 / k, selRefs.length ? selRefs : undefined);
    if (!removed) {
      say('No hay nodos de más.', 'ok');
      return;
    }
    commit(next, `Se sacaron ${removed} nodos de más. La forma no cambió.`);
  };
  const doSimplify = () => {
    const r = simplified;
    if (!doc || !r) return;
    if (r.after >= r.before) {
      say('Ya está simple: con ese error no se pueden sacar más nodos.', 'ok');
      return;
    }
    commit(r.doc, `De ${r.before} a ${r.after} nodos (la forma cambia como mucho ${mm(num(tolMm), 3)} mm).`);
  };
  const doSpecks = () => {
    if (!doc || !motas.length) return;
    commit(removeRefs(doc, motas.flatMap((m) => m.refs)), `Se borraron ${motas.length} motas.`);
    setSelection([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      spaceDown.current = true;
      e.preventDefault();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelection(pieces.map(keyOf));
      setNotice({ text: `${pieces.length} piezas elegidas.`, tone: 'ok' });
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (selNode) setSelNode(null);
      else setSelection([]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (tool === 'nodos' && selNode) doDeleteNode();
      else if (nSel) doDeleteSelection();
      return;
    }
    const s = e.shiftKey ? step * 10 : step;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-s, 0],
      ArrowRight: [s, 0],
      ArrowUp: [0, -s],
      ArrowDown: [0, s],
    };
    if (dirs[e.key] && nSel) {
      e.preventDefault();
      nudge(...dirs[e.key]);
      return;
    }
    const key = e.key.toLowerCase();
    if (!mod && key === 'v') setTool('mover');
    if (!mod && key === 'a') setTool('nodos');
    if (!mod && key === 'h') setTool('mano');
    if (!mod && key === 'g') setSnapOn((v) => !v);
    if (key === '0') fitAll();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') spaceDown.current = false;
  };

  // ------------------------------------------------------------ render
  if (!built.ok) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border bg-muted/30 p-6 text-center text-sm">
        <AlertTriangle className="size-6 text-amber-500" />
        <p className="max-w-md">{built.error}</p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Volver al chequeo
        </Button>
      </div>
    );
  }

  const u = 1 / pxPerUnit; // 1 px de pantalla en unidades del dibujo
  const bAll = shown ? docBounds(shown, tolUnits) : null;
  const sizeNow = bAll ? { w: (bAll.maxX - bAll.minX) * k, h: (bAll.maxY - bAll.minY) * k } : null;
  const sizeBefore = { w: report.widthMm, h: report.heightMm };
  const sizeChanged = !!sizeNow && (Math.abs(sizeNow.w - sizeBefore.w) > 0.05 || Math.abs(sizeNow.h - sizeBefore.h) > 0.05);
  const liveProblems = live?.check ? liveGroups.length : null;
  const changes = idx;

  // Caja de lo elegido tal como se ve ahora (incluso mientras se arrastra).
  const shownSelBox = selBox && dragInfo ? shiftBox(selBox, dragInfo.dx, dragInfo.dy) : selBox;
  // Espacios a las vecinas (solo con lo elegido quieto o arrastrando, no en nodos).
  const gaps =
    shownSelBox && tool === 'mover'
      ? neighborGaps(
          shownSelBox,
          pieces.filter((p) => !selKeys.includes(keyOf(p))).map((p) => p.bounds),
        )
      : {};

  const hint =
    tool === 'mano'
      ? 'Arrastrá para moverte por el dibujo. Rueda: acercar o alejar.'
      : tool === 'nodos'
        ? !primary
          ? 'Tocá una pieza para ver sus nodos.'
          : !nodesTouchable
            ? 'Doble clic en la pieza (o rueda) para acercarte y poder tocar los nodos.'
            : selNode
              ? 'Arrastrá el nodo o sus manijas; se alinea con los otros nodos (Ctrl lo suelta). Supr lo borra.'
              : 'Tocá un nodo para elegirlo y ver sus manijas, o arrastralo directamente.'
        : dragging === 'move'
          ? 'Shift: solo en horizontal o vertical. Ctrl: sin imán.'
          : nSel
            ? 'Arrastrá para mover (se imanta a las otras piezas). Shift+clic suma o saca piezas. Flechas: mover un poco.'
            : 'Tocá una pieza para elegirla, o arrastrá en el fondo para elegir varias. Shift+clic suma piezas; Ctrl+A elige todo.';

  const toolBtn = (t: Tool, icon: ReactNode, label: string, key: string) => (
    <button
      type="button"
      title={`${label} (tecla ${key})`}
      onClick={() => setTool(t)}
      className={cn(
        'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs',
        tool === t ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );

  const cursor =
    dragging === 'pan'
      ? 'cursor-grabbing'
      : dragging === 'move' || dragging === 'node'
        ? 'cursor-move'
        : dragging === 'marquee'
          ? 'cursor-crosshair'
          : tool === 'mano'
            ? 'cursor-grab'
            : hovered || (hoverKey && selKeys.includes(hoverKey))
              ? tool === 'mover'
                ? 'cursor-move'
                : 'cursor-pointer'
              : tool === 'mover'
                ? 'cursor-crosshair'
                : 'cursor-default';

  const subsPath = (piece: EditPiece) =>
    piece.refs
      .map((r) => shown?.paths[r.path]?.subs[r.sub])
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map(subToD)
      .join('');

  /** Cota de un espacio: línea con la medida en mm. */
  const dimension = (x1: number, y1: number, x2: number, y2: number, valueMm: number, key: string) => (
    <g key={key}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0ea5e9" strokeWidth={u} strokeDasharray={`${2 * u} ${2 * u}`} />
      <text
        // Cota vertical: el número al costado; horizontal: arriba de la línea.
        x={x1 === x2 ? x1 + 4 * u : (x1 + x2) / 2}
        y={x1 === x2 ? (y1 + y2) / 2 : (y1 + y2) / 2 - 4 * u}
        textAnchor={x1 === x2 ? 'start' : 'middle'}
        dominantBaseline={x1 === x2 ? 'central' : 'auto'}
        fontSize={10 * u}
        fill="#0369a1"
        fontWeight={600}
        stroke="#fff"
        strokeWidth={3 * u}
        paintOrder="stroke"
      >
        {mm(valueMm)}
      </text>
    </g>
  );

  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:flex-row">
      {/* ---------------------------------------------------- lienzo */}
      <div className="flex h-[55vh] min-w-0 shrink-0 flex-col gap-2 md:h-auto md:min-h-[300px] md:flex-1 md:shrink">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
            {toolBtn('mover', <MousePointer2 className="size-3.5" />, 'Elegir y mover', 'V')}
            {toolBtn('nodos', <Spline className="size-3.5" />, 'Nodos', 'A')}
            {toolBtn('mano', <Hand className="size-3.5" />, 'Mano', 'H')}
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" className={iconBtn} disabled={idx === 0} onClick={undo} title="Deshacer (Ctrl+Z)">
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn}
              disabled={idx >= history.length - 1}
              onClick={redo}
              title="Rehacer (Ctrl+Y)"
            >
              <Redo2 className="size-3.5" />
            </button>
            <button type="button" className={iconBtn} onClick={fitAll} title="Ver todo el dibujo (tecla 0)">
              <Maximize2 className="size-3.5" />
            </button>
            <button
              type="button"
              className={cn(iconBtn, snapOn && 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300')}
              onClick={() => setSnapOn((v) => !v)}
              title={snapOn ? 'Guías e imán activados (tecla G para apagar)' : 'Guías e imán apagados (tecla G para prender)'}
              aria-pressed={snapOn}
            >
              <Magnet className="size-3.5" />
            </button>
          </div>
          <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Simula cómo talla la fresa (V-carve) y lo muestra con luz, como relieve">
            <Checkbox checked={showRelief} onCheckedChange={(v) => setShowRelief(Boolean(v))} />
            Relieve 3D
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={showZones} onCheckedChange={(v) => setShowZones(Boolean(v))} />
            Lugares
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={showAllNodes} onCheckedChange={(v) => setShowAllNodes(Boolean(v))} />
            Todos los nodos
          </label>
        </div>

        <div
          ref={hostRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => !drag.current && setHoverKey(null)}
          onDoubleClick={(e) => {
            const p = toUser(e.clientX, e.clientY);
            const pc = p ? pieceAt(pieces, p) : null;
            if (!pc) return;
            setSelection([keyOf(pc)]);
            zoomTo(pc.bounds, 0.6);
          }}
          className={cn(
            'relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-md border bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'bg-[length:20px_20px] bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)]',
            cursor,
          )}
        >
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full"
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {relief && dragging !== 'move' && dragging !== 'node' ? (
              <image
                href={relief.href}
                x={relief.x}
                y={relief.y}
                width={relief.w}
                height={relief.h}
                preserveAspectRatio="none"
                style={{ imageRendering: 'auto' }}
              />
            ) : (
              shown?.paths.map((p, pi) => (
                <path key={pi} d={p.subs.map(subToD).join('')} fill="#111" fillRule={p.fillRule} />
              ))
            )}

            {/* Lo que se va a agarrar (hover) y lo elegido */}
            {hovered ? (
              <path d={subsPath(hovered)} fill="#3b82f6" fillOpacity={0.25} fillRule="evenodd" style={{ pointerEvents: 'none' }} />
            ) : null}
            {selection.length && shownSelBox ? (
              <g style={{ pointerEvents: 'none' }}>
                {selection.map((pc) => (
                  <g key={keyOf(pc)}>
                    <path d={subsPath(pc)} fill="#2563eb" fillOpacity={0.35} fillRule="evenodd" />
                    <path d={subsPath(pc)} fill="none" stroke="#2563eb" strokeWidth={1.5 * u} />
                  </g>
                ))}
                <rect
                  x={shownSelBox.minX - 3 * u}
                  y={shownSelBox.minY - 3 * u}
                  width={shownSelBox.maxX - shownSelBox.minX + 6 * u}
                  height={shownSelBox.maxY - shownSelBox.minY + 6 * u}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={u}
                  strokeDasharray={`${4 * u} ${3 * u}`}
                />
                <text
                  x={shownSelBox.minX - 3 * u}
                  y={shownSelBox.minY - 6 * u}
                  fontSize={11 * u}
                  fill="#2563eb"
                  fontWeight={600}
                  stroke="#fff"
                  strokeWidth={3 * u}
                  paintOrder="stroke"
                >
                  {nSel > 1 ? `${nSel} piezas · ` : ''}
                  {mm((shownSelBox.maxX - shownSelBox.minX) * k)} × {mm((shownSelBox.maxY - shownSelBox.minY) * k)} mm
                  {dragInfo ? `  ·  ↔ ${mm(dragInfo.dx * k)}  ↕ ${mm(dragInfo.dy * k)} mm` : ''}
                </text>
              </g>
            ) : null}

            {/* Espacios a las piezas vecinas */}
            {shownSelBox && tool === 'mover' ? (
              <g style={{ pointerEvents: 'none' }}>
                {gaps.left != null && gaps.left > 0 && gaps.left * pxPerUnit > 8
                  ? dimension(shownSelBox.minX - gaps.left, (shownSelBox.minY + shownSelBox.maxY) / 2, shownSelBox.minX, (shownSelBox.minY + shownSelBox.maxY) / 2, gaps.left * k, 'l')
                  : null}
                {gaps.right != null && gaps.right > 0 && gaps.right * pxPerUnit > 8
                  ? dimension(shownSelBox.maxX, (shownSelBox.minY + shownSelBox.maxY) / 2, shownSelBox.maxX + gaps.right, (shownSelBox.minY + shownSelBox.maxY) / 2, gaps.right * k, 'r')
                  : null}
                {gaps.up != null && gaps.up > 0 && gaps.up * pxPerUnit > 8
                  ? dimension((shownSelBox.minX + shownSelBox.maxX) / 2, shownSelBox.minY - gaps.up, (shownSelBox.minX + shownSelBox.maxX) / 2, shownSelBox.minY, gaps.up * k, 'u')
                  : null}
                {gaps.down != null && gaps.down > 0 && gaps.down * pxPerUnit > 8
                  ? dimension((shownSelBox.minX + shownSelBox.maxX) / 2, shownSelBox.maxY, (shownSelBox.minX + shownSelBox.maxX) / 2, shownSelBox.maxY + gaps.down, gaps.down * k, 'd')
                  : null}
              </g>
            ) : null}

            {/* Lugares donde se pierde el diseño */}
            {showZones && live?.check ? (
              <g style={{ pointerEvents: 'none' }}>
                <g transform={`scale(${1 / k})`}>
                  {live.check.zones
                    .filter((z) => z.severity !== 'baja')
                    .map((z) => (
                      <path
                        key={z.id}
                        d={z.rings.map((r) => `M${r.map((q) => `${q.x} ${q.y}`).join('L')}Z`).join('')}
                        fill={SEVERITY_FILL[z.severity]}
                        fillOpacity={0.8}
                      />
                    ))}
                </g>
                {liveGroups.map((g, gi) => (
                  <g key={g.id} transform={`translate(${g.bounds.maxX / k} ${g.bounds.minY / k})`}>
                    <circle r={8 * u} fill={SEVERITY_FILL[g.severity]} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={10 * u} fontWeight={700} fill="#fff">
                      {gi + 1}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {/* Nodos */}
            {shown
              ? nodeRefs.map((r) => {
                  const sub = shown.paths[r.path]?.subs[r.sub];
                  if (!sub) return null;
                  if (!nodesTouchable) {
                    // Lejos: solo puntitos, para ver dónde hay muchos nodos.
                    return (
                      <g key={refKey(r)} style={{ pointerEvents: 'none' }}>
                        {sub.nodes.map((n, ni) => (
                          <circle
                            key={ni}
                            cx={n.p.x}
                            cy={n.p.y}
                            r={1.6 * u}
                            fill={extraKeys.has(`${r.path}:${r.sub}:${ni}`) ? '#f97316' : '#2563eb'}
                          />
                        ))}
                      </g>
                    );
                  }
                  return (
                    <g key={refKey(r)} style={{ pointerEvents: 'none' }}>
                      {sub.nodes.map((n, ni) => {
                        const ref = { ...r, node: ni };
                        const isSel = sameNode(selNode, ref);
                        const showHandles =
                          tool === 'nodos' && !!selNode && selNode.path === r.path && selNode.sub === r.sub && Math.abs(selNode.node - ni) <= 1;
                        const isExtra = extraKeys.has(`${r.path}:${r.sub}:${ni}`);
                        const s = (isSel ? 8 : 6) * u;
                        return (
                          <g key={ni}>
                            {showHandles
                              ? (['i', 'o'] as const).map((part) =>
                                  n[part] ? (
                                    <g key={part}>
                                      <line x1={n.p.x} y1={n.p.y} x2={n[part]!.x} y2={n[part]!.y} stroke="#64748b" strokeWidth={u} />
                                      <circle cx={n[part]!.x} cy={n[part]!.y} r={3.5 * u} fill="#fff" stroke="#2563eb" strokeWidth={1.4 * u} />
                                    </g>
                                  ) : null,
                                )
                              : null}
                            <rect
                              x={n.p.x - s / 2}
                              y={n.p.y - s / 2}
                              width={s}
                              height={s}
                              fill={isSel ? '#2563eb' : isExtra ? '#f97316' : '#fff'}
                              stroke={isExtra ? '#c2410c' : '#2563eb'}
                              strokeWidth={1.3 * u}
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })
              : null}

            {/* Guías del imán */}
            {guides.map((g, gi) =>
              g.axis === 'x' ? (
                <line key={gi} x1={g.x} y1={g.y1 - 4 * u} x2={g.x} y2={g.y2 + 4 * u} stroke={GUIDE_COLOR} strokeWidth={u} />
              ) : (
                <line key={gi} x1={g.x1 - 4 * u} y1={g.y} x2={g.x2 + 4 * u} y2={g.y} stroke={GUIDE_COLOR} strokeWidth={u} />
              ),
            )}

            {/* Rectángulo de selección */}
            {marquee ? (
              <rect
                x={marquee.minX}
                y={marquee.minY}
                width={marquee.maxX - marquee.minX}
                height={marquee.maxY - marquee.minY}
                fill="#3b82f6"
                fillOpacity={0.08}
                stroke="#3b82f6"
                strokeWidth={u}
                strokeDasharray={`${3 * u} ${2 * u}`}
              />
            ) : null}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/90 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground shadow-sm">
            {mm(view.w * k, view.w * k < 10 ? 1 : 0)} mm de ancho en pantalla
          </div>
        </div>

        {showRelief ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className="inline-block h-2.5 w-16 rounded-sm"
              style={{ background: 'linear-gradient(90deg, rgb(214,160,96), rgb(92,58,28))' }}
            />
            <span>
              Relieve simulado: bronce = arriba (lo que marca); más oscuro = más hondo, hasta{' '}
              {mm(report.profile.finalDepthMm, 1)} mm. Entre letras, si queda claro, la fresa no bajó.
              {!relief ? ' Calculando…' : ''}
            </span>
          </div>
        ) : null}
        <div className="flex shrink-0 items-start justify-between gap-2">
          <p className="min-h-[2.5em] text-xs leading-snug text-muted-foreground">{hint}</p>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowKeys((v) => !v)}
          >
            <Keyboard className="size-3.5" />
            Atajos
          </button>
        </div>
        {showKeys ? (
          <ul className="grid shrink-0 grid-cols-1 gap-x-4 gap-y-0.5 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
            <li>
              <b>V</b> elegir y mover · <b>A</b> nodos · <b>H</b> mano
            </li>
            <li>
              <b>Shift+clic</b> sumar o sacar · <b>Ctrl+A</b> todo · arrastrar en el fondo: varias
            </li>
            <li>
              <b>Flechas</b> mover ({mm(step)} mm; Shift ×10)
            </li>
            <li>
              Al arrastrar: <b>Shift</b> un solo eje · <b>Ctrl</b> sin imán · <b>G</b> imán sí/no
            </li>
            <li>
              <b>Espacio</b> + arrastrar: moverse · <b>Rueda</b> acercar · <b>0</b> ver todo
            </li>
            <li>
              <b>Doble clic</b> acercar a la pieza · <b>Esc</b> soltar
            </li>
            <li>
              <b>Supr</b> borrar nodo o piezas · <b>Ctrl+Z</b> / <b>Ctrl+Y</b> deshacer / rehacer
            </li>
          </ul>
        ) : null}
      </div>

      {/* ---------------------------------------------------- panel */}
      <aside className="flex w-full shrink-0 flex-col gap-2 text-sm md:w-[330px] md:overflow-y-auto">
        <div
          className={cn(
            'space-y-1.5 rounded-md border p-2.5 text-xs',
            liveProblems == null
              ? 'bg-muted/40'
              : liveProblems === 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
          )}
        >
          <p className="flex items-center gap-1.5 font-medium">
            {liveProblems == null ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : liveProblems === 0 ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <AlertTriangle className="size-3.5" />
            )}
            {liveProblems == null
              ? 'Chequeando la fresa…'
              : liveProblems === 0
                ? 'La fresa separa todo'
                : `${liveProblems} lugar${liveProblems === 1 ? '' : 'es'} donde se pierde el diseño`}
          </p>
          {liveGroups.length ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="opacity-80">Ir a:</span>
              {liveGroups.map((g, gi) => (
                <button
                  key={g.id}
                  type="button"
                  className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white hover:opacity-80"
                  style={{ background: SEVERITY_FILL[g.severity] }}
                  onClick={() => zoomTo({ minX: g.bounds.minX / k, minY: g.bounds.minY / k, maxX: g.bounds.maxX / k, maxY: g.bounds.maxY / k })}
                  title="Acercar a este lugar"
                >
                  {gi + 1}
                </button>
              ))}
            </div>
          ) : null}
          {sizeNow ? (
            <p className={cn(sizeChanged ? 'font-medium text-amber-700 dark:text-amber-300' : 'opacity-80')}>
              Medida del sello: {mm(sizeNow.w, 1)} × {mm(sizeNow.h, 1)} mm
              {sizeChanged ? ` · antes ${mm(sizeBefore.w, 1)} × ${mm(sizeBefore.h, 1)}` : ''}
            </p>
          ) : null}
        </div>

        {notice ? (
          <p
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs',
              notice.tone === 'ok' ? 'bg-muted/60' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
            )}
          >
            {notice.text}
          </p>
        ) : null}

        <Section
          title={nSel > 1 ? `${nSel} piezas elegidas` : nSel ? 'Pieza elegida' : 'Pieza'}
          extra={selBox ? `${mm((selBox.maxX - selBox.minX) * k)} × ${mm((selBox.maxY - selBox.minY) * k)} mm` : undefined}
        >
          {!nSel ? (
            <p className="text-xs text-muted-foreground">
              Tocá una pieza en el dibujo (una letra, el ícono). Para varias: arrastrá un rectángulo en el fondo o usá
              Shift+clic.
            </p>
          ) : (
            <div className="space-y-2">
              <Row label="Mover">
                <button type="button" className={iconBtn} onClick={() => nudge(-step, 0)} title="Izquierda">
                  <ArrowLeft className="size-3.5" />
                </button>
                <button type="button" className={iconBtn} onClick={() => nudge(0, -step)} title="Arriba">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" className={iconBtn} onClick={() => nudge(0, step)} title="Abajo">
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" className={iconBtn} onClick={() => nudge(step, 0)} title="Derecha">
                  <ArrowRight className="size-3.5" />
                </button>
                <select
                  className="h-7 rounded border bg-background px-1 text-xs"
                  value={stepMm}
                  onChange={(e) => setStepMm(e.target.value)}
                  title="Cuánto se mueve por toque"
                >
                  {['0.02', '0.05', '0.1', '0.5'].map((v) => (
                    <option key={v} value={v}>
                      {v.replace('.', ',')} mm
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Tamaño">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => scaleBy(0.99)}>
                  −1 %
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => scaleBy(1.01)}>
                  +1 %
                </Button>
                <input
                  className="h-7 w-14 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
                  inputMode="decimal"
                  value={scalePct}
                  onChange={(e) => setScalePct(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') scaleBy(num(scalePct) / 100);
                  }}
                  title="Porcentaje del tamaño actual (Enter para aplicar)"
                />
                <span className="text-xs text-muted-foreground">%</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => scaleBy(num(scalePct) / 100)}>
                  Aplicar
                </Button>
              </Row>
              <Row label="Grosor">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => doOffset(-1)} title="Offset interior: afina en paralelo">
                  Afinar
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => doOffset(1)} title="Offset exterior: engorda en paralelo">
                  Engordar
                </Button>
                <input
                  className="h-7 w-14 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
                  inputMode="decimal"
                  value={offsetMm}
                  onChange={(e) => setOffsetMm(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  title="Cuánto afinar o engordar (offset interior / exterior)"
                />
                <span className="text-xs text-muted-foreground">mm</span>
              </Row>
              {nSel > 1 ? (
                <>
                  <Row label="Alinear">
                    {(
                      [
                        ['left', AlignStartVertical, 'Bordes izquierdos'],
                        ['hcenter', AlignCenterVertical, 'Centros (en vertical)'],
                        ['right', AlignEndVertical, 'Bordes derechos'],
                        ['top', AlignStartHorizontal, 'Bordes de arriba'],
                        ['vcenter', AlignCenterHorizontal, 'Centros (en horizontal)'],
                        ['bottom', AlignEndHorizontal, 'Bordes de abajo (la base del renglón)'],
                      ] as const
                    ).map(([mode, Icon, label]) => (
                      <button key={mode} type="button" className={iconBtn} onClick={() => doAlign(mode)} title={`Alinear: ${label}`}>
                        <Icon className="size-3.5" />
                      </button>
                    ))}
                  </Row>
                  <Row label="Espaciar">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={nSel < 3}
                      onClick={() => doDistribute('x')}
                      title="Mismo espacio entre las piezas, de izquierda a derecha (las de los extremos no se mueven)"
                    >
                      <AlignHorizontalDistributeCenter className="mr-1 size-3.5" />
                      Parejo ↔
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={nSel < 3}
                      onClick={() => doDistribute('y')}
                      title="Mismo espacio entre las piezas, de arriba a abajo (las de los extremos no se mueven)"
                    >
                      <AlignVerticalDistributeCenter className="mr-1 size-3.5" />
                      Parejo ↕
                    </Button>
                  </Row>
                  {nSel < 3 ? <p className="text-[11px] text-muted-foreground">Para espaciar parejo hacen falta 3 piezas o más.</p> : null}
                </>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Tamaño: parejo, sin deformar{nSel > 1 ? ', todas juntas desde su centro' : ''}. Grosor: offset en paralelo
                (afinar = interior, engordar = exterior).
              </p>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={doDeleteSelection}>
                <Trash2 className="mr-1 size-3.5" />
                {nSel > 1 ? `Borrar ${nSel} piezas` : 'Borrar pieza'}
              </Button>
            </div>
          )}
        </Section>

        <Section
          title="Nodos"
          extra={nSel ? `${selNodes.toLocaleString('es-AR')} en lo elegido` : `${totalNodes.toLocaleString('es-AR')} en total`}
        >
          {tool === 'nodos' && selNode && selNodeData ? (
            <div className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1 text-xs">
              <span>
                Nodo elegido · {selNodeData.i || selNodeData.o ? (isSmooth(selNodeData) ? 'curva suave' : 'esquina con curva') : 'esquina'}
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={doDeleteNode}>
                <Trash2 className="mr-1 size-3" />
                Borrar
              </Button>
            </div>
          ) : tool !== 'nodos' ? (
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setTool('nodos')}>
              <Spline className="mr-1 size-3.5" />
              Editar nodos
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7" disabled={!extra.length} onClick={doRedundant}>
              {extra.length ? `Quitar ${extra.length} de más` : 'Sin nodos de más'}
            </Button>
            {extra.length ? <span className="text-[11px] text-orange-600">(en naranja)</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={!simplified || simplified.after >= simplified.before}
              onClick={doSimplify}
            >
              {simplified && simplified.after < simplified.before
                ? `Simplificar: ${simplified.before.toLocaleString('es-AR')} → ${simplified.after.toLocaleString('es-AR')} nodos`
                : 'Ya está simple'}
            </Button>
            <select
              className="h-7 rounded border bg-background px-1 text-xs"
              value={tolMm}
              onChange={(e) => setTolMm(e.target.value)}
              title="Cuánto puede cambiar la forma como máximo"
            >
              {['0.005', '0.01', '0.02', '0.05'].map((v) => (
                <option key={v} value={v}>
                  hasta {v.replace('.', ',')} mm
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {nSel ? 'Se aplica a lo elegido.' : 'Se aplica a todo el dibujo.'} «Simplificar» deja las rectas como rectas
            y las curvas con pocos nodos, y la forma cambia como mucho lo elegido. «Quitar de más» no la cambia nada.
          </p>
        </Section>

        {motas.length ? (
          <Section title="Limpieza">
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={doSpecks}>
              <Eraser className="mr-1 size-3.5" />
              Borrar {motas.length} mota{motas.length === 1 ? '' : 's'}
            </Button>
            <p className="text-[11px] text-muted-foreground">Piezas sueltas de menos de {mm(SPECK_MM2)} mm² (restos de la vectorización).</p>
          </Section>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            type="button"
            disabled={!changes || !doc}
            onClick={() => doc && onDone(serializeEditDoc(doc), changes)}
            title="Vuelve al chequeo con lo editado para compararlo y usarlo"
          >
            Terminar edición
          </Button>
          <Button type="button" variant="ghost" onClick={() => (changes ? setConfirmDiscard(true) : onCancel())}>
            {changes ? 'Descartar' : 'Volver'}
          </Button>
          {changes ? (
            <span className="text-[11px] text-muted-foreground">
              {changes} cambio{changes === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="¿Descartar lo editado?"
        description={`Hiciste ${changes} cambio${changes === 1 ? '' : 's'}. Si volvés ahora, se pierden.`}
        cancelLabel="Seguir editando"
        confirmLabel="Descartar"
        variant="destructive"
        onConfirm={onCancel}
      />
    </div>
  );
}
