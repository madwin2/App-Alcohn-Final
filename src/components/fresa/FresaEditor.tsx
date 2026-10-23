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
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Focus,
  Hand,
  Link2,
  Link2Off,
  Keyboard,
  Loader2,
  Magnet,
  Maximize2,
  MousePointer,
  MousePointer2,
  PenTool,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Spline,
  Square,
  Circle,
  Trash2,
  Undo2,
  ZoomIn,
  Slice,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { cn } from '@/lib/utils/cn';
import type { FresaReport } from '@/lib/fresa/chequeoFresa';
import type { EditorLogEntry } from '@/lib/fresa/fix';
import { useFresaReport } from '@/lib/fresa/useFresaReport';
import { copyRefs, cornerInfo, internalCorners, mapRefs, mirrorRefs, pasteClip, rotateRefs, roundCorner, roundCorners, type VectorClip } from '@/lib/fresa/editCorners';
import {
  addShape,
  booleanPieces,
  buildEditDoc,
  computePieces,
  countNodes,
  deleteNode,
  deleteNodes,
  docBounds,
  insertNode,
  isSmooth,
  knifeCut,
  moveNodePart,
  nearestSegment,
  offsetPieces,
  scaleRefsAt,
  setNodeCorner,
  setNodeSmooth,
  pieceAt,
  redundantNodes,
  removeRedundant,
  removeRefs,
  scaleRefs,
  serializeEditDoc,
  simplifyDoc,
  specks,
  subToD,
  translateNodes,
  translateRefs,
  unionPieces,
  type BooleanOp,
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
  spreadAxis,
  spreadGroups,
  spreadShifts,
  type SpreadAnchor,
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
import {
  alignOriginal,
  compararConDoc,
  resumenDiferencias,
  textoDiferencia,
  type ComparacionOriginal,
  type Diferencia,
  type Placement,
} from '@/lib/vectorizacion/comparacionOriginal';
import { cargarOriginal, ORIGINAL_COLOR, type OriginalCargado, type OriginalSource } from '@/lib/vectorizacion/originalOverlay';

interface Props {
  /** SVG de partida (el original o el corregido). */
  svgText: string;
  /** Reporte del original: escala (mm por unidad) y perfil de fresa. */
  report: FresaReport;
  /** `extra`: registro de lo que se hizo y segundos de edición (se guardan en `vector_ediciones`). */
  onDone: (svg: string, cambios: number, extra: { registro: EditorLogEntry[]; segundos: number }) => void;
  onCancel: () => void;
  /**
   * Imagen original (la que se vectorizó). Si está, se puede ver debajo del
   * vector en otro color y se marca lo que falta o sobra respecto de ella.
   */
  original?: OriginalSource | null;
}

/** Color de las marcas de lo que sobra (lo que falta usa el color del original). */
const SOBRA_COLOR = '#0284c7';

/** Herramienta del clic izquierdo (barra de la izquierda, como en Illustrator). */
type Tool =
  | 'mover'
  | 'nodos'
  | 'sumarNodo'
  | 'restarNodo'
  | 'convertir'
  | 'rect'
  | 'elipse'
  | 'cuchillo'
  | 'girar'
  | 'medir'
  | 'mano'
  | 'zoom';

/** Herramientas que muestran y tocan nodos. */
const NODE_TOOLS = new Set<Tool>(['nodos', 'sumarNodo', 'restarNodo', 'convertir']);

const TOOL_NAME: Record<Tool, string> = {
  mover: 'Selección',
  nodos: 'Selección directa',
  sumarNodo: 'Añadir nodo',
  restarNodo: 'Eliminar nodo',
  convertir: 'Convertir nodo',
  rect: 'Rectángulo',
  elipse: 'Elipse',
  cuchillo: 'Cuchillo',
  girar: 'Girar',
  medir: 'Medir',
  mano: 'Mano',
  zoom: 'Zoom',
};

/** Ícono de buscatrazos: dos cuadrados que se pisan, con la parte que queda en negro. */
function PathfinderIcon({ op }: { op: 'unir' | BooleanOp }) {
  const a = 'M2 2h8v8H2z';
  const b = 'M6 6h8v8H6z';
  const both = 'M6 6h4v4H6z';
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      {op === 'unir' ? <path d={`${a}${b}`} fill="currentColor" /> : null}
      {op === 'restar' ? (
        <>
          <path d="M2 2h8v4H6v4H2z" fill="currentColor" />
          <path d={b} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="1.5 1" />
        </>
      ) : null}
      {op === 'intersecar' ? (
        <>
          <path d={`${a}${b}`} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="1.5 1" />
          <path d={both} fill="currentColor" />
        </>
      ) : null}
      {op === 'excluir' ? <path d={`${a}${b}`} fill="currentColor" fillRule="evenodd" /> : null}
      {op === 'dividir' ? (
        <>
          <path d="M2 2h8v4H6v4H2z" fill="currentColor" />
          <path d="M10 6h4v8H6v-4h4z" fill="currentColor" />
          <path d={both} fill="currentColor" opacity={0.45} />
          <path d={`${a}${b}`} fill="none" stroke="hsl(var(--background))" strokeWidth={0.8} />
        </>
      ) : null}
    </svg>
  );
}

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
/**
 * Lo copiado en cualquier editor de vectores de la app: se puede pegar en
 * otro sello (se reescala a su medida en mm).
 */
let editorClipboard: VectorClip | null = null;
/** De qué dibujo se copió (para saber si se pega en otro sello). */
let clipboardSource: string | null = null;
/** Pegadas seguidas de lo mismo: cada una se corre un poco más (no quedan apiladas). */
let pasteCount = 0;
/** Radios para redondear vértices (mm). */
const ROUND_OPTIONS = ['0.05', '0.1', '0.2', '0.3', '0.5', '1'];
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
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Todos los contornos del dibujo (para cambiar la medida o girar el diseño entero). */
const allRefs = (d: EditDoc): SubRef[] => d.paths.flatMap((p, path) => p.subs.map((_, sub) => ({ path, sub })));

const iconBtn =
  'inline-flex size-7 items-center justify-center rounded border bg-background text-foreground hover:bg-muted disabled:opacity-40';

/**
 * Editor manual del vector dentro del chequeo de fresa: elegir una o varias
 * piezas, moverlas (con imán y guías), cambiarles el tamaño y el grosor,
 * alinearlas y distribuirlas, mover y borrar nodos, simplificar, borrar motas.
 * El chequeo de fresa se recalcula al soltar cada cambio.
 */
