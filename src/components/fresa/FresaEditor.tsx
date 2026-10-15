import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Eraser,
  Hand,
  Keyboard,
  Loader2,
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
/** Distancia mínima en pantalla entre nodos para poder tocarlos (px). */
const NODE_MIN_SPACING_PX = 9;

const refKey = (r: SubRef) => `${r.path}:${r.sub}`;
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
 * Editor manual del vector dentro del chequeo de fresa: mover, cambiar de
 * tamaño y de grosor una pieza, mover y borrar nodos, simplificar, borrar
 * motas. El chequeo de fresa se recalcula al soltar cada cambio.
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
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<NodeRef | null>(null);
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [stepMm, setStepMm] = useState('0.05');
  const [scalePct, setScalePct] = useState('100');
  const [offsetMm, setOffsetMm] = useState('0.05');
  const [tolMm, setTolMm] = useState('0.01');
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const spaceDown = useRef(false);

  const tolUnits = 0.004 / k; // aplanado para piezas y toques
  const pieces = useMemo(() => (shown ? computePieces(shown, tolUnits) : []), [shown, tolUnits]);
  const selected: EditPiece | null = useMemo(
    () => (selKey ? pieces.find((p) => refKey(p.refs[0]) === selKey) ?? null : null),
    [pieces, selKey],
  );
  const hovered = useMemo(
    () => (hoverKey && hoverKey !== selKey ? pieces.find((p) => refKey(p.refs[0]) === hoverKey) ?? null : null),
    [pieces, hoverKey, selKey],
  );

  // Chequeo en vivo (solo de lo confirmado, no mientras se arrastra).
  const docSvg = useMemo(() => (doc ? serializeEditDoc(doc) : null), [doc]);
  const target = useMemo(
    () => ({ mode: 'escala' as const, mmPerUnit: k, alimento: report.profile.id === 'alimento' }),
    [k, report.profile.id],
  );
  const live = useFresaReport(docSvg, target);
  const liveGroups = useMemo(
    () => (live?.check?.groups ?? []).filter((g) => g.severity !== 'baja'),
    [live],
  );

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
  const base = useMemo<Box>(() => {
    const b = built.ok ? docBounds(built.doc, tolUnits) : null;
    if (!b) return report.viewBox;
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
  }, [built, tolUnits, report.viewBox]);
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
  const zoomTo = (b: { minX: number; minY: number; maxX: number; maxY: number }, padMm = 1.5) => {
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

  // ------------------------------------------------------------ nodos
  const nodeRefs = useMemo(() => {
    if (!shown) return [] as SubRef[];
    if (showAllNodes) return shown.paths.flatMap((p, pi) => p.subs.map((_, si) => ({ path: pi, sub: si })));
    return tool === 'nodos' && selected ? selected.refs : [];
  }, [shown, showAllNodes, selected, tool]);
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
    () => (shown ? redundantNodes(shown, 0.002 / k, selected ? selected.refs : undefined) : []),
    [shown, selected, k],
  );
  const extraKeys = useMemo(() => new Set(extra.map((n) => `${n.path}:${n.sub}:${n.node}`)), [extra]);
  const totalNodes = shown ? countNodes(shown) : 0;
  const pieceNodes = shown && selected ? countNodes(shown, selected.refs) : 0;
  const motas = useMemo(() => specks(pieces, SPECK_MM2, k), [pieces, k]);
  const selNodeData = selNode && shown ? shown.paths[selNode.path]?.subs[selNode.sub]?.nodes[selNode.node] : undefined;

  // ------------------------------------------------------------ arrastre
  type Drag =
    | { kind: 'pan'; x: number; y: number; view: Box; moved: boolean }
    | { kind: 'piece'; start: Pt; refs: SubRef[]; moved: boolean }
    | { kind: 'node'; ref: NodeRef; part: NodePart; moved: boolean };
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
          // Las manijas ganan si están igual de cerca (quedan encima del nodo).
          const score = part === 'p' ? d : d * 0.8;
          if (d <= r && (!best || score < best.d)) best = { ref: { ...s, node: ni }, part, d: score };
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
    const panning = tool === 'mano' || spaceDown.current || e.button === 1 || e.button === 2 || e.altKey;
    if (!panning && tool === 'nodos' && selected) {
      const h = hitNode(p);
      if (h) {
        setSelNode(h.ref);
        drag.current = { kind: 'node', ref: h.ref, part: h.part, moved: false };
        setDragging('node');
        return;
      }
    }
    if (!panning) {
      const pc = pieceAt(pieces, p);
      if (pc) {
        const key = refKey(pc.refs[0]);
        if (key !== selKey) setSelNode(null);
        setSelKey(key);
        if (tool === 'mover') {
          drag.current = { kind: 'piece', start: p, refs: pc.refs, moved: false };
          setDragging('piece');
          return;
        }
      }
    }
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, view, moved: false };
    setDragging('pan');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      // Resaltar lo que se va a agarrar.
      if (tool === 'mano' || !doc) return;
      const p = toUser(e.clientX, e.clientY);
      const pc = p ? pieceAt(pieces, p) : null;
      const key = pc ? refKey(pc.refs[0]) : null;
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
    setDragging(null);
    if (!d) return;
    if (d.kind === 'pan') {
      // Un toque en el fondo (sin arrastrar) suelta la selección.
      if (!d.moved && tool !== 'mano' && !spaceDown.current) {
        if (selNode) setSelNode(null);
        else setSelKey(null);
      }
      return;
    }
    if (d.moved && temp) {
      commit(temp, d.kind === 'piece' ? 'Pieza movida.' : d.part === 'p' ? 'Nodo movido.' : 'Manija movida.');
    } else {
      setTemp(null);
    }
  };

  // ------------------------------------------------------------ operaciones
  const num = (s: string) => Number(String(s).replace(',', '.'));
  const step = Math.max(0.001, num(stepMm) || 0.05);

  const nudge = (dxMm: number, dyMm: number) => {
    if (!selected || !doc) return;
    commit(translateRefs(doc, selected.refs, dxMm / k, dyMm / k), `Pieza movida ${mm(Math.hypot(dxMm, dyMm))} mm.`);
  };
  const scaleBy = (f: number) => {
    if (!selected || !doc || !(f > 0) || f === 1) return;
    commit(scaleRefs(doc, selected.refs, f, selected.bounds), `Pieza al ${mm(f * 100, 1)} % de su tamaño.`);
  };
  const doOffset = (sign: 1 | -1) => {
    if (!selected || !doc) return;
    const d = Math.abs(num(offsetMm)) * sign;
    if (!d) return;
    const next = offsetPiece(doc, selected, d, k);
    if (!next) {
      say('Afinar tanto hace desaparecer la pieza: probá con menos.');
      return;
    }
    commit(next, sign > 0 ? `Pieza engordada ${mm(Math.abs(d))} mm.` : `Pieza afinada ${mm(Math.abs(d))} mm.`);
    // La pieza nueva queda al final: se elige sola.
    setSelKey(`${next.paths.length - 1}:0`);
    setSelNode(null);
  };
  const doDeletePiece = () => {
    if (!selected || !doc) return;
    commit(removeRefs(doc, selected.refs), 'Pieza borrada. Ctrl+Z para recuperarla.');
    setSelKey(null);
    setSelNode(null);
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
      say('No hay nodos de más.', 'ok');
      return;
    }
    commit(next, `Se sacaron ${removed} nodos de más. La forma no cambió.`);
  };
  const doSimplify = () => {
    if (!doc) return;
    const tol = Math.max(0.001, num(tolMm)) / k;
    const r = simplifyDoc(doc, tol, selected?.refs);
    if (r.after >= r.before) {
      say('Ya está simple: con ese error no se pueden sacar más nodos.', 'ok');
      return;
    }
    commit(r.doc, `De ${r.before} a ${r.after} nodos (la forma cambia como mucho ${mm(num(tolMm), 3)} mm).`);
  };
  const doSpecks = () => {
    if (!doc || !motas.length) return;
    commit(removeRefs(doc, motas.flatMap((m) => m.refs)), `Se borraron ${motas.length} motas.`);
    setSelKey(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      spaceDown.current = true;
      e.preventDefault();
      return;
    }
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
    if (e.key === 'Escape') {
      e.preventDefault();
      if (selNode) setSelNode(null);
      else setSelKey(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (tool === 'nodos' && selNode) doDeleteNode();
      else if (selected) doDeletePiece();
      return;
    }
    const s = e.shiftKey ? step * 10 : step;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-s, 0],
      ArrowRight: [s, 0],
      ArrowUp: [0, -s],
      ArrowDown: [0, s],
    };
    if (dirs[e.key] && selected) {
      e.preventDefault();
      nudge(...dirs[e.key]);
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'v') setTool('mover');
    if (key === 'a') setTool('nodos');
    if (key === 'h') setTool('mano');
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

  const hint =
    tool === 'mano'
      ? 'Arrastrá para moverte por el dibujo. Rueda: acercar o alejar.'
      : tool === 'nodos'
        ? !selected
          ? 'Tocá una pieza para ver sus nodos.'
          : !nodesTouchable
            ? 'Doble clic en la pieza (o rueda) para acercarte y poder tocar los nodos.'
            : selNode
              ? 'Arrastrá el nodo (cuadrado) o sus manijas (círculos). Supr lo borra. Esc lo suelta.'
              : 'Tocá un nodo para elegirlo y ver sus manijas, o arrastralo directamente.'
        : selected
          ? 'Arrastrá la pieza para moverla, o usá las flechas. Tocá el fondo para soltarla.'
          : 'Tocá una pieza (una letra, el ícono) para elegirla; doble clic la acerca. Arrastrá el fondo para moverte; rueda para acercar.';

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
      : dragging
        ? 'cursor-move'
        : tool === 'mano'
          ? 'cursor-grab'
          : hovered || (selected && hoverKey === selKey)
            ? tool === 'mover'
              ? 'cursor-move'
              : 'cursor-pointer'
            : 'cursor-default';

  const subsPath = (piece: EditPiece) =>
    piece.refs
      .map((r) => shown?.paths[r.path]?.subs[r.sub])
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map(subToD)
      .join('');

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
          </div>
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
            setSelKey(refKey(pc.refs[0]));
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
            {shown?.paths.map((p, pi) => (
              <path key={pi} d={p.subs.map(subToD).join('')} fill="#111" fillRule={p.fillRule} />
            ))}

            {/* Lo que se va a agarrar (hover) y lo elegido */}
            {hovered ? (
              <path d={subsPath(hovered)} fill="#3b82f6" fillOpacity={0.25} fillRule="evenodd" style={{ pointerEvents: 'none' }} />
            ) : null}
            {selected ? (
              <g style={{ pointerEvents: 'none' }}>
                <path d={subsPath(selected)} fill="#2563eb" fillOpacity={0.35} fillRule="evenodd" />
                <path d={subsPath(selected)} fill="none" stroke="#2563eb" strokeWidth={1.5 * u} />
                <rect
                  x={selected.bounds.minX - 3 * u}
                  y={selected.bounds.minY - 3 * u}
                  width={selected.bounds.maxX - selected.bounds.minX + 6 * u}
                  height={selected.bounds.maxY - selected.bounds.minY + 6 * u}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={u}
                  strokeDasharray={`${4 * u} ${3 * u}`}
                />
                <text
                  x={selected.bounds.minX - 3 * u}
                  y={selected.bounds.minY - 6 * u}
                  fontSize={11 * u}
                  fill="#2563eb"
                  fontWeight={600}
                >
                  {mm((selected.bounds.maxX - selected.bounds.minX) * k)} × {mm((selected.bounds.maxY - selected.bounds.minY) * k)} mm
                </text>
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
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/90 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground shadow-sm">
            {mm(view.w * k, view.w * k < 10 ? 1 : 0)} mm de ancho en pantalla
          </div>
        </div>

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
          <ul className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-0.5 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
            <li>
              <b>V</b> elegir y mover · <b>A</b> nodos · <b>H</b> mano
            </li>
            <li>
              <b>Flechas</b> mover la pieza ({mm(step)} mm; Shift ×10)
            </li>
            <li>
              <b>Espacio</b> + arrastrar: moverse por el dibujo
            </li>
            <li>
              <b>Rueda</b> acercar · <b>Doble clic</b> acercar a la pieza · <b>0</b> ver todo
            </li>
            <li>
              <b>Supr</b> borrar nodo o pieza · <b>Esc</b> soltar
            </li>
            <li>
              <b>Ctrl+Z</b> deshacer · <b>Ctrl+Y</b> rehacer
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
          title={selected ? 'Pieza elegida' : 'Pieza'}
          extra={selected ? `${mm((selected.bounds.maxX - selected.bounds.minX) * k)} × ${mm((selected.bounds.maxY - selected.bounds.minY) * k)} mm` : undefined}
        >
          {!selected ? (
            <p className="text-xs text-muted-foreground">Tocá una pieza en el dibujo (una letra, el ícono) para moverla o cambiarla.</p>
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
              <p className="text-[11px] text-muted-foreground">
                Tamaño: parejo, sin deformar. Grosor: offset en paralelo (afinar = interior, engordar = exterior).
              </p>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={doDeletePiece}>
                <Trash2 className="mr-1 size-3.5" />
                Borrar pieza
              </Button>
            </div>
          )}
        </Section>

        <Section
          title="Nodos"
          extra={selected ? `${pieceNodes.toLocaleString('es-AR')} en la pieza` : `${totalNodes.toLocaleString('es-AR')} en total`}
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
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={doSimplify}>
              Simplificar curvas
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
            {selected ? 'Se aplica a la pieza elegida.' : 'Se aplica a todo el dibujo.'} «Quitar de más» no cambia la forma;
            «Simplificar» la cambia como mucho lo elegido.
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