export function FresaEditor({ svgText, report, onDone, onCancel, original = null }: Props) {
  const k = report.mmPerUnit;
  const built = useMemo(() => buildEditDoc(svgText), [svgText]);
  const [history, setHistory] = useState<EditDoc[]>(() => (built.ok ? [built.doc] : []));
  const [idx, setIdx] = useState(0);
  const doc = history[idx] ?? null;
  const [temp, setTemp] = useState<EditDoc | null>(null);
  const shown = temp ?? doc;

  const [tool, setToolState] = useState<Tool>('mover');
  const nodeTool = NODE_TOOLS.has(tool);
  /** Lo que se midió con «Medir» (queda a la vista hasta otro clic o cambiar de herramienta). */
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt } | null>(null);
  /** Grados mientras se gira con la herramienta «Girar». */
  const [rotateInfo, setRotateInfo] = useState<number | null>(null);
  /** «Añadir nodo»: dónde caería el nodo nuevo (sobre el tramo bajo el mouse). */
  const [segHover, setSegHover] = useState<Pt | null>(null);
  /** Línea del cuchillo mientras se arrastra. */
  const [knifeLine, setKnifeLine] = useState<{ a: Pt; b: Pt } | null>(null);
  /** Piezas elegidas (clave de su contorno de afuera); la primera es la "principal". */
  const [selKeys, setSelKeys] = useState<string[]>([]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  /** Nodos elegidos (Shift suma); el último es el "activo": muestra manijas y se redondea. */
  const [nodeSel, setNodeSel] = useState<NodeRef[]>([]);
  const selNode: NodeRef | null = nodeSel[nodeSel.length - 1] ?? null;
  const setSelNode = (r: NodeRef | null) => setNodeSel(r ? [r] : []);
  const setTool = (t: Tool) => {
    setToolState(t);
    setMeasure(null);
    setSegHover(null);
  };
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showRelief, setShowRelief] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [stepMm, setStepMm] = useState('0.05');
  const [scalePct, setScalePct] = useState('100');
  const [offsetMm, setOffsetMm] = useState('0.05');
  const [tolMm, setTolMm] = useState('0.01');
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn'; id: number } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragInfo, setDragInfo] = useState<{ dx: number; dy: number } | null>(null);
  const [marquee, setMarquee] = useState<DocBox | null>(null);
  const spaceDown = useRef(false);
  /** Menú del clic derecho (posición dentro del lienzo y sobre qué se abrió). */
  const [menu, setMenu] = useState<{ x: number; y: number; target: 'pieza' | 'nodo' | 'fondo' } | null>(null);
  const colRef = useRef<HTMLDivElement>(null);
  /** Escala mientras se arrastra un tirador (para mostrar el %). */
  const [scaleInfo, setScaleInfo] = useState<number | null>(null);
  const [hoverHandle, setHoverHandle] = useState<number | null>(null);
  /** Radio para redondear vértices (mm) y el que se ve mientras se arrastra el círculo. */
  const [roundMm, setRoundMm] = useState('0.2');
  const [angleDeg, setAngleDeg] = useState('90');
  /** Distanciar: cuánto (mm), desde dónde y si las letras de una palabra van juntas. */
  const [spreadMm, setSpreadMm] = useState('0.5');
  const [spreadAnchor, setSpreadAnchor] = useState<SpreadAnchor>('start');
  const [spreadWords, setSpreadWords] = useState(true);
  const [roundInfo, setRoundInfo] = useState<number | null>(null);
  /** Marcar los vértices internos de lo elegido (al pasar por el botón). */
  const [showInner, setShowInner] = useState(false);
  /** Se toca al copiar: el portapapeles es del módulo y no hace re-render solo. */
  const [, setClipTick] = useState(0);
  /** Medida exacta del diseño entero (mm), si respeta la proporción, y giro libre. */
  const [sizeW, setSizeW] = useState('');
  const [sizeH, setSizeH] = useState('');
  const [sizeLock, setSizeLock] = useState(true);
  const [allAngle, setAllAngle] = useState('0');
  const [allAngleText, setAllAngleText] = useState('15');

  const tolUnits = 0.004 / k; // aplanado para piezas y toques
  const pieces = useMemo(() => (shown ? computePieces(shown, tolUnits) : []), [shown, tolUnits]);
  const byKey = useMemo(() => new Map(pieces.map((p) => [keyOf(p), p])), [pieces]);
  const selection = useMemo(
    () => selKeys.map((key) => byKey.get(key)).filter((p): p is EditPiece => !!p),
    [selKeys, byKey],
  );
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
    () => ({ mode: 'escala' as const, mmPerUnit: k, alimento: report.target.alimento, stampType: report.target.stampType }),
    [k, report.target.alimento, report.target.stampType],
  );
  const fresh = useFresaReport(docSvg, target);
  // Caja del dibujo confirmado: la medida que se ve en «Diseño entero».
  const docBox = useMemo(() => (doc ? docBounds(doc, tolUnits) : null), [doc, tolUnits]);
  const docMm = docBox ? { w: (docBox.maxX - docBox.minX) * k, h: (docBox.maxY - docBox.minY) * k } : null;
  useEffect(() => {
    if (!docBox) return;
    setSizeW(mm((docBox.maxX - docBox.minX) * k));
    setSizeH(mm((docBox.maxY - docBox.minY) * k));
  }, [docBox, k]);
  // Mientras se re-chequea se sigue mostrando el último resultado (sin
  // "Chequeando…" que cambie el alto del panel y corra los botones).
  const [lastLive, setLastLive] = useState<FresaReport | null>(null);
  useEffect(() => {
    if (fresh) setLastLive(fresh);
  }, [fresh]);
  const live = fresh ?? lastLive;
  const checking = !fresh;
  const liveGroups = useMemo(() => (live?.check?.groups ?? []).filter((g) => g.severity !== 'baja'), [live]);

  // Aviso flotante sobre el dibujo (no ocupa lugar en el panel: no corre nada).
  const noticeId = useRef(0);
  const showNotice = useCallback((text: string, tone: 'ok' | 'warn') => {
    noticeId.current += 1;
    setNotice({ text, tone, id: noticeId.current });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.tone === 'warn' ? 5000 : 2200);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Registro de lo que se hace (para aprender de las ediciones; ver PLAN_CORRECCION_AUTONOMA_VECTORES).
  const openedAt = useRef(Date.now());
  const editLog = useRef<EditorLogEntry[]>([]);
  const logAction = (accion: string) => {
    editLog.current.push({
      s: Math.round((Date.now() - openedAt.current) / 1000),
      herramienta: tool,
      piezas: selKeys.length,
      nodos: nodeSel.length,
      accion,
    });
  };
  const commit = (next: EditDoc, text?: string, tone: 'ok' | 'warn' = 'ok') => {
    const nh = [...history.slice(0, idx + 1), next].slice(-80);
    setHistory(nh);
    setIdx(nh.length - 1);
    setTemp(null);
    logAction(text ?? 'Cambio');
    if (text) showNotice(text, tone);
  };
  const say = (text: string, tone: 'ok' | 'warn' = 'warn') => showNotice(text, tone);
  const undo = () => {
    if (idx === 0) return;
    setIdx(idx - 1);
    setTemp(null);
    setSelNode(null);
    logAction('Deshecho.');
    showNotice('Deshecho.', 'ok');
  };
  const redo = () => {
    if (idx >= history.length - 1) return;
    setIdx(idx + 1);
    setTemp(null);
    setSelNode(null);
    logAction('Rehecho.');
    showNotice('Rehecho.', 'ok');
  };

  // ------------------------------------------------------------ vista
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1.4);
  // El dibujo como está ahora (si se agrandó o giró, «Ver todo» lo encuadra entero).
  const designBox = docBox;
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
  /** Acercar (f < 1) o alejar (f > 1) desde el centro de lo que se ve. */
  const zoomBy = (f: number) =>
    setView((v) => {
      const w = Math.min(base.w * 4, Math.max(0.8 / k, v.w * f));
      const h = w / aspect;
      return { x: v.x + v.w / 2 - w / 2, y: v.y + v.h / 2 - h / 2, w, h };
    });
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

  // ------------------------------------------------------------ original debajo
  // Se alinea una vez con el vector de partida; después se compara cada
  // versión (al soltar cada cambio) para marcar lo que falta o sobra.
  const [orig, setOrig] = useState<OriginalCargado | null>(null);
  const [origError, setOrigError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showDiffs, setShowDiffs] = useState(true);
  const [origOpacity, setOrigOpacity] = useState(0.6);
  useEffect(() => {
    setOrig(null);
    setOrigError(null);
    if (!original) return;
    let alive = true;
    cargarOriginal(original).then(
      (o) => alive && setOrig(o),
      (e: unknown) => alive && setOrigError(e instanceof Error ? e.message : 'No se pudo cargar el original.'),
    );
    return () => {
      alive = false;
    };
  }, [original]);
  const placement = useMemo<Placement | null>(() => (orig && built.ok ? alignOriginal(orig.ink, built.doc) : null), [orig, built]);
  const [comparison, setComparison] = useState<ComparacionOriginal | null>(null);
  useEffect(() => {
    if (!orig || !doc) return;
    const t = window.setTimeout(() => setComparison(compararConDoc(orig.ink, doc, k, placement)), 300);
    return () => window.clearTimeout(t);
  }, [orig, placement, doc, k]);
  const diffs: Diferencia[] = comparison?.diferencias ?? [];

  // ------------------------------------------------------------ nodos
  const nodeRefs = useMemo(() => {
    if (!shown) return [] as SubRef[];
    if (showAllNodes) return shown.paths.flatMap((p, pi) => p.subs.map((_, si) => ({ path: pi, sub: si })));
    // Con las herramientas de nodos: los de lo elegido y los de la pieza bajo
    // el mouse (como la selección directa de Illustrator).
    if (!nodeTool) return [];
    return hovered ? [...selRefs, ...hovered.refs] : selRefs;
  }, [shown, showAllNodes, nodeTool, selRefs, hovered]);
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
  // Cuántos nodos quedarían al simplificar (para mostrarlo debajo del botón).
  // Se calcula un rato después del último cambio: así cada clic responde al
  // instante aunque el dibujo tenga muchos nodos.
  const [simplified, setSimplified] = useState<ReturnType<typeof simplifyDoc> | null>(null);
  useEffect(() => {
    setSimplified(null);
    if (!doc) return;
    const t = window.setTimeout(() => {
      const tol = Math.max(0.001, Number(tolMm.replace(',', '.'))) / k;
      setSimplified(simplifyDoc(doc, tol, selRefs.length ? selRefs : undefined));
    }, 350);
    return () => window.clearTimeout(t);
  }, [doc, tolMm, k, selRefs]);
  const extraKeys = useMemo(() => new Set(extra.map((n) => `${n.path}:${n.sub}:${n.node}`)), [extra]);
  const totalNodes = shown ? countNodes(shown) : 0;
  const selNodes = shown && selRefs.length ? countNodes(shown, selRefs) : 0;
  const motas = useMemo(() => specks(pieces, SPECK_MM2, k), [pieces, k]);
  const selNodeData = selNode && shown ? shown.paths[selNode.path]?.subs[selNode.sub]?.nodes[selNode.node] : undefined;
  /** El nodo elegido como vértice (se puede redondear). */
  const selCorner = useMemo(() => (tool === 'nodos' && selNode && doc ? cornerInfo(doc, selNode) : null), [tool, selNode, doc]);
  /** Vértices internos (punta blanca, donde la fresa no entra) de lo elegido. */
  const innerCorners = useMemo(
    () => (doc && tool === 'mover' && selection.length ? internalCorners(doc, selection, tolUnits) : []),
    [doc, tool, selection, tolUnits],
  );

  // ------------------------------------------------------------ arrastre
  //
  // Mouse (como en Illustrator; el izquierdo depende de la herramienta de la barra):
  //   Selección  clic elige · arrastrar mueve · arrastrar en el fondo (o adentro
  //              de un aro) elige varias · tiradores de las esquinas: escalar
  //              doble clic en una pieza: selección directa (sus nodos)
  //   Directa    arrastrar un nodo lo mueve · arrastrar en cualquier otro lado:
  //              rectángulo que elige nodos (de todas las piezas que toca)
  //   rueda      girar: acercar / alejar · apretada y arrastrar: moverse
  //   derecho    menú con lo que se puede hacer ahí
  //   Espacio + arrastrar: moverse (para mouse sin rueda o touchpad)
  type Drag =
    | { kind: 'pan'; x: number; y: number; view: Box; moved: boolean }
    | { kind: 'zoom'; start: Pt; out: boolean; moved: boolean }
    | { kind: 'shape'; shape: 'rect' | 'ellipse'; start: Pt; moved: boolean }
    | { kind: 'rotate'; center: Pt; a0: number; moved: boolean }
    | { kind: 'measure'; start: Pt; moved: boolean }
    | { kind: 'knife'; start: Pt; moved: boolean }
    | { kind: 'move'; start: Pt; refs: SubRef[]; box: DocBox; others: DocBox[]; moved: boolean }
    | { kind: 'marquee'; start: Pt; additive: boolean; moved: boolean; nodes?: boolean }
    | { kind: 'node'; ref: NodeRef; part: NodePart; xs: number[]; ys: number[]; moved: boolean }
    | { kind: 'nodes'; start: Pt; refs: NodeRef[]; moved: boolean }
    | { kind: 'scale'; refs: SubRef[]; corner: Pt; opposite: Pt; center: Pt; moved: boolean }
    | { kind: 'round'; ref: NodeRef; corner: Pt; bisector: Pt; half: number; moved: boolean };
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

  /** Esquinas de la caja de lo elegido (para los tiradores), en el orden NO, NE, SE, SO. */
  const handleCorners = (b: DocBox | null): Pt[] => {
    if (!b) return [];
    const m = 3 / pxPerUnit;
    return [
      { x: b.minX - m, y: b.minY - m },
      { x: b.maxX + m, y: b.minY - m },
      { x: b.maxX + m, y: b.maxY + m },
      { x: b.minX - m, y: b.maxY + m },
    ];
  };
  /** ¿Hay un tirador bajo el punto? Devuelve cuál (0-3). */
  const hitHandle = (p: Pt): number | null => {
    if (tool !== 'mover' || !nSel || !selBox) return null;
    const r = 7 / pxPerUnit;
    const cs = handleCorners(selBox);
    const i = cs.findIndex((c) => Math.abs(c.x - p.x) <= r && Math.abs(c.y - p.y) <= r);
    return i >= 0 ? i : null;
  };

  /** Círculo para redondear el vértice elegido: adentro de la punta, sobre la bisectriz. */
  const roundWidget = (): Pt | null => {
    if (!selCorner || !selNodeData) return null;
    const d = 16 / pxPerUnit;
    return { x: selNodeData.p.x + selCorner.bisector.x * d, y: selNodeData.p.y + selCorner.bisector.y * d };
  };

  /** La pieza a la que pertenece un contorno. */
  const pieceOfRef = (r: SubRef): EditPiece | null =>
    pieces.find((pc) => pc.refs.some((q) => q.path === r.path && q.sub === r.sub)) ?? null;
  /** Que la pieza de un nodo quede elegida (sus nodos siguen a la vista al sacar el mouse). */
  const keepPieceOf = (r: SubRef) => {
    const pc = pieceOfRef(r);
    if (pc && !selKeys.includes(keyOf(pc))) setSelKeys([keyOf(pc)]);
  };
  /** El tramo bajo el mouse (para «Añadir nodo»), en las piezas cercanas. */
  const segmentAt = (p: Pt) => {
    if (!shown) return null;
    const r = 8 / pxPerUnit;
    const near = pieces.filter((pc) => p.x >= pc.bounds.minX - r && p.x <= pc.bounds.maxX + r && p.y >= pc.bounds.minY - r && p.y <= pc.bounds.maxY + r);
    return nearestSegment(shown, near.flatMap((pc) => pc.refs), p, r);
  };
  /** Imán de «Medir»: el nodo más cercano (a menos de 8 px), de cualquier pieza. */
  const snapToNode = (p: Pt): Pt => {
    if (!shown || !snapOn) return p;
    const r = 8 / pxPerUnit;
    let best: Pt = p;
    let bd = r;
    for (const path of shown.paths)
      for (const sub of path.subs)
        for (const n of sub.nodes) {
          const d = Math.hypot(n.p.x - p.x, n.p.y - p.y);
          if (d < bd) {
            bd = d;
            best = n.p;
          }
        }
    return best;
  };

  /** x e y de los otros nodos de la pieza (imán para un nodo). */
  const nodeSnapLines = (ref: NodeRef): { xs: number[]; ys: number[] } => {
    const xs: number[] = [];
    const ys: number[] = [];
    const piece = pieceOfRef(ref);
    if (!doc || !piece) return { xs, ys };
    for (const r of piece.refs) {
      const nodes = doc.paths[r.path]?.subs[r.sub]?.nodes ?? [];
      nodes.forEach((n, ni) => {
        if (r.path === ref.path && r.sub === ref.sub && ni === ref.node) return;
        xs.push(n.p.x);
        ys.push(n.p.y);
      });
    }
    return { xs, ys };
  };

  /** Abre el menú del clic derecho con lo que se puede hacer ahí. */
  const openMenu = (e: React.PointerEvent, p: Pt) => {
    const col = colRef.current?.getBoundingClientRect();
    if (!col) return;
    let target: 'pieza' | 'nodo' | 'fondo' = 'fondo';
    if (nodeTool) {
      const h = hitNode(p);
      if (h && h.part === 'p') {
        setSelNode(h.ref);
        target = 'nodo';
      }
    }
    if (target === 'fondo') {
      const pc = pieceAt(pieces, p);
      if (pc) {
        const key = keyOf(pc);
        if (!selKeys.includes(key)) setSelection([key]);
        target = 'pieza';
      }
    }
    const W = 220;
    const H = target === 'pieza' ? 560 : target === 'nodo' ? 160 : 210;
    setMenu({
      x: Math.max(4, Math.min(e.clientX - col.left, col.width - W - 4)),
      y: Math.max(4, Math.min(e.clientY - col.top, col.height - H - 4)),
      target,
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!doc) return;
    setMenu(null);
    hostRef.current?.focus();
    const p = toUser(e.clientX, e.clientY);
    if (!p) return;
    if (e.button === 2) {
      openMenu(e, p);
      return;
    }
    // Rueda apretada: sin el "autoscroll" del navegador.
    if (e.button === 1) e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (spaceDown.current || e.button === 1 || (tool === 'mano' && e.button === 0)) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, view, moved: false };
      setDragging('pan');
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'zoom') {
      drag.current = { kind: 'zoom', start: p, out: e.altKey, moved: false };
      setDragging('marquee');
      return;
    }
    if (tool === 'rect' || tool === 'elipse') {
      drag.current = { kind: 'shape', shape: tool === 'rect' ? 'rect' : 'ellipse', start: p, moved: false };
      setDragging('shape');
      return;
    }
    if (tool === 'cuchillo') {
      drag.current = { kind: 'knife', start: p, moved: false };
      setDragging('knife');
      return;
    }
    if (tool === 'medir') {
      const a = snapToNode(p);
      drag.current = { kind: 'measure', start: a, moved: false };
      setMeasure(null);
      setDragging('measure');
      return;
    }
    if (tool === 'girar') {
      const pc = pieceAt(pieces, p);
      if (!selBox || (pc && !selKeys.includes(keyOf(pc)))) {
        // Sin nada elegido (o tocando otra pieza): primero se elige.
        setSelection(pc ? [keyOf(pc)] : []);
        return;
      }
      const center = { x: (selBox.minX + selBox.maxX) / 2, y: (selBox.minY + selBox.maxY) / 2 };
      drag.current = { kind: 'rotate', center, a0: Math.atan2(p.y - center.y, p.x - center.x), moved: false };
      setDragging('rotate');
      return;
    }

    // Tiradores de las esquinas: escalar.
    const hh = hitHandle(p);
    if (hh != null && selBox) {
      const cs = [
        { x: selBox.minX, y: selBox.minY },
        { x: selBox.maxX, y: selBox.minY },
        { x: selBox.maxX, y: selBox.maxY },
        { x: selBox.minX, y: selBox.maxY },
      ];
      drag.current = {
        kind: 'scale',
        refs: selRefs,
        corner: cs[hh],
        opposite: cs[(hh + 2) % 4],
        center: { x: (selBox.minX + selBox.maxX) / 2, y: (selBox.minY + selBox.maxY) / 2 },
        moved: false,
      };
      setDragging('scale');
      return;
    }

    if (nodeTool) {
      const rw = tool === 'nodos' ? roundWidget() : null;
      if (rw && selCorner && selNodeData && Math.hypot(p.x - rw.x, p.y - rw.y) <= 7 / pxPerUnit) {
        drag.current = {
          kind: 'round', ref: selCorner.ref, corner: selNodeData.p, bisector: selCorner.bisector,
          half: Math.sin((selCorner.angleDeg * Math.PI) / 360), moved: false,
        };
        setDragging('round');
        return;
      }
      const h = hitNode(p);
      if (h && h.part === 'p' && tool === 'restarNodo') {
        keepPieceOf(h.ref);
        commit(deleteNode(doc, h.ref), 'Nodo borrado.');
        setSelNode(null);
        return;
      }
      if (h && h.part === 'p' && tool === 'convertir') {
        keepPieceOf(h.ref);
        const n = doc.paths[h.ref.path]?.subs[h.ref.sub]?.nodes[h.ref.node];
        const curved = !!(n?.i || n?.o);
        commit(curved ? setNodeCorner(doc, h.ref) : setNodeSmooth(doc, h.ref), curved ? 'Nodo en esquina (sin manijas).' : 'Nodo suave (manijas alineadas).');
        setSelNode(h.ref);
        return;
      }
      if (!h && tool === 'sumarNodo') {
        const hit = segmentAt(p);
        const r = hit ? insertNode(doc, hit.ref, hit.seg, hit.t) : null;
        if (r) {
          keepPieceOf(hit!.ref);
          commit(r.doc, 'Nodo agregado (la forma no cambió).');
          setSelNode(r.ref);
          setSegHover(null);
          return;
        }
      }
      if (h && h.part === 'p' && e.shiftKey) {
        // Shift: suma o saca el nodo de los elegidos (no arrastra).
        keepPieceOf(h.ref);
        setNodeSel(nodeSel.some((r) => sameNode(r, h.ref)) ? nodeSel.filter((r) => !sameNode(r, h.ref)) : [...nodeSel, h.ref]);
        return;
      }
      if (h && h.part === 'p' && nodeSel.length > 1 && nodeSel.some((r) => sameNode(r, h.ref))) {
        // Agarrar uno de varios elegidos: se mueven todos juntos.
        drag.current = { kind: 'nodes', start: p, refs: nodeSel, moved: false };
        setDragging('nodes');
        return;
      }
      if (h) {
        keepPieceOf(h.ref);
        setSelNode(h.ref);
        const { xs, ys } = nodeSnapLines(h.ref);
        drag.current = { kind: 'node', ref: h.ref, part: h.part, xs, ys, moved: false };
        setDragging('node');
        return;
      }
      // Fuera de un nodo, en cualquier lado (también sobre una pieza o adentro
      // de un aro): rectángulo para elegir nodos. Un clic sin arrastrar elige la pieza.
      drag.current = { kind: 'marquee', start: p, additive: e.shiftKey, moved: false, nodes: true };
      setDragging('marquee');
      return;
    }

    const pc = pieceAt(pieces, p);
    if (pc) {
      const key = keyOf(pc);
      let keys = selKeys;
      if (e.shiftKey) {
        // Shift: suma o saca de la selección (no arrastra).
        keys = selKeys.includes(key) ? selKeys.filter((x) => x !== key) : [...selKeys, key];
        setSelection(keys);
        return;
      }
      if (!selKeys.includes(key)) {
        keys = [key];
        setSelection(keys);
      }
      const chosen = keys.map((x) => byKey.get(x)).filter((q): q is EditPiece => !!q);
      const box = unionBox(chosen.map((q) => q.bounds))!;
      const others = pieces.filter((q) => !keys.includes(keyOf(q))).map((q) => q.bounds);
      drag.current = { kind: 'move', start: p, refs: chosen.flatMap((q) => q.refs), box, others, moved: false };
      setDragging('move');
      return;
    }

    // Fondo (o adentro de un aro): rectángulo de selección.
    drag.current = { kind: 'marquee', start: p, additive: e.shiftKey, moved: false };
    setDragging('marquee');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      // Resaltar lo que se va a agarrar.
      if (!doc) return;
      const p = toUser(e.clientX, e.clientY);
      const hh = p ? hitHandle(p) : null;
      if (hh !== hoverHandle) setHoverHandle(hh);
      const pc = p && hh == null ? pieceAt(pieces, p) : null;
      const key = pc ? keyOf(pc) : null;
      if (key !== hoverKey) setHoverKey(key);
      if (tool === 'sumarNodo' && p) {
        const hit = hitNode(p) ? null : segmentAt(p);
        setSegHover(hit ? hit.at : null);
      }
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
    if (d.kind === 'zoom') {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * pxPerUnit > 3) d.moved = true;
      if (d.moved) setMarquee({ minX: Math.min(d.start.x, p.x), minY: Math.min(d.start.y, p.y), maxX: Math.max(d.start.x, p.x), maxY: Math.max(d.start.y, p.y) });
      return;
    }
    if (d.kind === 'shape') {
      let w = p.x - d.start.x;
      let h = p.y - d.start.y;
      if (Math.hypot(w, h) * pxPerUnit > 3) d.moved = true;
      if (!d.moved) return;
      // Shift: cuadrado / círculo. Alt: desde el centro.
      if (e.shiftKey) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }
      const b = e.altKey
        ? { minX: d.start.x - Math.abs(w), minY: d.start.y - Math.abs(h), maxX: d.start.x + Math.abs(w), maxY: d.start.y + Math.abs(h) }
        : { minX: Math.min(d.start.x, d.start.x + w), minY: Math.min(d.start.y, d.start.y + h), maxX: Math.max(d.start.x, d.start.x + w), maxY: Math.max(d.start.y, d.start.y + h) };
      setTemp(addShape(doc, d.shape, b)?.doc ?? null);
      setMarquee(b);
      return;
    }
    if (d.kind === 'rotate') {
      if (!selBox) return;
      let deg = ((Math.atan2(p.y - d.center.y, p.x - d.center.x) - d.a0) * 180) / Math.PI;
      deg = ((deg + 540) % 360) - 180;
      // Shift: de a 15°.
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      if (Math.abs(deg) > 0.05) d.moved = true;
      setRotateInfo(deg);
      setTemp(deg ? rotateRefs(doc, selRefs, selBox, deg) : null);
      return;
    }
    if (d.kind === 'knife') {
      let b = p;
      if (e.shiftKey) {
        // Shift: de a 45°.
        const ang = Math.round(Math.atan2(p.y - d.start.y, p.x - d.start.x) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(p.x - d.start.x, p.y - d.start.y);
        b = { x: d.start.x + Math.cos(ang) * len, y: d.start.y + Math.sin(ang) * len };
      }
      if (Math.hypot(b.x - d.start.x, b.y - d.start.y) * pxPerUnit > 3) d.moved = true;
      setKnifeLine({ a: d.start, b });
      return;
    }
    if (d.kind === 'measure') {
      let b = snapToNode(p);
      if (e.shiftKey && b === p) {
        // Shift: de a 45°.
        const ang = Math.round(Math.atan2(p.y - d.start.y, p.x - d.start.x) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(p.x - d.start.x, p.y - d.start.y);
        b = { x: d.start.x + Math.cos(ang) * len, y: d.start.y + Math.sin(ang) * len };
      }
      if (Math.hypot(b.x - d.start.x, b.y - d.start.y) * pxPerUnit > 2) d.moved = true;
      setMeasure({ a: d.start, b });
      return;
    }
    if (d.kind === 'scale') {
      // Alt: desde el centro; si no, queda fija la esquina de enfrente.
      const anchor = e.altKey ? d.center : d.opposite;
      const vx = d.corner.x - anchor.x;
      const vy = d.corner.y - anchor.y;
      const l2 = vx * vx + vy * vy;
      if (!l2) return;
      const f = Math.max(0.05, ((p.x - anchor.x) * vx + (p.y - anchor.y) * vy) / l2);
      d.moved = true;
      setScaleInfo(f);
      setTemp(scaleRefsAt(doc, d.refs, f, anchor.x, anchor.y));
      return;
    }
    if (d.kind === 'round') {
      // Centro del arco sobre la bisectriz: radio = distancia × sen(ángulo / 2).
      const along = (p.x - d.corner.x) * d.bisector.x + (p.y - d.corner.y) * d.bisector.y;
      const r = Math.max(0, along) * d.half;
      d.moved = true;
      const res = r > 0 ? roundCorner(doc, d.ref, r) : null;
      setRoundInfo(res ? res.radius * k : 0);
      setTemp(res ? res.doc : null);
      return;
    }
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
    if (d.kind === 'nodes') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (Math.hypot(dx, dy) * pxPerUnit > 2) d.moved = true;
      if (!d.moved) return;
      if (e.shiftKey) {
        const c = constrainAxis(dx, dy);
        dx = c.dx;
        dy = c.dy;
      }
      setTemp(translateNodes(doc, d.refs, dx, dy));
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
    const f = scaleInfo;
    setScaleInfo(null);
    const rr = roundInfo;
    setRoundInfo(null);
    const deg = rotateInfo;
    setRotateInfo(null);
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'zoom') {
      const m = marquee;
      setMarquee(null);
      if (d.moved && m) zoomTo(m, 0);
      else {
        // Clic: acercar (Alt: alejar) en ese punto.
        const f = d.out ? 1.6 : 1 / 1.6;
        setView((v) => {
          const w = Math.min(base.w * 4, Math.max(0.8 / k, v.w * f));
          const s = w / v.w;
          return { x: d.start.x - (d.start.x - v.x) * s, y: d.start.y - (d.start.y - v.y) * s, w, h: v.h * s };
        });
      }
      return;
    }
    if (d.kind === 'shape') {
      setMarquee(null);
      if (d.moved && temp) {
        const path = temp.paths.length - 1;
        commit(temp, `${d.shape === 'rect' ? 'Rectángulo' : 'Elipse'} agregado. Con otra pieza elegida, «Restar» abre un corte con su forma.`);
        setSelection([refKey({ path, sub: 0 })]);
      } else {
        setTemp(null);
        if (!d.moved) say('Arrastrá para dibujar (Shift: parejo; Alt: desde el centro).', 'ok');
      }
      return;
    }
    if (d.kind === 'rotate') {
      if (d.moved && temp && deg) {
        const g = Math.abs(deg);
        commit(temp, `${what} girada${nSel > 1 ? 's' : ''} ${mm(g, 1)}° ${deg > 0 ? 'a la derecha' : 'a la izquierda'}.`);
      } else setTemp(null);
      return;
    }
    if (d.kind === 'measure') {
      if (!d.moved) setMeasure(null);
      return;
    }
    if (d.kind === 'knife') {
      const line = knifeLine;
      setKnifeLine(null);
      if (!d.moved || !line || !doc) {
        say('Arrastrá una línea que cruce la pieza de lado a lado (Shift: de a 45°).', 'ok');
        return;
      }
      // Corta lo elegido; sin nada elegido, todo lo que cruce.
      const r = knifeCut(doc, nSel ? selection : pieces, line.a, line.b, k);
      if (!r) {
        say('La línea tiene que cruzar la pieza de lado a lado para partirla.');
        return;
      }
      commit(r.doc, `${r.cut > 1 ? `${r.cut} piezas cortadas` : 'Pieza cortada'} en ${r.parts} partes.`);
      setSelection(computePieces(r.doc, tolUnits).filter((pc) => pc.refs[0].path >= r.firstNewPath).map(keyOf));
      return;
    }
    if (d.kind === 'round') {
      if (temp && rr) {
        commit(temp, `Vértice redondeado (radio ${mm(rr, 2)} mm).`);
        setSelNode(null);
      } else setTemp(null);
      return;
    }
    if (d.kind === 'marquee' && d.nodes) {
      const m = marquee;
      setMarquee(null);
      if (!d.moved || !m) {
        // Clic sin arrastrar: elige esa pieza (Shift: la suma); en el fondo, suelta todo.
        const pc = pieceAt(pieces, d.start);
        if (pc) {
          const key = keyOf(pc);
          if (d.additive) setSelKeys(selKeys.includes(key) ? selKeys : [...selKeys, key]);
          else setSelection([key]);
        } else if (!d.additive) setSelection([]);
        return;
      }
      // Nodos de todas las piezas que toca el rectángulo; esas piezas quedan elegidas.
      const touched = pieces.filter((pc) => boxesTouch(pc.bounds, m));
      const hit: NodeRef[] = [];
      for (const r of touched.flatMap((pc) => pc.refs)) {
        (shown?.paths[r.path]?.subs[r.sub]?.nodes ?? []).forEach((n, ni) => {
          if (n.p.x >= m.minX && n.p.x <= m.maxX && n.p.y >= m.minY && n.p.y <= m.maxY) hit.push({ ...r, node: ni });
        });
      }
      const withNodes = touched.filter((pc) => hit.some((h) => pc.refs.some((r) => r.path === h.path && r.sub === h.sub))).map(keyOf);
      const next = d.additive ? [...nodeSel, ...hit.filter((h) => !nodeSel.some((r) => sameNode(r, h)))] : hit;
      setSelKeys(d.additive ? Array.from(new Set([...selKeys, ...withNodes])) : withNodes);
      setNodeSel(next);
      if (hit.length) showNotice(`${next.length} nodo${next.length === 1 ? '' : 's'} elegido${next.length === 1 ? '' : 's'}.`, 'ok');
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
      if (hit.length) showNotice(`${hit.length} pieza${hit.length === 1 ? '' : 's'} elegida${hit.length === 1 ? '' : 's'}.`, 'ok');
      return;
    }
    if (d.moved && temp) {
      const n = selection.length;
      commit(
        temp,
        d.kind === 'scale'
          ? `${n > 1 ? `${n} piezas` : 'Pieza'} al ${mm((f ?? 1) * 100, 1)} % de su tamaño.`
          : d.kind === 'move'
            ? n > 1
              ? `${n} piezas movidas.`
              : 'Pieza movida.'
            : d.kind === 'nodes'
              ? `${d.refs.length} nodos movidos.`
              : d.part === 'p'
                ? 'Nodo movido.'
                : 'Manija movida.',
      );
    } else {
      setTemp(null);
    }
  };

  /** Doble clic: en una pieza, editar sus nodos (acercando si hace falta); en el fondo, salir. */
  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'mover' && tool !== 'nodos') return;
    const p = toUser(e.clientX, e.clientY);
    const pc = p ? pieceAt(pieces, p) : null;
    if (!pc) {
      if (tool === 'nodos') {
        setTool('mover');
        setSelNode(null);
      }
      return;
    }
    setSelection([keyOf(pc)]);
    setTool('nodos');
    // Si los nodos quedan muy juntos para tocarlos, acercar justo lo necesario,
    // centrado donde se hizo el doble clic.
    const gaps: number[] = [];
    for (const r of pc.refs) {
      const ns = doc?.paths[r.path]?.subs[r.sub]?.nodes ?? [];
      for (let i = 1; i < ns.length; i++) gaps.push(Math.hypot(ns[i].p.x - ns[i - 1].p.x, ns[i].p.y - ns[i - 1].p.y));
    }
    gaps.sort((a, b) => a - b);
    const g = gaps[Math.floor(gaps.length / 2)] ?? 0;
    if (g > 0 && g * pxPerUnit < NODE_MIN_SPACING_PX && p) {
      const w = Math.max(0.8 / k, (hostW * g) / (NODE_MIN_SPACING_PX * 1.6));
      const h = w / aspect;
      setView({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    }
  };

  // El menú se cierra al tocar afuera o con Esc.
  useEffect(() => {
    if (!menu) return;
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent && ev.key !== 'Escape') return;
      if (ev.target instanceof Node && document.querySelector('[data-fresa-menu]')?.contains(ev.target)) return;
      setMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
    };
  }, [menu]);

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
  /** Unir lo elegido en una sola pieza (lo que se pisa queda una figura). */
  const doUnion = () => {
    if (nSel < 2 || !doc) return;
    const r = unionPieces(doc, selection, k);
    if (!r) { say('Ninguna de las elegidas se toca con otra: no hay nada para unir.'); return; }
    const merged = computePieces(r.doc, tolUnits).filter((pc) => pc.refs[0].path >= r.firstNewPath);
    const loose = nSel - r.merged;
    commit(r.doc, `${r.merged} piezas unidas en ${merged.length}.${loose ? ` ${loose} no se tocaban y quedaron igual.` : ''}`);
    setSelection(merged.map(keyOf));
  };
  /** Buscatrazos: restar, intersecar, excluir o dividir lo elegido. */
  const doBoolean = (op: BooleanOp) => {
    if (nSel < 2 || !doc) return;
    const r = booleanPieces(doc, selection, op, k);
    if (!r) {
      say(op === 'intersecar' ? 'Las elegidas no tienen ninguna parte en común.' : 'No quedaría nada: no se hizo.');
      return;
    }
    const fresh = computePieces(r.doc, tolUnits).filter((pc) => pc.refs[0].path >= r.firstNewPath);
    const texts: Record<BooleanOp, string> = {
      restar: `A la de más abajo se le sacó lo que tenía encima (${nSel - 1} pieza${nSel - 1 === 1 ? '' : 's'}).`,
      intersecar: 'Quedó solo lo que tenían en común.',
      excluir: 'Se sacó donde se pisaban.',
      dividir: `Dividido en ${r.count} pieza${r.count === 1 ? '' : 's'}: se pueden mover o borrar por separado.`,
    };
    commit(r.doc, texts[op]);
    setSelection(fresh.map(keyOf));
  };
  /** Girar (positivo = horario) o espejar lo elegido sobre el centro de su caja. */
  const doRotate = (deg: number) => {
    if (!nSel || !doc || !selBox || !deg) return;
    const g = Math.abs(deg);
    commit(rotateRefs(doc, selRefs, selBox, deg), `${what} girada${nSel > 1 ? 's' : ''} ${Number.isInteger(g) ? g : mm(g, 1)}° ${deg > 0 ? 'a la derecha' : 'a la izquierda'}.`);
  };
  /** Diseño entero a una medida exacta (mm), desde el centro. */
  const resizeAll = () => {
    if (!doc || !docBox || !docMm) return;
    const w = num(sizeW);
    const h = num(sizeH);
    if (!(w > 0) || !(h > 0)) {
      say('Escribí el ancho y el alto en mm.');
      return;
    }
    const fx = w / docMm.w;
    const fy = sizeLock ? fx : h / docMm.h;
    if (Math.abs(fx - 1) < 1e-6 && Math.abs(fy - 1) < 1e-6) return;
    const cx = (docBox.minX + docBox.maxX) / 2;
    const cy = (docBox.minY + docBox.maxY) / 2;
    commit(
      mapRefs(doc, allRefs(doc), (q) => ({ x: cx + (q.x - cx) * fx, y: cy + (q.y - cy) * fy })),
      `Diseño a ${mm(docMm.w * fx)} × ${mm(docMm.h * fy)} mm${sizeLock ? '' : ': se deformó (sin respetar la proporción)'}.`,
      sizeLock ? 'ok' : 'warn',
    );
  };
  const onSizeText = (axis: 'w' | 'h', raw: string) => {
    if (axis === 'w') setSizeW(raw);
    else setSizeH(raw);
    const v = num(raw);
    if (!sizeLock || !docMm || !(v > 0)) return;
    if (axis === 'w') setSizeH(mm((v * docMm.h) / docMm.w));
    else setSizeW(mm((v * docMm.w) / docMm.h));
  };
  /** Gira el diseño entero sobre el centro de su caja (positivo = horario). */
  const rotateAll = (deg: number) => {
    setAllAngle('0');
    if (!doc || !docBox || !deg || !Number.isFinite(deg)) {
      setTemp(null);
      return;
    }
    const g = Math.abs(deg);
    commit(rotateRefs(doc, allRefs(doc), docBox, deg), `Diseño girado ${Number.isInteger(g) ? g : mm(g, 1)}° ${deg > 0 ? 'a la derecha' : 'a la izquierda'}.`);
  };
  /** Mientras se arrastra el control de giro: se ve girado, se confirma al soltar. */
  const previewRotateAll = (raw: string) => {
    setAllAngle(raw);
    const deg = num(raw);
    setTemp(doc && docBox && deg ? rotateRefs(doc, allRefs(doc), docBox, deg) : null);
  };
  const doMirror = (axis: 'x' | 'y') => {
    if (!nSel || !doc || !selBox) return;
    commit(mirrorRefs(doc, selRefs, selBox, axis), `${what} espejada${nSel > 1 ? 's' : ''} ${axis === 'x' ? 'izquierda ↔ derecha' : 'arriba ↕ abajo'}.`);
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
  /** Qué se movería al distanciar: el eje y los grupos (palabras o piezas). */
  const spread = useMemo(() => {
    if (selection.length < 2) return null;
    const boxes = selection.map((p) => p.bounds);
    const axis = spreadAxis(boxes);
    return { boxes, axis, groups: spreadGroups(boxes, axis, spreadWords, 0.2 / k) };
  }, [selection, spreadWords, k]);
  const doSpread = (sign: 1 | -1) => {
    if (!doc || !spread) return;
    if (spread.groups.length < 2) {
      say(spreadWords ? 'No se distinguen palabras en lo elegido: sacá «por palabras» para separar pieza por pieza.' : 'Elegí piezas que estén una al lado de la otra.');
      return;
    }
    const d = Math.abs(num(spreadMm));
    if (!d) return;
    const shifts = spreadShifts(spread.boxes, spread.groups, spread.axis, (sign * d) / k, spreadAnchor);
    let next = doc;
    selection.forEach((p, i) => {
      if (shifts[i].dx || shifts[i].dy) next = translateRefs(next, p.refs, shifts[i].dx, shifts[i].dy);
    });
    const n = spread.groups.length;
    commit(next, `${n} ${spreadWords ? 'palabras' : 'piezas'} ${sign > 0 ? 'separadas' : 'juntadas'} ${mm(d)} mm entre sí.`);
  };
  const doDeleteSelection = () => {
    if (!nSel || !doc) return;
    commit(removeRefs(doc, selRefs), `${what} borrada${nSel > 1 ? 's' : ''}. Ctrl+Z para recuperar${nSel > 1 ? 'las' : 'la'}.`);
    setSelection([]);
  };
  const doDeleteNode = () => {
    if (!selNode || !doc) return;
    if (nodeSel.length > 1) commit(deleteNodes(doc, nodeSel), `${nodeSel.length} nodos borrados.`);
    else commit(deleteNode(doc, selNode), 'Nodo borrado.');
    setSelNode(null);
  };
  /** Flechas con nodos elegidos: mueven esos nodos, no la pieza. */
  const nudgeNodes = (dxMm: number, dyMm: number) => {
    if (!nodeSel.length || !doc) return;
    const n = nodeSel.length;
    commit(translateNodes(doc, nodeSel, dxMm / k, dyMm / k), `${n > 1 ? `${n} nodos movidos` : 'Nodo movido'} ${mm(Math.hypot(dxMm, dyMm))} mm.`);
  };
  const doNodeCorner = () => {
    if (!selNode || !doc) return;
    commit(setNodeCorner(doc, selNode), 'Nodo en esquina (sin manijas).');
  };
  const doNodeSmooth = () => {
    if (!selNode || !doc) return;
    commit(setNodeSmooth(doc, selNode), 'Nodo suave (manijas alineadas).');
  };
  /** Acercar a lo elegido (o ver todo si no hay nada elegido). */
  const frameSelection = () => {
    if (selBox) zoomTo(selBox, 0.8);
    else fitAll();
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
    if (!doc) return;
    const r = simplified ?? simplifyDoc(doc, Math.max(0.001, num(tolMm)) / k, selRefs.length ? selRefs : undefined);
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

  const roundR = Math.max(0.001, num(roundMm) || 0.2);
  const doRoundNode = () => {
    if (!doc || !selCorner) return;
    const r = roundCorner(doc, selCorner.ref, roundR / k);
    if (!r) return;
    const used = r.radius * k;
    commit(r.doc, used < roundR - 1e-4 ? `Vértice redondeado con el máximo que entra: ${mm(used, 2)} mm.` : `Vértice redondeado (radio ${mm(used, 2)} mm).`);
    setSelNode(null);
  };
  const doRoundInternal = () => {
    if (!doc || !innerCorners.length) return;
    const r = roundCorners(doc, innerCorners.map((c) => c.ref), roundR / k);
    if (!r.done) return;
    commit(r.doc, `${r.done} vértice${r.done === 1 ? '' : 's'} interno${r.done === 1 ? '' : 's'} redondeado${r.done === 1 ? '' : 's'} (radio ${mm(roundR, 2)} mm o el máximo que entra).`);
  };
  /** Copiar lo elegido (sirve para pegar acá o en el editor de otro sello). */
  const doCopy = (cut = false) => {
    if (!doc || !nSel || !selBox) return;
    editorClipboard = copyRefs(doc, selRefs, selBox, k);
    clipboardSource = svgText;
    pasteCount = 0;
    setClipTick((t) => t + 1);
    if (cut) {
      commit(removeRefs(doc, selRefs), `${what} cortada${nSel > 1 ? 's' : ''}. Ctrl+V para pegar.`);
      setSelection([]);
    } else showNotice(`${what} copiada${nSel > 1 ? 's' : ''}. Ctrl+V pega al lado; Ctrl+Shift+V, en el mismo lugar.`, 'ok');
  };
  /** Pegar: corrido 0,5 mm (para verlo), o en el mismo lugar. Lo pegado queda elegido. */
  const doPaste = (samePlace = false) => {
    if (!doc || !editorClipboard) return;
    pasteCount += 1;
    // De otro sello: al centro de lo que se ve (su lugar en el otro dibujo no significa nada acá).
    const other = clipboardSource !== svgText;
    const r = other
      ? pasteClip(doc, editorClipboard, k, 0, { x: view.x + view.w / 2, y: view.y + view.h / 2 })
      : pasteClip(doc, editorClipboard, k, samePlace ? 0 : 0.5 * pasteCount);
    commit(r.doc, other ? 'Pegado desde otro sello, al centro de la vista y a su medida en mm.' : samePlace ? 'Pegado en el mismo lugar.' : 'Pegado. Arrastralo a su lugar (Shift: un solo eje).');
    setTool('mover');
    setSelection(computePieces(r.doc, tolUnits).filter((pc) => pc.refs[0].path >= r.firstNewPath).map(keyOf));
  };
  const doDuplicate = () => {
    if (!doc || !nSel || !selBox) return;
    const clip = copyRefs(doc, selRefs, selBox, k);
    const r = pasteClip(doc, clip, k, 0.5);
    commit(r.doc, `${what} duplicada${nSel > 1 ? 's' : ''}.`);
    setSelection(computePieces(r.doc, tolUnits).filter((pc) => pc.refs[0].path >= r.firstNewPath).map(keyOf));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // En un campo de texto o un desplegable, las teclas son de ese campo.
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
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
    if (mod && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      doUnion();
      return;
    }
    if (mod && ['c', 'x', 'v', 'd'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      const key = e.key.toLowerCase();
      if (key === 'c') doCopy();
      else if (key === 'x') doCopy(true);
      else if (key === 'v') doPaste(e.shiftKey);
      else doDuplicate();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a' && nodeTool && selRefs.length && shown) {
      // Editando nodos: todos los nodos de lo elegido.
      e.preventDefault();
      const all = selRefs.flatMap((r) => (shown.paths[r.path]?.subs[r.sub]?.nodes ?? []).map((_, ni) => ({ ...r, node: ni })));
      setNodeSel(all);
      showNotice(`${all.length} nodos elegidos.`, 'ok');
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelection(pieces.map(keyOf));
      showNotice(`${pieces.length} piezas elegidas.`, 'ok');
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (menu) setMenu(null);
      else if (measure) setMeasure(null);
      else if (selNode) setSelNode(null);
      else if (tool !== 'mover') setTool('mover');
      else setSelection([]);
      return;
    }
    if (e.key === 'Enter' && nSel && tool === 'mover') {
      e.preventDefault();
      setTool('nodos');
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (nodeTool && selNode) doDeleteNode();
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
    if (dirs[e.key] && nodeTool && nodeSel.length) {
      e.preventDefault();
      nudgeNodes(...dirs[e.key]);
      return;
    }
    if (dirs[e.key] && nSel) {
      e.preventDefault();
      nudge(...dirs[e.key]);
      return;
    }
    const key = e.key.toLowerCase();
    if (!mod && !e.altKey) {
      // Herramientas (las mismas teclas que Illustrator).
      const byKey: Record<string, Tool> = {
        v: 'mover', a: 'nodos', '+': 'sumarNodo', '=': 'sumarNodo', '-': 'restarNodo',
        m: 'rect', l: 'elipse', c: 'cuchillo', r: 'girar', i: 'medir', h: 'mano', z: 'zoom',
      };
      const t = e.shiftKey && key === 'c' ? 'convertir' : byKey[key];
      if (t) {
        e.preventDefault();
        setTool(t);
        setSelNode(null);
        return;
      }
    }
    if (!mod && key === 'g') setSnapOn((v) => !v);
    if (!mod && key === 'o' && original) setShowOriginal((v) => !v);
    if (!mod && key === 'f') frameSelection();
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

  const toolHint: Partial<Record<Tool, string>> = {
    sumarNodo: 'Clic sobre un borde: agrega un nodo ahí sin cambiar la forma (el punto azul muestra dónde). Sobre un nodo: moverlo.',
    restarNodo: 'Clic en un nodo: lo borra (la curva se rehace entre los vecinos). Pasá por una pieza para ver sus nodos.',
    convertir: 'Clic en un nodo: esquina ↔ suave. Arrastrar sus manijas: cambiar la curva.',
    rect: 'Arrastrá para dibujar un rectángulo (Shift: cuadrado; Alt: desde el centro). Sirve para tapar o, con «Restar», cortar.',
    elipse: 'Arrastrá para dibujar una elipse (Shift: círculo; Alt: desde el centro).',
    cuchillo: nSel
      ? 'Arrastrá una línea que cruce lo elegido de lado a lado: queda partido en dos (Shift: de a 45°).'
      : 'Arrastrá una línea que cruce una pieza de lado a lado: queda partida en dos (sin nada elegido, corta todo lo que cruce).',
    girar: nSel ? 'Arrastrá alrededor del centro para girar lo elegido (Shift: de a 15°).' : 'Tocá una pieza para elegirla y después arrastrá para girarla.',
    medir: 'Arrastrá para medir en mm (se engancha en los nodos; Shift: de a 45°). Clic: borrar la medida.',
    mano: 'Arrastrá para moverte por el dibujo (también: Espacio o rueda apretada, con cualquier herramienta).',
    zoom: 'Clic: acercar · Alt+clic: alejar · arrastrar un rectángulo: acercar a esa zona.',
  };
  const hint = toolHint[tool]
    ? toolHint[tool]!
    : tool === 'nodos'
      ? !selRefs.length
        ? 'Pasá por una pieza para ver sus nodos y arrastralos; arrastrá un rectángulo (en cualquier lado) para elegir varios.'
        : !nodesTouchable
          ? 'Los nodos están muy juntos: acercate con la rueda (o F) para poder tocarlos.'
          : nodeSel.length > 1
            ? `${nodeSel.length} nodos elegidos: arrastrá uno para mover todos, o usá las flechas (Shift: ×10). Shift+clic suma o saca. Supr: borrarlos.`
            : selNode
              ? selCorner
                ? 'Arrastrá el círculo hacia adentro para redondear el vértice, o el nodo y sus manijas. Flechas: mover el nodo. Shift+clic: sumar otro.'
                : 'Arrastrá el nodo o sus manijas (se alinea con los otros; Ctrl lo suelta). Flechas: mover el nodo. Shift+clic: sumar otro.'
              : 'Arrastrá un nodo, o tocalo para ver sus manijas. Rectángulo (en cualquier lado) o Shift+clic: varios. Esc: volver a Selección.'
      : dragging === 'move'
        ? 'Shift: solo en horizontal o vertical. Ctrl: sin imán.'
        : dragging === 'scale'
          ? 'Escala pareja. Alt: desde el centro.'
          : nSel
            ? 'Arrastrá para mover · esquinas: escalar · doble clic: nodos · clic derecho: más acciones · rueda apretada: moverse.'
            : 'Clic: elegir · arrastrar en el fondo: varias · doble clic: nodos · clic derecho: acciones · rueda: zoom (apretada: moverse).';

  const HANDLE_CURSORS = ['cursor-nwse-resize', 'cursor-nesw-resize', 'cursor-nwse-resize', 'cursor-nesw-resize'];
  const toolCursor: Partial<Record<Tool, string>> = {
    mano: 'cursor-grab',
    zoom: 'cursor-zoom-in',
    rect: 'cursor-crosshair',
    cuchillo: 'cursor-crosshair',
    elipse: 'cursor-crosshair',
    medir: 'cursor-crosshair',
    sumarNodo: 'cursor-copy',
    girar: nSel ? 'cursor-alias' : 'cursor-pointer',
  };
  const cursor =
    dragging === 'pan'
      ? 'cursor-grabbing'
      : !dragging && toolCursor[tool]
        ? toolCursor[tool]
      : dragging === 'rotate'
        ? 'cursor-alias'
      : dragging === 'scale'
        ? 'cursor-nwse-resize'
        : dragging === 'move' || dragging === 'node' || dragging === 'round'
          ? 'cursor-move'
          : dragging === 'marquee'
            ? 'cursor-crosshair'
            : hoverHandle != null
              ? HANDLE_CURSORS[hoverHandle]
              : hovered || (hoverKey && selKeys.includes(hoverKey))
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
    // Las teclas funcionan en todo el editor: también después de tocar un botón del panel.
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:flex-row" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      {/* ---------------------------------------------------- lienzo */}
      <div ref={colRef} className="relative flex h-[55vh] min-w-0 shrink-0 flex-col gap-2 md:h-auto md:min-h-[300px] md:flex-1 md:shrink">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
            <button type="button" className={iconBtn} disabled={!nSel} onClick={frameSelection} title="Acercar a lo elegido (tecla F)">
              <Focus className="size-3.5" />
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
          <span className="h-5 border-l" aria-hidden />
          <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Simula cómo talla la fresa (V-carve) y lo muestra con luz, como relieve">
            <Checkbox checked={showRelief} onCheckedChange={(v) => setShowRelief(Boolean(v))} />
            Relieve 3D
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={showZones} onCheckedChange={(v) => setShowZones(Boolean(v))} />
            Lugares
          </label>
          {original ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <label className="flex items-center gap-1" title="Muestra la imagen original debajo del vector, en color (tecla O). Lo que se ve en color quedó afuera del vector.">
                <Checkbox checked={showOriginal} onCheckedChange={(v) => setShowOriginal(Boolean(v))} />
                <span className="inline-block size-2.5 rounded-sm" style={{ background: ORIGINAL_COLOR }} aria-hidden />
                Original
              </label>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={origOpacity}
                disabled={!showOriginal}
                onChange={(e) => setOrigOpacity(Number(e.target.value))}
                className="h-1 w-16 accent-fuchsia-500 disabled:opacity-40"
                title="Opacidad del original"
                aria-label="Opacidad del original"
              />
            </span>
          ) : null}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={showAllNodes} onCheckedChange={(v) => setShowAllNodes(Boolean(v))} />
            Todos los nodos
          </label>
        </div>

        <div className="flex min-h-0 flex-1 gap-2">
        {/* Barra de herramientas (como en Illustrator). */}
        <div className="flex w-9 shrink-0 flex-col items-center gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-0.5" role="toolbar" aria-label="Herramientas" aria-orientation="vertical">
          {(
            [
              ['mover', <MousePointer2 key="i" className="size-4" />, 'V', 'Elegir y mover piezas; esquinas: escalar'],
              ['nodos', <MousePointer key="i" className="size-4" />, 'A', 'Mover nodos y manijas; rectángulo para elegir nodos (también adentro de un aro)'],
              null,
              ['sumarNodo', <span key="i" className="relative"><PenTool className="size-4" /><span className="absolute -right-1.5 -top-1.5 text-[11px] font-bold leading-none">+</span></span>, '+', 'Clic en un borde: agrega un nodo sin cambiar la forma'],
              ['restarNodo', <span key="i" className="relative"><PenTool className="size-4" /><span className="absolute -right-1.5 -top-1.5 text-[11px] font-bold leading-none">−</span></span>, '−', 'Clic en un nodo: lo borra'],
              ['convertir', <Spline key="i" className="size-4" />, 'Shift+C', 'Clic en un nodo: esquina ↔ suave'],
              null,
              ['rect', <Square key="i" className="size-4" />, 'M', 'Dibujar un rectángulo (para tapar, o cortar con «Restar»)'],
              ['elipse', <Circle key="i" className="size-4" />, 'L', 'Dibujar una elipse o un círculo'],
              ['cuchillo', <Slice key="i" className="size-4" />, 'C', 'Cortar una pieza en dos con una línea'],
              null,
              ['girar', <RotateCw key="i" className="size-4" />, 'R', 'Girar lo elegido arrastrando (Shift: de a 15°)'],
              ['medir', <Ruler key="i" className="size-4" />, 'I', 'Medir distancias en mm (se engancha en los nodos)'],
              null,
              ['mano', <Hand key="i" className="size-4" />, 'H', 'Moverse por el dibujo'],
              ['zoom', <ZoomIn key="i" className="size-4" />, 'Z', 'Acercar (Alt: alejar) o encuadrar una zona'],
            ] as const
          ).map((t, i) =>
            t ? (
              <button
                key={t[0]}
                type="button"
                className={cn(
                  'inline-flex size-8 shrink-0 items-center justify-center rounded transition-colors',
                  tool === t[0] ? 'bg-blue-600 text-white shadow-sm' : 'text-foreground hover:bg-muted',
                )}
                aria-pressed={tool === t[0]}
                onClick={() => {
                  setTool(t[0]);
                  setSelNode(null);
                  hostRef.current?.focus();
                }}
                title={`${TOOL_NAME[t[0]]} (${t[2]}): ${t[3]}`}
              >
                {t[1]}
              </button>
            ) : (
              <span key={`s${i}`} className="my-0.5 w-6 shrink-0 border-t" aria-hidden />
            ),
          )}
        </div>
        <div
          ref={hostRef}
          tabIndex={0}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => !drag.current && setHoverKey(null)}
          onDoubleClick={onDoubleClick}
          onAuxClick={(e) => e.preventDefault()}
          className={cn(
            'relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden rounded-md border bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
            {(() => {
              // El original va debajo del vector (lo que se ve en color quedó afuera);
              // con el relieve, encima de él (el relieve es opaco).
              const showRel = relief && dragging !== 'move' && dragging !== 'node';
              const overlay =
                showOriginal && orig && placement ? (
                  <image
                    href={orig.overlayUrl}
                    x={placement.x}
                    y={placement.y}
                    width={orig.ink.width * placement.scale}
                    height={orig.ink.height * placement.scale}
                    preserveAspectRatio="none"
                    opacity={showRel ? Math.min(origOpacity, 0.5) : origOpacity}
                    style={{ pointerEvents: 'none' }}
                  />
                ) : null;
              return showRel ? (
                <>
                  <image
                    href={relief.href}
                    x={relief.x}
                    y={relief.y}
                    width={relief.w}
                    height={relief.h}
                    preserveAspectRatio="none"
                    style={{ imageRendering: 'auto' }}
                  />
                  {overlay}
                </>
              ) : (
                <>
                  {overlay}
                  {shown?.paths.map((p, pi) => (
                    <path key={pi} d={p.subs.map(subToD).join('')} fill="#111" fillRule={p.fillRule} />
                  ))}
                </>
              );
            })()}

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
                {tool === 'mover' && dragging !== 'move'
                  ? handleCorners(shownSelBox).map((c, i) => (
                      <rect
                        key={i}
                        x={c.x - 4 * u}
                        y={c.y - 4 * u}
                        width={8 * u}
                        height={8 * u}
                        fill={hoverHandle === i ? '#2563eb' : '#fff'}
                        stroke="#2563eb"
                        strokeWidth={1.3 * u}
                      />
                    ))
                  : null}
                <text
                  // Siempre dentro de lo que se ve (con todo elegido, la caja llena el lienzo).
                  x={Math.max(shownSelBox.minX - 3 * u, view.x + 6 * u)}
                  y={Math.max(shownSelBox.minY - 6 * u, view.y + 16 * u)}
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
                  {scaleInfo != null ? `  ·  ${mm(scaleInfo * 100, 1)} %` : ''}
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
                        // Mientras se re-chequea, lo anterior queda más tenue.
                        fillOpacity={checking ? 0.35 : 0.8}
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

            {/* Lo que falta o sobra respecto del original */}
            {showDiffs && diffs.length ? (
              <g style={{ pointerEvents: 'none' }}>
                {diffs.map((d, di) => {
                  const color = d.kind === 'sobra' ? SOBRA_COLOR : ORIGINAL_COLOR;
                  const pad = 4 * u;
                  return (
                    <g key={d.id}>
                      <rect
                        x={d.box.minX - pad}
                        y={d.box.minY - pad}
                        width={d.box.maxX - d.box.minX + 2 * pad}
                        height={d.box.maxY - d.box.minY + 2 * pad}
                        rx={3 * u}
                        fill="none"
                        stroke={color}
                        strokeWidth={2 * u}
                        strokeDasharray={`${5 * u} ${3 * u}`}
                      />
                      <g transform={`translate(${d.box.minX - pad} ${d.box.minY - pad})`}>
                        <rect x={-8 * u} y={-8 * u} width={16 * u} height={16 * u} rx={3 * u} fill={color} />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={10 * u} fontWeight={700} fill="#fff">
                          {String.fromCharCode(65 + (di % 26))}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* Vértices internos de lo elegido (al pasar por «Redondear internos») */}
            {showInner && shown
              ? innerCorners.map((c) => {
                  const n = shown.paths[c.ref.path]?.subs[c.ref.sub]?.nodes[c.ref.node];
                  return n ? <circle key={`${refKey(c.ref)}:${c.ref.node}`} cx={n.p.x} cy={n.p.y} r={5 * u} fill="none" stroke="#f97316" strokeWidth={2 * u} style={{ pointerEvents: 'none' }} /> : null;
                })
              : null}

            {/* Círculo para redondear el vértice elegido */}
            {(() => {
              const w = tool === 'nodos' && dragging !== 'round' ? roundWidget() : null;
              return w ? (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={w.x} cy={w.y} r={4.5 * u} fill="#fff" stroke="#2563eb" strokeWidth={1.4 * u} />
                  <circle cx={w.x} cy={w.y} r={1.6 * u} fill="#2563eb" />
                </g>
              ) : null;
            })()}
            {dragging === 'round' && roundInfo != null && selNodeData ? (
              <text x={selNodeData.p.x + 10 * u} y={selNodeData.p.y - 10 * u} fontSize={11 * u} fill="#2563eb" fontWeight={600} stroke="#fff" strokeWidth={3 * u} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                {roundInfo > 0 ? `radio ${mm(roundInfo, 2)} mm` : 'sin redondear'}
              </text>
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
                        const isSel = nodeSel.some((x) => sameNode(x, ref));
                        const showHandles =
                          nodeTool && !!selNode && selNode.path === r.path && selNode.sub === r.sub && Math.abs(selNode.node - ni) <= 1;
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

            {/* «Añadir nodo»: dónde caería */}
            {tool === 'sumarNodo' && segHover && !dragging ? (
              <g style={{ pointerEvents: 'none' }}>
                <circle cx={segHover.x} cy={segHover.y} r={4 * u} fill="#fff" stroke="#2563eb" strokeWidth={1.4 * u} />
                <circle cx={segHover.x} cy={segHover.y} r={1.6 * u} fill="#2563eb" />
              </g>
            ) : null}

            {/* Giro en curso */}
            {dragging === 'rotate' && rotateInfo != null && shownSelBox ? (
              <g style={{ pointerEvents: 'none' }}>
                <circle cx={(shownSelBox.minX + shownSelBox.maxX) / 2} cy={(shownSelBox.minY + shownSelBox.maxY) / 2} r={3 * u} fill="#2563eb" />
                <text
                  x={(shownSelBox.minX + shownSelBox.maxX) / 2 + 8 * u}
                  y={(shownSelBox.minY + shownSelBox.maxY) / 2 - 8 * u}
                  fontSize={11 * u}
                  fill="#2563eb"
                  fontWeight={600}
                  stroke="#fff"
                  strokeWidth={3 * u}
                  paintOrder="stroke"
                >
                  {mm(rotateInfo, 1)}°
                </text>
              </g>
            ) : null}

            {/* Línea del cuchillo */}
            {knifeLine ? (
              <line
                x1={knifeLine.a.x}
                y1={knifeLine.a.y}
                x2={knifeLine.b.x}
                y2={knifeLine.b.y}
                stroke="#dc2626"
                strokeWidth={1.5 * u}
                strokeDasharray={`${4 * u} ${2 * u}`}
                style={{ pointerEvents: 'none' }}
              />
            ) : null}

            {/* Medida */}
            {measure ? (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={measure.a.x} y1={measure.a.y} x2={measure.b.x} y2={measure.b.y} stroke="#ea580c" strokeWidth={1.5 * u} />
                {[measure.a, measure.b].map((q, qi) => (
                  <circle key={qi} cx={q.x} cy={q.y} r={3 * u} fill="#fff" stroke="#ea580c" strokeWidth={1.4 * u} />
                ))}
                <text
                  x={(measure.a.x + measure.b.x) / 2 + 6 * u}
                  y={(measure.a.y + measure.b.y) / 2 - 6 * u}
                  fontSize={11 * u}
                  fill="#c2410c"
                  fontWeight={600}
                  stroke="#fff"
                  strokeWidth={3 * u}
                  paintOrder="stroke"
                >
                  {mm(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y) * k, 2)} mm
                  {`  (↔ ${mm(Math.abs(measure.b.x - measure.a.x) * k, 2)}  ↕ ${mm(Math.abs(measure.b.y - measure.a.y) * k, 2)})`}
                </text>
              </g>
            ) : null}
          </svg>
          {/* Zoom: el mismo control que en el visor del chequeo. */}
          <div
            className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-md border bg-background/90 p-0.5 text-xs shadow-sm"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="rounded px-2 py-0.5 hover:bg-muted" onClick={() => zoomBy(1.5)} title="Alejar (rueda)">
              −
            </button>
            <button type="button" className="rounded px-2 py-0.5 hover:bg-muted" onClick={() => zoomBy(1 / 1.5)} title="Acercar (rueda)">
              +
            </button>
            <button type="button" className="rounded px-2 py-0.5 font-medium hover:bg-muted" onClick={fitAll} title="Ver todo el dibujo (tecla 0)">
              Ver todo
            </button>
            <span className="px-1.5 tabular-nums text-muted-foreground">{mm(view.w * k, view.w * k < 10 ? 1 : 0)} mm de ancho</span>
          </div>
          {tool !== 'mover' ? (
            <div className="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-blue-600 px-2.5 py-1 text-xs text-white shadow-md">
              {TOOL_NAME[tool]}
              <button
                type="button"
                className="rounded bg-white/20 px-1.5 py-0.5 hover:bg-white/30"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setTool('mover');
                  setSelNode(null);
                }}
              >
                Listo (Esc)
              </button>
            </div>
          ) : null}
          {/* Aviso de lo que se hizo: flota sobre el dibujo, no corre nada de lugar. */}
          {notice ? (
            <div
              key={notice.id}
              role="status"
              className={cn(
                'pointer-events-none absolute left-1/2 top-2 max-w-[90%] -translate-x-1/2 rounded-md px-3 py-1.5 text-xs shadow-md animate-in fade-in',
                notice.tone === 'ok'
                  ? 'bg-slate-900/85 text-white'
                  : 'bg-amber-100 text-amber-950 ring-1 ring-amber-300 dark:bg-amber-900 dark:text-amber-50',
              )}
            >
              {notice.text}
            </div>
          ) : null}
          {showRelief ? (
            <div className="pointer-events-none absolute bottom-2 right-2 flex max-w-[60%] items-center gap-2 rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
              <span
                className="inline-block h-2.5 w-12 shrink-0 rounded-sm"
                style={{ background: 'linear-gradient(90deg, rgb(214,160,96), rgb(92,58,28))' }}
              />
              <span>
                {relief
                  ? `Claro = arriba (marca); oscuro = hondo, hasta ${mm(report.profile.finalDepthMm, 1)} mm. Claro entre letras: la fresa no bajó.`
                  : 'Calculando el relieve…'}
              </span>
            </div>
          ) : null}
        </div>
        </div>

        {/* Menú del clic derecho */}
        {menu ? (
          <div
            data-fresa-menu
            role="menu"
            className="absolute z-20 w-[220px] rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {(() => {
              const item = (label: string, action: () => void, opts: { keys?: string; disabled?: boolean; danger?: boolean } = {}) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  disabled={opts.disabled}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent',
                    opts.danger && 'text-red-600 dark:text-red-400',
                  )}
                  onClick={() => {
                    setMenu(null);
                    action();
                  }}
                >
                  <span>{label}</span>
                  {opts.keys ? <span className="text-[10px] text-muted-foreground">{opts.keys}</span> : null}
                </button>
              );
              const sep = (key: string) => <div key={key} className="my-1 border-t" />;
              const off = mm(Math.abs(num(offsetMm)) || 0.05);
              if (menu.target === 'nodo') {
                return [
                  item(`Redondear ${mm(roundR, 2)} mm`, doRoundNode, { disabled: !selCorner }),
                  item('Esquina (sin manijas)', doNodeCorner, { disabled: !selNodeData?.i && !selNodeData?.o }),
                  item('Suave (manijas alineadas)', doNodeSmooth),
                  sep('s1'),
                  item('Borrar nodo', doDeleteNode, { keys: 'Supr', danger: true }),
                ];
              }
              if (menu.target === 'pieza') {
                return [
                  item(nodeTool ? 'Volver a Selección' : 'Selección directa (nodos)', () => {
                    setTool(nodeTool ? 'mover' : 'nodos');
                    setSelNode(null);
                  }, { keys: nodeTool ? 'V' : 'A' }),
                  item('Acercar', frameSelection, { keys: 'F' }),
                  sep('s1'),
                  item('Agrandar 1 %', () => scaleBy(1.01)),
                  item('Achicar 1 %', () => scaleBy(0.99)),
                  item(`Engordar ${off} mm`, () => doOffset(1)),
                  item(`Afinar ${off} mm`, () => doOffset(-1)),
                  item('Girar 90° a la derecha', () => doRotate(90)),
                  item('Espejar izquierda ↔ derecha', () => doMirror('x')),
                  item('Simplificar nodos', doSimplify),
                  item(`Redondear internos (${innerCorners.length})`, doRoundInternal, { disabled: !innerCorners.length }),
                  sep('s2'),
                  item('Copiar', () => doCopy(), { keys: 'Ctrl+C' }),
                  item('Cortar', () => doCopy(true), { keys: 'Ctrl+X' }),
                  item('Duplicar', doDuplicate, { keys: 'Ctrl+D' }),
                  item(`Unir ${nSel > 1 ? nSel : ''} piezas`.replace('  ', ' '), doUnion, { keys: 'Ctrl+G', disabled: nSel < 2 }),
                  item('Restar (a la de abajo)', () => doBoolean('restar'), { disabled: nSel < 2 }),
                  item('Intersecar', () => doBoolean('intersecar'), { disabled: nSel < 2 }),
                  item('Excluir', () => doBoolean('excluir'), { disabled: nSel < 2 }),
                  item('Dividir', () => doBoolean('dividir'), { disabled: nSel < 2 }),
                  sep('s3'),
                  item(nSel > 1 ? `Borrar ${nSel} piezas` : 'Borrar pieza', doDeleteSelection, { keys: 'Supr', danger: true }),
                ];
              }
              return [
                item('Elegir todo', () => setSelection(pieces.map(keyOf)), { keys: 'Ctrl+A' }),
                item('Ver todo', fitAll, { keys: '0' }),
                item('Pegar', () => doPaste(), { keys: 'Ctrl+V', disabled: !editorClipboard }),
                item('Pegar en el mismo lugar', () => doPaste(true), { keys: 'Ctrl+Shift+V', disabled: !editorClipboard }),
                sep('s1'),
                item('Deshacer', undo, { keys: 'Ctrl+Z', disabled: idx === 0 }),
                item('Rehacer', redo, { keys: 'Ctrl+Y', disabled: idx >= history.length - 1 }),
              ];
            })()}
          </div>
        ) : null}

        <div className="flex shrink-0 items-start justify-between gap-2">
          {/* Alto fijo (2 renglones): cambiar de modo no achica el dibujo. */}
          <p className="h-8 overflow-hidden text-xs leading-4 text-muted-foreground">{hint}</p>
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
          // Flota sobre el dibujo (no lo achica).
          <ul className="absolute bottom-10 right-0 z-10 grid w-[min(560px,100%)] grid-cols-1 gap-x-4 gap-y-0.5 rounded-md border bg-background p-2.5 text-[11px] text-muted-foreground shadow-lg sm:grid-cols-2">
            <li>
              <b>Clic</b> elegir · <b>arrastrar</b> mover · <b>en el fondo</b> elegir varias
            </li>
            <li>
              <b>Doble clic</b> en una pieza: sus nodos · <b>Esc</b> soltar
            </li>
            <li>
              <b>Esquinas</b> de lo elegido: escalar (<b>Alt</b> desde el centro)
            </li>
            <li>
              <b>Clic derecho</b> acciones de la pieza, el nodo o el fondo
            </li>
            <li>
              <b>Rueda</b> zoom · <b>rueda apretada</b> o <b>Espacio</b> + arrastrar: moverse
            </li>
            <li>
              <b>Shift+clic</b> sumar o sacar · <b>Ctrl+A</b> todo
            </li>
            <li>
              <b>Flechas</b> mover ({mm(step)} mm; Shift ×10) · <b>Supr</b> borrar
            </li>
            <li>
              Al arrastrar: <b>Shift</b> un solo eje · <b>Ctrl</b> sin imán · <b>G</b> imán sí/no{original ? <> · <b>O</b> original sí/no</> : null}
            </li>
            <li>
              <b>V</b> selección · <b>A</b> directa (nodos) · <b>+</b> / <b>−</b> añadir / borrar nodo · <b>Shift+C</b> convertir
            </li>
            <li>
              <b>M</b> rectángulo · <b>L</b> elipse · <b>C</b> cuchillo · <b>R</b> girar · <b>I</b> medir · <b>H</b> mano · <b>Z</b> zoom
            </li>
            <li>
              <b>F</b> acercar a lo elegido · <b>0</b> ver todo · <b>Esc</b> volver a Selección
            </li>
            <li>
              <b>Ctrl+Z</b> / <b>Ctrl+Y</b> deshacer / rehacer
            </li>
            <li>
              <b>Ctrl+C</b> copiar · <b>Ctrl+X</b> cortar · <b>Ctrl+D</b> duplicar
            </li>
            <li>
              <b>Ctrl+V</b> pegar al lado · <b>Ctrl+Shift+V</b> en el mismo lugar
            </li>
            <li>
              Vértice elegido: arrastrar el <b>círculo</b> para redondear
            </li>
            <li>
              <b>Ctrl+G</b> unir lo elegido en una pieza
            </li>
          </ul>
        ) : null}
      </div>

      {/* ---------------------------------------------------- panel */}
      {/*
        Estructura fija: todos los controles están siempre (deshabilitados si no
        se pueden usar) y los textos que cambian tienen un alto fijo. Así nada se
        corre de lugar al tocar un botón y se puede tocar dos veces seguidas.
      */}
      <aside className="flex w-full shrink-0 flex-col gap-2 text-sm md:min-h-0 md:w-[330px]">
        {/* Lo de arriba se desplaza si no entra; «Terminar edición» queda siempre a la vista. */}
        <div className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
        <div
          className={cn(
            'space-y-1 rounded-md border p-2.5 text-xs',
            live == null
              ? 'bg-muted/40'
              : liveProblems === 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
          )}
        >
          <p className="flex h-5 items-center gap-1.5 font-medium">
            {live == null ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            ) : liveProblems === 0 ? (
              <CheckCircle2 className="size-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {live == null
                ? 'Chequeando la fresa…'
                : liveProblems === 0
                  ? 'La fresa separa todo'
                  : `${liveProblems} lugar${liveProblems === 1 ? '' : 'es'} donde se pierde el diseño`}
            </span>
            {checking && live ? (
              <span className="ml-auto flex shrink-0 items-center gap-1 font-normal opacity-70" title="Se está volviendo a chequear con el último cambio">
                <Loader2 className="size-3 animate-spin" />
                actualizando
              </span>
            ) : null}
          </p>
          <div className="flex h-6 items-center gap-1 overflow-x-auto">
            {liveGroups.length ? (
              <>
                <span className="shrink-0 opacity-80">Ir a:</span>
                {liveGroups.map((g, gi) => (
                  <button
                    key={g.id}
                    type="button"
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white hover:opacity-80"
                    style={{ background: SEVERITY_FILL[g.severity] }}
                    onClick={() => zoomTo({ minX: g.bounds.minX / k, minY: g.bounds.minY / k, maxX: g.bounds.maxX / k, maxY: g.bounds.maxY / k })}
                    title="Acercar a este lugar"
                  >
                    {gi + 1}
                  </button>
                ))}
              </>
            ) : (
              <span className="opacity-70">{live ? 'Nada para corregir.' : ''}</span>
            )}
          </div>
          <p
            className={cn('flex h-4 items-center gap-2 whitespace-nowrap tabular-nums', sizeChanged ? 'font-medium text-amber-700 dark:text-amber-300' : 'opacity-80')}
            title={sizeChanged ? `Antes: ${mm(sizeBefore.w, 1)} × ${mm(sizeBefore.h, 1)} mm` : undefined}
          >
            <span>Medida del sello: {sizeNow ? `${mm(sizeNow.w, 1)} × ${mm(sizeNow.h, 1)} mm` : '—'}</span>
            {sizeChanged ? <span className="truncate font-normal opacity-80">antes {mm(sizeBefore.w, 1)} × {mm(sizeBefore.h, 1)}</span> : null}
          </p>
        </div>

        {original ? (
          <div
            className={cn(
              'space-y-1 rounded-md border p-2.5 text-xs',
              comparison?.status === 'diferencias'
                ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-950 dark:bg-fuchsia-950/40 dark:text-fuchsia-100'
                : comparison?.status === 'ok'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'bg-muted/40',
            )}
          >
            <p className="flex h-5 items-center gap-1.5 font-medium">
              {origError || comparison?.status === 'sin-alinear' || comparison?.status === 'error' ? (
                <AlertTriangle className="size-3.5 shrink-0" />
              ) : !comparison ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : comparison.status === 'ok' ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="size-3.5 shrink-0" />
              )}
              <span className="truncate" title={comparison?.status === 'diferencias' ? resumenDiferencias(diffs) : undefined}>
                {origError
                  ? 'No se pudo cargar el original'
                  : !comparison
                    ? 'Comparando con el original…'
                    : comparison.status === 'ok'
                      ? 'No falta nada del original'
                      : comparison.status === 'sin-alinear'
                        ? 'No se pudo alinear con el original'
                        : comparison.status === 'error'
                          ? 'No se pudo comparar con el original'
                          : `Revisar: ${resumenDiferencias(diffs).toLowerCase()}`}
              </span>
              {diffs.length ? (
                <label className="ml-auto flex shrink-0 items-center gap-1 font-normal" title="Mostrar las marcas sobre el dibujo">
                  <Checkbox checked={showDiffs} onCheckedChange={(v) => setShowDiffs(Boolean(v))} />
                  Marcas
                </label>
              ) : null}
            </p>
            <div className="flex h-6 items-center gap-1 overflow-x-auto">
              {diffs.length ? (
                <>
                  <span className="shrink-0 opacity-80">Ir a:</span>
                  {diffs.map((d, di) => (
                    <button
                      key={d.id}
                      type="button"
                      className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white hover:opacity-80"
                      style={{ background: d.kind === 'sobra' ? SOBRA_COLOR : ORIGINAL_COLOR }}
                      onClick={() => {
                        setShowOriginal(true);
                        zoomTo(d.box, 3);
                      }}
                      title={`${textoDiferencia(d)} (${mm(d.areaMm2, 2)} mm²). Clic: acercar.`}
                    >
                      {String.fromCharCode(65 + (di % 26))}
                    </button>
                  ))}
                </>
              ) : (
                <span className="truncate opacity-70">
                  {comparison?.status === 'sin-alinear'
                    ? 'El original no coincide con este vector: revisalo a ojo con la capa.'
                    : comparison?.status === 'error' || origError
                      ? (comparison?.error ?? origError)
                      : 'Lo que se ve en color quedó afuera del vector (tecla O).'}
                </span>
              )}
            </div>
          </div>
        ) : null}

        <Section title="Diseño entero" extra={docMm ? `${mm(docMm.w)} × ${mm(docMm.h)} mm` : undefined}>
          <Row label="Medida">
            <input
              className="h-7 w-16 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
              inputMode="decimal"
              value={sizeW}
              onChange={(e) => onSizeText('w', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') resizeAll();
              }}
              aria-label="Ancho del diseño en mm"
              title="Ancho del diseño entero (mm). Enter para aplicar"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <input
              className="h-7 w-16 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
              inputMode="decimal"
              value={sizeH}
              onChange={(e) => onSizeText('h', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') resizeAll();
              }}
              aria-label="Alto del diseño en mm"
              title="Alto del diseño entero (mm). Enter para aplicar"
            />
            <span className="text-xs text-muted-foreground">mm</span>
            <button
              type="button"
              className={cn(iconBtn, !sizeLock && 'text-amber-600 dark:text-amber-400')}
              aria-pressed={sizeLock}
              onClick={() => {
                const next = !sizeLock;
                setSizeLock(next);
                // Al volver a trabar, el alto sigue al ancho.
                if (next && docMm && num(sizeW) > 0) setSizeH(mm((num(sizeW) * docMm.h) / docMm.w));
              }}
              title={sizeLock ? 'Respeta la proporción (tocá para poder deformar)' : 'Sin respetar la proporción: deforma el diseño'}
            >
              {sizeLock ? <Link2 className="size-3.5" /> : <Link2Off className="size-3.5" />}
            </button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={!docBox} onClick={resizeAll}>
              Aplicar
            </Button>
          </Row>
          <Row label="Girar">
            <input
              type="range"
              min={-180}
              max={180}
              step={0.5}
              className="h-7 min-w-0 flex-1 accent-primary"
              value={num(allAngle) || 0}
              disabled={!docBox}
              onChange={(e) => previewRotateAll(e.target.value)}
              onPointerUp={() => rotateAll(num(allAngle))}
              onKeyUp={() => rotateAll(num(allAngle))}
              aria-label="Girar el diseño entero"
              title="Arrastrá para girar todo el diseño (se aplica al soltar)"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{mm(num(allAngle) || 0, 1)}°</span>
          </Row>
          <div className="flex flex-wrap items-center gap-1.5 pl-[3.375rem]">
            <button type="button" className={iconBtn} disabled={!docBox} onClick={() => rotateAll(-90)} title="Girar todo 90° a la izquierda">
              <RotateCcw className="size-3.5" />
            </button>
            <button type="button" className={iconBtn} disabled={!docBox} onClick={() => rotateAll(90)} title="Girar todo 90° a la derecha">
              <RotateCw className="size-3.5" />
            </button>
            <input
              className="h-7 w-12 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
              inputMode="decimal"
              value={allAngleText}
              onChange={(e) => setAllAngleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rotateAll(num(allAngleText));
              }}
              aria-label="Grados para girar el diseño entero"
              title="Grados a girar todo el diseño (negativo: a la izquierda). Enter para aplicar"
            />
            <span className="text-xs text-muted-foreground">°</span>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={!docBox} onClick={() => rotateAll(num(allAngleText))}>
              Girar todo
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Cambia la medida con la que se fabrica. Si cambiás la medida o lo girás, se guarda con la medida nueva.
          </p>
        </Section>

        <Section
          title={nSel > 1 ? `${nSel} piezas elegidas` : nSel ? 'Pieza elegida' : 'Pieza'}
          extra={
            <span className="flex items-center gap-1.5">
              <span className="tabular-nums">
                {selBox ? `${mm((selBox.maxX - selBox.minX) * k)} × ${mm((selBox.maxY - selBox.minY) * k)} mm` : 'ninguna elegida'}
              </span>
              <button type="button" className="inline-flex size-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                disabled={!nSel} onClick={() => doCopy()} title="Copiar (Ctrl+C): se puede pegar acá o en el editor de otro sello" aria-label="Copiar">
                <Copy className="size-3.5" />
              </button>
              <button type="button" className="inline-flex size-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                disabled={!nSel} onClick={doDuplicate} title="Duplicar (Ctrl+D)" aria-label="Duplicar">
                <CopyPlus className="size-3.5" />
              </button>
              <button type="button" className="inline-flex size-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                disabled={!editorClipboard} onClick={() => doPaste()} title="Pegar (Ctrl+V; Ctrl+Shift+V en el mismo lugar)" aria-label="Pegar">
                <ClipboardPaste className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded text-red-600 hover:bg-red-500/10 dark:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent"
                disabled={!nSel}
                onClick={doDeleteSelection}
                title={nSel > 1 ? `Borrar las ${nSel} piezas (Supr)` : 'Borrar lo elegido (Supr)'}
                aria-label="Borrar lo elegido"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          }
        >
          <p className="h-4 truncate text-[11px] text-muted-foreground">
            {nSel ? 'Shift+clic en el dibujo suma o saca piezas.' : 'Tocá una pieza, o arrastrá un rectángulo en el fondo.'}
          </p>
          <fieldset disabled={!nSel} className="space-y-2">
            <Row label="Mover">
              <button type="button" className={iconBtn} onClick={() => nudge(-step, 0)} title="Izquierda (flecha ←)">
                <ArrowLeft className="size-3.5" />
              </button>
              <button type="button" className={iconBtn} onClick={() => nudge(0, -step)} title="Arriba (flecha ↑)">
                <ArrowUp className="size-3.5" />
              </button>
              <button type="button" className={iconBtn} onClick={() => nudge(0, step)} title="Abajo (flecha ↓)">
                <ArrowDown className="size-3.5" />
              </button>
              <button type="button" className={iconBtn} onClick={() => nudge(step, 0)} title="Derecha (flecha →)">
                <ArrowRight className="size-3.5" />
              </button>
              <select
                className="h-7 rounded border bg-background px-1 text-xs"
                value={stepMm}
                onChange={(e) => setStepMm(e.target.value)}
                title="Cuánto se mueve por toque (Shift + flecha: 10 veces más)"
              >
                {['0.02', '0.05', '0.1', '0.5'].map((v) => (
                  <option key={v} value={v}>
                    {v.replace('.', ',')} mm
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Tamaño">
              <Button type="button" size="sm" variant="outline" className="h-7 w-11 px-0" onClick={() => scaleBy(0.99)} title="Achicar 1 %, parejo, desde el centro">
                −1 %
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 w-11 px-0" onClick={() => scaleBy(1.01)} title="Agrandar 1 %, parejo, desde el centro">
                +1 %
              </Button>
              <input
                className="h-7 w-12 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
                inputMode="decimal"
                value={scalePct}
                onChange={(e) => setScalePct(e.target.value)}
                onKeyDown={(e) => {
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
              <Button type="button" size="sm" variant="outline" className="h-7 w-[4.5rem] px-0" onClick={() => doOffset(-1)} title="Offset interior: afina en paralelo">
                Afinar
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 w-[4.5rem] px-0" onClick={() => doOffset(1)} title="Offset exterior: engorda en paralelo">
                Engordar
              </Button>
              <input
                className="h-7 w-12 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
                inputMode="decimal"
                value={offsetMm}
                onChange={(e) => setOffsetMm(e.target.value)}
                title="Cuánto afinar o engordar (offset interior / exterior)"
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </Row>
            <Row label="Girar">
              <button type="button" className={iconBtn} onClick={() => doRotate(-90)} title="Girar 90° a la izquierda">
                <RotateCcw className="size-3.5" />
              </button>
              <button type="button" className={iconBtn} onClick={() => doRotate(90)} title="Girar 90° a la derecha">
                <RotateCw className="size-3.5" />
              </button>
              <button type="button" className={iconBtn} onClick={() => doMirror('x')} title="Espejar izquierda ↔ derecha">
                <FlipHorizontal2 className="size-3.5" />
              </button>
              <button type="button" className={iconBtn} onClick={() => doMirror('y')} title="Espejar arriba ↕ abajo">
                <FlipVertical2 className="size-3.5" />
              </button>
              <input
                className="h-7 w-12 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
                inputMode="decimal"
                value={angleDeg}
                onChange={(e) => setAngleDeg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doRotate(num(angleDeg));
                }}
                title="Grados a girar (negativo: a la izquierda). Enter para aplicar"
              />
              <span className="text-xs text-muted-foreground">°</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => doRotate(num(angleDeg))}>
                Girar
              </Button>
            </Row>
            <Row label="Distanciar">
              <input
                className="h-7 w-12 rounded border bg-background px-1.5 text-right text-xs tabular-nums"
                inputMode="decimal"
                value={spreadMm}
                onChange={(e) => setSpreadMm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doSpread(1);
                }}
                title="Cuánto se agranda (o achica) cada espacio. Enter para separar"
              />
              <span className="text-xs text-muted-foreground">mm</span>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={!spread} onClick={() => doSpread(1)}
                title={spread ? 'Agranda cada espacio lo mismo' : 'Elegí 2 piezas o más (por ejemplo, todas las letras del renglón)'}>
                Separar
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={!spread} onClick={() => doSpread(-1)} title="Achica cada espacio lo mismo">
                Juntar
              </Button>
            </Row>
            <div className="flex flex-wrap items-center gap-1.5 pl-[3.375rem]">
              <div className="flex rounded border" role="group" aria-label="Desde dónde se distancia">
                {(
                  [
                    ['start', spread?.axis === 'y' ? 'Arriba' : 'Izq.', spread?.axis === 'y' ? 'Queda fijo lo de arriba' : 'Queda fijo lo de la izquierda'],
                    ['center', 'Centro', 'Se abre hacia los dos lados; el centro queda en su lugar'],
                    ['end', spread?.axis === 'y' ? 'Abajo' : 'Der.', spread?.axis === 'y' ? 'Queda fijo lo de abajo' : 'Queda fijo lo de la derecha'],
                  ] as const
                ).map(([id, label, help]) => (
                  <button key={id} type="button" aria-pressed={spreadAnchor === id} onClick={() => setSpreadAnchor(id)} title={help}
                    className={cn('h-7 px-2 text-xs', spreadAnchor === id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground"
                title="Las letras de cada palabra se mueven juntas: solo crece el espacio entre palabras. Sin esto, crece el espacio entre todas las piezas.">
                <Checkbox checked={spreadWords} onCheckedChange={(v) => setSpreadWords(v === true)} />
                Por palabras{spread && spreadWords ? ` (${spread.groups.length})` : ''}
              </label>
            </div>
            {/* Alinear (2+) y espaciar parejo (3+), en un solo renglón de íconos. */}
            <div className="flex items-center gap-1" role="group" aria-label="Alinear y espaciar">
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
                <button
                  key={mode}
                  type="button"
                  className={iconBtn}
                  disabled={nSel < 2}
                  onClick={() => doAlign(mode)}
                  title={nSel < 2 ? `Alinear (${label.toLowerCase()}): elegí 2 piezas o más` : `Alinear: ${label}`}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
              <span className="mx-1 h-5 border-l" aria-hidden />
              <button
                type="button"
                className={iconBtn}
                disabled={nSel < 3}
                onClick={() => doDistribute('x')}
                title={nSel < 3 ? 'Espaciar parejo ↔: elegí 3 piezas o más' : 'Espaciar parejo ↔: mismo espacio entre las piezas, de izquierda a derecha (las de los extremos no se mueven)'}
              >
                <AlignHorizontalDistributeCenter className="size-3.5" />
              </button>
              <button
                type="button"
                className={iconBtn}
                disabled={nSel < 3}
                onClick={() => doDistribute('y')}
                title={nSel < 3 ? 'Espaciar parejo ↕: elegí 3 piezas o más' : 'Espaciar parejo ↕: mismo espacio entre las piezas, de arriba a abajo (las de los extremos no se mueven)'}
              >
                <AlignVerticalDistributeCenter className="size-3.5" />
              </button>
            </div>
          </fieldset>
        </Section>

        <Section title="Buscatrazos" extra={nSel < 2 ? 'elegí 2 piezas o más' : `${nSel} piezas`}>
          <div className="flex items-center gap-1" role="group" aria-label="Buscatrazos">
            {(
              [
                ['unir', 'Unir', 'Unir: lo que se pisa queda una sola pieza (Ctrl+G)'],
                ['restar', 'Restar', 'Restar: a la de más abajo se le saca todo lo que tiene encima'],
                ['intersecar', 'Intersecar', 'Intersecar: queda solo lo que tienen en común'],
                ['excluir', 'Excluir', 'Excluir: se saca donde se pisan'],
                ['dividir', 'Dividir', 'Dividir: cada parte que se forma al cruzarse queda como pieza aparte'],
              ] as const
            ).map(([op, label, help]) => (
              <button
                key={op}
                type="button"
                className="inline-flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded border bg-background text-[10px] text-foreground hover:bg-muted disabled:opacity-40"
                disabled={nSel < 2}
                onClick={() => (op === 'unir' ? doUnion() : doBoolean(op))}
                title={help}
              >
                <PathfinderIcon op={op} />
                {label}
              </button>
            ))}
          </div>
          <p className="h-4 truncate text-[11px] text-muted-foreground" title="Dibujá un rectángulo (M) sobre la pieza, elegí los dos y «Restar»: queda el corte con esa forma.">
            Para abrir un corte: rectángulo (M) encima → elegir los dos → Restar.
          </p>
        </Section>

        <Section
          title="Nodos"
          extra={
            <span className="tabular-nums">
              {nSel ? `${selNodes.toLocaleString('es-AR')} en lo elegido` : `${totalNodes.toLocaleString('es-AR')} en total`}
            </span>
          }
        >
          {/* Renglón de alto fijo: el nodo elegido o cómo empezar. */}
          <div className="flex h-7 items-center justify-between gap-1 text-xs">
            {!nodeTool ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setTool('nodos')}
                title="Selección directa (A). También: doble clic en la pieza"
              >
                <MousePointer className="mr-1 size-3.5" />
                Selección directa
              </Button>
            ) : (
              <>
                <span className="min-w-0 truncate text-muted-foreground">
                  {selNodeData
                    ? `Nodo: ${selNodeData.i || selNodeData.o ? (isSmooth(selNodeData) ? 'suave' : 'con curva') : 'esquina'}`
                    : 'Tocá un nodo.'}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={!selNodeData || (!selNodeData.i && !selNodeData.o)} onClick={doNodeCorner} title="Esquina: sin manijas">
                    Esquina
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={!selNodeData} onClick={doNodeSmooth} title="Suave: manijas alineadas">
                    Suave
                  </Button>
                  <button type="button" className={cn(iconBtn, 'text-red-600 dark:text-red-400')} disabled={!selNodeData} onClick={doDeleteNode} title="Borrar el nodo (Supr)">
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </>
            )}
          </div>
          {/* Redondear: el vértice elegido (editando nodos) o los internos de lo elegido. */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 tabular-nums"
              disabled={tool === 'nodos' ? !selCorner : !innerCorners.length}
              onClick={tool === 'nodos' ? doRoundNode : doRoundInternal}
              onMouseEnter={() => setShowInner(true)}
              onMouseLeave={() => setShowInner(false)}
              title={tool === 'nodos'
                ? 'Redondea el vértice elegido con un arco de este radio (también: arrastrar el círculo azul)'
                : 'Redondea los vértices internos de lo elegido: las puntas blancas donde la fresa no entra (en naranja al pasar por acá)'}
            >
              {tool === 'nodos' ? 'Redondear vértice' : `Redondear internos (${innerCorners.length})`}
            </Button>
            <select
              className="h-7 rounded border bg-background px-1 text-xs"
              value={roundMm}
              onChange={(e) => setRoundMm(e.target.value)}
              title="Radio del redondeo (si no entra, se usa el máximo posible)"
            >
              {ROUND_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  radio {v.replace('.', ',')} mm
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={simplified != null && simplified.after >= simplified.before}
              onClick={doSimplify}
              title="Deja las rectas como rectas y las curvas con pocos nodos; la forma cambia como mucho el error elegido"
            >
              Simplificar
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
          <p className="h-4 truncate text-[11px] tabular-nums text-muted-foreground">
            {simplified == null
              ? 'Calculando cuántos nodos se pueden sacar…'
              : simplified.after < simplified.before
                ? `Quedarían ${simplified.after.toLocaleString('es-AR')} de ${simplified.before.toLocaleString('es-AR')} nodos ${nSel ? 'en lo elegido' : 'en todo el dibujo'}.`
                : `Ya está simple con ese error (${nSel ? 'lo elegido' : 'todo el dibujo'}).`}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 tabular-nums"
              disabled={!extra.length}
              onClick={doRedundant}
              title="Nodos repetidos o en medio de una recta (en naranja). Sacarlos no cambia la forma."
            >
              <span className="mr-1.5 inline-block size-2 rounded-sm bg-orange-500" />
              Quitar de más ({extra.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 tabular-nums"
              disabled={!motas.length}
              onClick={doSpecks}
              title={`Piezas sueltas de menos de ${mm(SPECK_MM2)} mm² (restos de la vectorización)`}
            >
              <Eraser className="mr-1 size-3.5" />
              Borrar motas ({motas.length})
            </Button>
          </div>
        </Section>

        </div>

        <div className="flex shrink-0 items-center gap-2 border-t pt-3">
          <Button
            type="button"
            disabled={!changes || !doc}
            onClick={() =>
              doc &&
              onDone(serializeEditDoc(doc), changes, {
                registro: editLog.current,
                segundos: Math.round((Date.now() - openedAt.current) / 1000),
              })
            }
            title="Vuelve al chequeo con lo editado para compararlo y usarlo"
          >
            Terminar edición
          </Button>
          <Button type="button" variant="ghost" onClick={() => (changes ? setConfirmDiscard(true) : onCancel())}>
            Cancelar
          </Button>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {changes} cambio{changes === 1 ? '' : 's'}
          </span>
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
