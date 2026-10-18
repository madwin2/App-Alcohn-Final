import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Crosshair, Loader2, Maximize, Minus, Plus, Scan } from 'lucide-react';
import { validatePreparation, type PreparationDocument, type StampPlacement } from '@/lib/programas/preparation';
import { addStamp, columnStamps, moveStamp, placementOptions, type MesaSource } from '@/lib/programas/mesa';
import { buildFixture, FIXTURE, type FixtureModel, type Rect } from '@/lib/programas/fixture';
import { useArtwork } from '@/components/programas/Preparation/StampArtwork';
import baseC from '@/assets/programas/base-fijacion-c.svg?url';
import { cn } from '@/lib/utils/cn';
import { useStampRelief, type ReliefPad } from './useStampRelief';
import { useStampZones, type StampZones, type ZoneTone } from './useStampZones';
import { SEVERITY_FILL, SEVERITY_LABEL } from '@/lib/fresa/textos';
import { barSegments, FACE_OPS, MESA_CAMERA, type BarSegment } from '@/lib/programas/mesaRelief';
import { MACHINED_COLORS } from '@/lib/programas/mesaReliefRender';
import { PILL_GHOST } from './mesaUi';

export type SceneView = '2d' | '3d' | 'cnc';

/** Píxeles por mm con que se arma el mundo (la cámara lo escala). */
const S = 3;
const LAYOUT_CODES = ['WIDTH', 'LENGTH', 'MACHINING_LENGTH', 'SEPARATION', 'TOOL_ENVELOPE', 'MATERIAL'];
/** Vista isométrica: giro sobre la mesa y después inclinación (proyección ortográfica). */
const ISO = `rotateX(${MESA_CAMERA.tiltDeg}deg) rotateZ(${MESA_CAMERA.turnDeg}deg) scale(${MESA_CAMERA.scale})`;
const FLAT = 'rotateX(0deg) rotateZ(0deg) scale(1)';
/** Dibujo de la base C en el SVG original (unidades de Illustrator). */
const SVG_BASE = { x: 65.58, y: 82.09 };

/** La fijación queda lineal; solo Mecanizado agrega el material de las planchuelas. */
const fixtureFace = 'bg-[#090909] outline outline-[0.5px] outline-white/20';
const fixtureSide = 'bg-[#090909]';
const LOOK = {
  '2d': { plate: 'bg-transparent', plateSide: 'bg-transparent', strip: 'bg-transparent', floor: 'bg-transparent', wall: 'bg-transparent',
    bar: 'bg-white/[0.025] outline outline-1 outline-white/75', barSide: 'bg-transparent', clamp: 'bg-transparent', clampSide: 'bg-transparent' },
  '3d': { plate: fixtureFace, plateSide: fixtureSide, strip: fixtureFace, floor: fixtureFace, wall: fixtureSide,
    bar: 'bg-[#090909] outline outline-[0.5px] outline-white/60', barSide: 'bg-[#090909]', clamp: fixtureFace, clampSide: fixtureSide },
  cnc: { plate: fixtureFace, plateSide: fixtureSide, strip: fixtureFace, floor: fixtureFace, wall: fixtureSide,
    bar: 'bg-[#b69a73]', barSide: 'bg-[#86704f]', clamp: fixtureFace, clampSide: fixtureSide },
} as const;

/** Caja 3D en CSS: tapa en z1 y cuatro paredes de z0 a z1 (en 2D quedan de canto). */
function Box({ r, z0, z1, top, side, children, className, style }: {
  r: Rect; z0: number; z1: number; top: string; side: string; children?: ReactNode; className?: string; style?: CSSProperties;
}) {
  const w = (r.x1 - r.x0) * S, h = (r.y1 - r.y0) * S, dz = (z1 - z0) * S;
  const base: CSSProperties = { position: 'absolute', transformStyle: 'preserve-3d' };
  return (
    <div className={className} style={{ ...base, left: r.x0 * S, top: r.y0 * S, width: w, height: h, ...style }}>
      <div className={cn('absolute left-0 top-0', side)} style={{ width: w, height: dz, transformOrigin: 'top', transform: `translateZ(${z0 * S}px) rotateX(90deg)` }} />
      <div className={cn('absolute left-0', side)} style={{ top: h, width: w, height: dz, transformOrigin: 'top', transform: `translateZ(${z0 * S}px) rotateX(90deg)`, filter: 'brightness(1.25)' }} />
      <div className={cn('absolute left-0 top-0', side)} style={{ width: dz, height: h, transformOrigin: 'left', transform: `translateZ(${z0 * S}px) rotateY(-90deg)`, filter: 'brightness(0.85)' }} />
      <div className={cn('absolute top-0', side)} style={{ left: w, width: dz, height: h, transformOrigin: 'left', transform: `translateZ(${z0 * S}px) rotateY(-90deg)` }} />
      <div className={cn('absolute inset-0', top)} style={{ transform: `translateZ(${z1 * S}px)` }}>{children}</div>
    </div>
  );
}

/**
 * Planchuela por tramos (bruto, rebajada, ranura de corte) como un solo
 * sólido escalonado. Cada arista tiene un único dueño para que la vista
 * lineal no duplique ni engrose líneas: la tapa de cada tramo dibuja su
 * contorno; los laterales, solo la arista de abajo; puntas y escalones,
 * solo sus aristas verticales (y las puntas, también la de abajo).
 */
function BarSolid({ b, segments, view, sideClass }: {
  b: Rect; segments: BarSegment[]; view: SceneView; sideClass: string;
}) {
  const lineal = view === '3d', cnc = view === 'cnc';
  const w = (b.x1 - b.x0) * S;
  const height = (g: BarSegment) => FIXTURE.barHeightMm - g.depthMm;
  const color = (g: BarSegment) => g.kind === 'corte' ? MACHINED_COLORS.cut : g.kind === 'mecanizado' ? MACHINED_COLORS.lowered : MACHINED_COLORS.top;
  const edge = lineal ? 'border-white/60' : 'border-transparent';
  const walls: { y: number; lo: number; hi: number; end: boolean }[] = [];
  walls.push({ y: segments[0].y0, lo: 0, hi: height(segments[0]), end: true });
  for (let i = 0; i + 1 < segments.length; i++) {
    const a = height(segments[i]), c = height(segments[i + 1]);
    if (Math.abs(a - c) > 1e-6) walls.push({ y: segments[i].y1, lo: Math.min(a, c), hi: Math.max(a, c), end: false });
  }
  const last = segments[segments.length - 1];
  walls.push({ y: last.y1, lo: 0, hi: height(last), end: true });
  return (
    <>
      {segments.map((g, i) => {
        const top = g.y0 * S, len = (g.y1 - g.y0) * S, dz = height(g) * S;
        return [
          <div key={`t${i}`} className={cn('absolute', lineal ? 'bg-[#090909] outline outline-[0.5px] outline-white/60' : 'bg-transparent')}
            style={{ left: b.x0 * S, top, width: w, height: len, transform: `translateZ(${dz}px)`, ...(cnc ? { background: color(g) } : {}) }} />,
          ...[b.x0, b.x1].map((x, k) => (
            <div key={`s${i}${k}`} className={cn('absolute', sideClass, lineal && 'border-l-[0.5px]', edge)}
              style={{ left: x * S, top, width: dz, height: len, transformOrigin: 'left', transform: 'rotateY(-90deg)', filter: cnc && k === 0 ? 'brightness(0.85)' : undefined }} />
          )),
        ];
      })}
      {walls.map((wl, i) => (
        <div key={`w${i}`} className={cn('absolute', sideClass, lineal && 'border-x-[0.5px]', lineal && wl.end && 'border-t-[0.5px]', edge)}
          style={{ left: b.x0 * S, top: wl.y * S, width: w, height: (wl.hi - wl.lo) * S, transformOrigin: 'top',
            transform: `translateZ(${wl.lo * S}px) rotateX(90deg)`, filter: cnc ? 'brightness(1.2)' : undefined }} />
      ))}
    </>
  );
}

const ringsPath = (rings: { x: number; y: number }[][]) => rings.map((r) => `M${r.map((q) => `${q.x} ${q.y}`).join('L')}Z`).join('');
const SEVERITY_ORDER: ZoneTone[] = ['baja', 'repaso', 'media', 'alta'];
const ZONE_FILL: Record<ZoneTone, string> = { ...SEVERITY_FILL, repaso: '#2dd4bf' };
const ZONE_LABEL: Record<ZoneTone, string> = { alta: SEVERITY_LABEL.alta, media: SEVERITY_LABEL.media, repaso: 'Lo saca el repaso 0,2', baja: SEVERITY_LABEL.baja };

/**
 * Zonas del chequeo de fresa sobre el sello. En 2D se alinean con el dibujo
 * (derecho, como la imagen); en 3D/Mecanizado, con el relieve (espejado y
 * acostado igual que la simulación). Las «baja» (marca menos honda, está bien)
 * van solo con contorno tenue.
 */
function ZoneOverlay({ data, view, landscape, alreadyMachined, w, h, pad, unit }: {
  data: StampZones; view: SceneView; landscape: boolean; alreadyMachined: boolean; w: number; h: number; pad: number; unit: number;
}) {
  const k = 1 / data.mmPerUnit;
  /** Las zonas suelen medir décimas de mm: un aro de tamaño fijo en pantalla las señala a cualquier zoom. */
  const shapes = (pxPerMm: number) => SEVERITY_ORDER.flatMap((sev) => data.zones.filter((z) => z.severity === sev).map((z) => (
    <g key={z.id}>
      <path d={ringsPath(z.rings)} fill={sev === 'baja' ? 'none' : ZONE_FILL[sev]} fillOpacity={0.7}
        stroke={ZONE_FILL[sev]} strokeOpacity={sev === 'baja' ? 0.7 : 1} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {sev !== 'baja' ? <circle cx={z.center.x} cy={z.center.y} r={6 * unit / pxPerMm} fill="none" stroke={ZONE_FILL[sev]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null}
    </g>
  )));
  if (view === '2d') {
    const b = data.imageBox;
    const bw = (landscape ? h : w) - pad * 2, bh = (landscape ? w : h) - pad * 2;
    const paths = shapes(Math.min(bw / b.w, bh / b.h) * k);
    return (
      <svg className="pointer-events-none absolute left-1/2 top-1/2 overflow-visible" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet"
        style={{ width: (landscape ? h : w) - pad * 2, height: (landscape ? w : h) - pad * 2, transform: `translate(-50%, -50%)${landscape ? ' rotate(90deg)' : ''}` }}>
        <g transform={`scale(${k})`}>{paths}</g>
      </svg>
    );
  }
  // Misma transformación que el lienzo de useStampRelief: centro, espejo, giro y estiramiento a la medida.
  const b = data.blackBox, rotate = !alreadyMachined && b.w > b.h;
  const sx = (rotate ? h : w) / b.w, sy = (rotate ? w : h) / b.h;
  const paths = shapes(Math.sqrt(sx * sy) * k);
  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" width={w} height={h}>
      <g transform={`translate(${w / 2} ${h / 2})${alreadyMachined ? '' : ' scale(-1 1)'}${rotate ? ' rotate(-90)' : ''} scale(${sx} ${sy}) translate(${-(b.x + b.w / 2)} ${-(b.y + b.h / 2)}) scale(${k})`}>{paths}</g>
    </svg>
  );
}

/** Ambas vistas inclinadas usan la misma superficie y proyección, con distinto material. */
function StampFace({ stamp, view, fixture, selected, bad, warn, isNew, reliefPad, visible, unit, showZones, onRelief, onZones }: {
  stamp: StampPlacement; view: SceneView; fixture: FixtureModel; selected: boolean; bad: boolean; warn: boolean;
  /** Sello que sumaría «Llenar solo» (vista previa). */
  isNew: boolean;
  /** Margen (mm) alrededor del recuadro para ver la isla y el desbaste exterior. */
  reliefPad: ReliefPad;
  /** Solo se simula lo que se ve (o ya se vio): una mesa llena no traba la pantalla. */
  visible: boolean;
  /** Píxeles del mundo por píxel de pantalla: marcas de interfaz de tamaño constante. */
  unit: number;
  onRelief: (id: string, state: 'ready' | 'pending' | 'error' | null) => void;
  showZones: boolean;
  onZones: (id: string, state: StampZones['counts'] | 'pending' | null) => void;
}) {
  const art = useArtwork(stamp.sourceUrl, stamp.vectorSvg);
  const wants = view !== '2d';
  const { relief, error } = useStampRelief(stamp, wants && visible, reliefPad);
  useEffect(() => {
    onRelief(stamp.instanceId, !wants ? null : relief ? 'ready' : error ? 'error' : 'pending');
  }, [onRelief, stamp.instanceId, wants, relief, error]);
  useEffect(() => () => onRelief(stamp.instanceId, null), [onRelief, stamp.instanceId]);
  const zones = useStampZones(stamp, showZones && visible);
  useEffect(() => { onZones(stamp.instanceId, !showZones ? null : zones ? zones.counts : 'pending'); }, [onZones, stamp.instanceId, showZones, zones]);
  useEffect(() => () => onZones(stamp.instanceId, null), [onZones, stamp.instanceId]);
  const x0 = stamp.centerX + fixture.offsetX - stamp.widthMm / 2, y0 = -stamp.topY;
  const w = stamp.widthMm * S, h = stamp.heightMm * S;
  // Sobre la planchuela el lado largo va a lo largo (vertical): un dibujo acostado se gira.
  const landscape = !!art?.landscape;
  // La caja es la medida de fabricación del vector: el dibujo va de borde a borde, sin margen.
  const pad = 0;
  return (
    <div className="absolute" style={{ left: x0 * S, top: y0 * S, width: w, height: h }}>
      {view === '2d' && art ? (
        // max-w-none: el max-width:100% de Tailwind achicaba los dibujos apaisados antes de girarlos.
        <img src={art.uri} alt="" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none object-contain"
          style={{
            width: (landscape ? h : w) - pad * 2, height: (landscape ? w : h) - pad * 2,
            transform: `translate(-50%, -50%)${landscape ? ' rotate(90deg)' : ''}`,
            filter: 'invert(1)',
          }} />
      ) : null}
      {wants && relief ? <img src={view === '3d' ? relief.lineHref : relief.bronzeHref} alt={`Relieve estimado de ${stamp.name}`} draggable={false}
        className="pointer-events-none absolute max-w-none"
        style={{ left: relief.leftMm * S, top: relief.topMm * S, width: relief.widthMm * S, height: relief.heightMm * S }} /> : null}
      {wants && !relief ? <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400" role="status">{error ? 'Sin simulación' : '…'}</span> : null}
      <div className={cn('pointer-events-none absolute inset-0 rounded-[2px]',
        view === '2d' && 'outline outline-white/45',
        isNew && 'bg-white/[0.08] outline-dashed outline-white/80',
        selected && 'outline outline-white', bad && 'bg-red-500/20 outline outline-red-400')}
        style={{ outlineWidth: (selected || bad || isNew ? 2 : 1) * Math.min(1, unit), outlineOffset: selected ? unit : 0 }} />
      {showZones && zones ? <ZoneOverlay data={zones} view={view} landscape={landscape} alreadyMachined={!!stamp.vectorSvg && !!stamp.vectorAlreadyMachined}
        w={w} h={h} pad={pad} unit={unit} /> : null}
      {showZones && zones && (zones.counts.alta || zones.counts.media || zones.counts.repaso) ? (
        // Cantidad de zonas, de tamaño fijo en pantalla: se ve aunque la vista esté lejos.
        <span className="absolute flex items-center justify-center rounded-full font-semibold tabular-nums text-white"
          title={zones.counts.alta || zones.counts.media ? `${zones.counts.alta} para corregir · ${zones.counts.media} pierden detalle` : `El repaso 0,2 pasa por ${zones.counts.repaso} ${zones.counts.repaso === 1 ? 'lugar' : 'lugares'}`}
          style={{ left: -6 * unit, top: -6 * unit, minWidth: 16 * unit, height: 16 * unit, padding: `0 ${4 * unit}px`, fontSize: 10 * unit,
            background: ZONE_FILL[zones.counts.alta ? 'alta' : zones.counts.media ? 'media' : 'repaso'], boxShadow: `0 0 0 ${2 * unit}px black` }}>
          {zones.counts.alta || zones.counts.media || zones.counts.repaso}
        </span>
      ) : null}
      {warn ? <span className="absolute rounded-full bg-amber-300" title="Revisar la fresa"
        style={{ width: 9 * unit, height: 9 * unit, right: -4 * unit, top: -4 * unit, boxShadow: `0 0 0 ${2 * unit}px black` }} /> : null}
    </div>
  );
}

/** Lo que la página le pide a la cámara del lienzo. */
export type CameraCommand = { kind: 'work' | 'all' | 'stamp' | 'in' | 'out'; id?: string; key: number };

type Ghost = { columnId: string; topY: number; wantedTop: number; w: number; h: number; valid: boolean; reason?: string; place?: string;
  preview?: PreparationDocument; instanceId?: string; clientX: number; clientY: number };

const ZOOM_MIN = 0.6, ZOOM_MAX = 14;
/** Alto reservado para los controles flotantes del lienzo. */
const TOOLBAR_PX = 44;
/** Inversa de la cámara isométrica: un rótulo queda de frente y del mismo tamaño. */
const BILLBOARD = `scale(${1 / MESA_CAMERA.scale}) rotateZ(${-MESA_CAMERA.turnDeg}deg) rotateX(${-MESA_CAMERA.tiltDeg}deg)`;
/** Misma lista de funciones que BILLBOARD, en identidad, para que la transición interpole. */
const FLAT_BILLBOARD = 'scale(1) rotateZ(0deg) rotateX(0deg)';
const TRANSITION = 'transform 900ms cubic-bezier(0.22, 0.8, 0.2, 1)';

/**
 * La máquina como es: la fijación real (base, canales y ranuras; las trabas no se dibujan), las
 * planchuelas paradas y los sellos encima. 2D lineal, 3D isométrica y 3D de
 * mecanizado, con transición continua de cámara.
 */
export function FixtureScene({ doc, view, selectedId, dragging, candidate, readOnly, warnings, highlightIds, showZones, camera, toolbar, onSelect, onDrop, onMove, onContextMenu, onHint }: {
  doc: PreparationDocument;
  view: SceneView;
  selectedId: string | null;
  dragging: MesaSource | null;
  /** Sello de la cola bajo el puntero: resalta dónde entraría. */
  candidate: MesaSource | null;
  readOnly: boolean;
  warnings: Set<string>;
  /** Sellos de la vista previa de «Llenar solo». */
  highlightIds?: Set<string>;
  /** Dibujar las zonas del chequeo de fresa sobre cada sello. */
  showZones: boolean;
  camera: CameraCommand;
  /** Controles de la página que van dentro del lienzo (arriba a la izquierda). */
  toolbar?: ReactNode;
  onSelect: (id: string | null) => void;
  onDrop: (sourceId: string, columnId: string, topY: number) => void;
  onMove: (instanceId: string, columnId: string, topY: number) => void;
  onContextMenu: (instanceId: string, clientX: number, clientY: number) => void;
  onHint: (text: string) => void;
}) {
  const fixture = useMemo(() => buildFixture(doc.machine, doc.columns), [doc.machine, doc.columns]);
  const look = LOOK[view];
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState({ zoom: 1, x: 0, y: 0, animate: false });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const drag = useRef<{ kind: 'stamp'; id: string; grabMm: number; x: number; y: number; moved: boolean } | { kind: 'pan'; x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const hinted = useRef(false);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!dragging) setGhost(null); }, [dragging]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { drag.current = null; setMovingId(null); setGhost(null); }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  const W = fixture.widthMm, H = fixture.heightMm;
  /** El usuario movió la cámara a mano (rueda, arrastre, ±): un cambio de tamaño no la re-encuadra. */
  const userMoved = useRef(false);
  const fit = Math.max(0.01, Math.min((vp.w || 800) / ((W + 24) * S), (vp.h || 600) / ((H + 40) * S)));
  const scale = fit * cam.zoom;
  const invalid = useMemo(() => new Set(validatePreparation(doc).filter((i) => LAYOUT_CODES.includes(i.code)).map((i) => i.instanceId)), [doc]);
  const fontPx = (px: number) => px / scale;

  /**
   * Encuadra un elemento del mundo midiendo su caja en pantalla: vale igual en
   * 2D y en 3D porque la proyección ya está aplicada.
   */
  const frame = (el: Element | null, margin = 28, maxZoom = ZOOM_MAX) => {
    const v = viewport.current;
    if (!el || !v) return;
    userMoved.current = false;
    const r = el.getBoundingClientRect(), vr = v.getBoundingClientRect();
    if (!r.width || !r.height || !vr.width) return;
    setCam((c) => {
      const s = fit * c.zoom;
      // Arriba quedan los controles del lienzo: el encuadre empieza debajo.
      const bar = TOOLBAR_PX;
      const cx = (r.left + r.width / 2 - (vr.left + vr.width / 2) - c.x) / s;
      const cy = (r.top + r.height / 2 - (vr.top + vr.height / 2) - c.y) / s;
      // `s` es la escala dibujada ahora; la nueva se refiere al tamaño real del lienzo
      // (puede no estar medido todavía en el estado si el pedido llega al montar).
      const fitNow = Math.min(vr.width / ((W + 24) * S), vr.height / ((H + 40) * S));
      const s2 = Math.min((vr.width - margin * 2) / (r.width / s), (vr.height - margin * 2 - bar) / (r.height / s));
      const zoom = Math.min(maxZoom, Math.max(ZOOM_MIN, s2 / fitNow));
      return { zoom, x: -cx * fitNow * zoom, y: -cy * fitNow * zoom + bar / 2, animate: true };
    });
  };
  const zoomBy = (k: number) => { userMoved.current = true; setCam((c) => {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * k)); const f = zoom / c.zoom;
    return { zoom, x: c.x * f, y: c.y * f, animate: true };
  }); };
  const run = (cmd: Omit<CameraCommand, 'key'>) => {
    const root = world.current;
    if (!root) return;
    if (cmd.kind === 'in') zoomBy(1.4);
    else if (cmd.kind === 'out') zoomBy(1 / 1.4);
    else if (cmd.kind === 'all') frame(root.querySelector('[data-fit="all"]'));
    else if (cmd.kind === 'stamp' && cmd.id) {
      // En 2D se ve el sello con sus vecinos; en 3D se acerca hasta ver el relieve.
      const el = root.querySelector(`[data-stamp="${CSS.escape(cmd.id)}"]`);
      frame(el, view === '2d' ? 120 : 60, view === '2d' ? 4 : 9);
    } else frame(root.querySelector('[data-fit="work"]'));
  };
  const runRef = useRef(run); runRef.current = run;
  // Pedidos de la página (botones y atajos).
  const lastCmd = useRef(camera.key);
  useEffect(() => {
    if (camera.key === lastCmd.current) return;
    lastCmd.current = camera.key;
    runRef.current(camera);
  }, [camera]);
  // Si el lienzo cambia de tamaño (ventana, panel, zoom del navegador): sin tocar la
  // cámara, se vuelve a encuadrar; si se movió a mano, se conserva la escala que se ve.
  const lastFit = useRef(fit);
  useEffect(() => {
    const prev = lastFit.current; lastFit.current = fit;
    if (!ready || Math.abs(prev - fit) / prev < 0.02) return;
    if (userMoved.current) { setCam((c) => ({ ...c, zoom: c.zoom * prev / fit, animate: false })); return; }
    const t = window.setTimeout(() => runRef.current(selectedRef.current ? { kind: 'stamp', id: selectedRef.current } : { kind: 'work' }), 120);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);
  // Encuadre automático al abrir, al cambiar de máquina y al terminar el giro de la vista (se mide ya proyectado).
  const ready = vp.w > 0 && vp.h > 0;
  const opened = useRef(false);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  useEffect(() => {
    if (!ready) return;
    const first = !opened.current; opened.current = true;
    const t = window.setTimeout(() => runRef.current(!first && selectedRef.current ? { kind: 'stamp', id: selectedRef.current } : { kind: 'work' }), first ? 40 : 950);
    return () => window.clearTimeout(t);
  }, [view, doc.machine, ready]);

  /** mm del mundo bajo el puntero (solo en 2D: sin rotación). */
  const toMm = (clientX: number, clientY: number) => {
    const r = world.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  };
  const columnAt = (x: number) => {
    const bar = [...fixture.bars].sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - x) - Math.abs((b.x0 + b.x1) / 2 - x))[0];
    return doc.columns.find((c) => c.id === bar.columnId)!;
  };
  const ghostAt = (clientX: number, clientY: number, x: number, wantedTop: number, w: number, h: number, ignore?: string): Ghost => {
    const col = columnAt(x);
    const result = ignore ? moveStamp(doc, ignore, col.id, wantedTop)
      : dragging ? addStamp(doc, dragging, { columnId: col.id, topY: wantedTop }) : null;
    const placed = result?.added ? result.doc.stamps.find((s) => s.instanceId === result.instanceId) : null;
    const row = placed && result?.added ? columnStamps(result.doc, col.id) : [];
    return { columnId: col.id, topY: placed?.topY ?? wantedTop, wantedTop, w, h, valid: !!placed, clientX, clientY,
      reason: result && !result.added ? result.reason : undefined,
      place: placed ? `Planchuela ${col.nominalMm} · lugar ${row.findIndex((s) => s.instanceId === placed.instanceId) + 1} de ${row.length}` : undefined,
      preview: result?.added ? result.doc : undefined, instanceId: placed?.instanceId };
  };
  const shownDoc = ghost?.preview ?? doc;

  // Planchuelas donde entraría el sello que se arrastra o se señala en la cola.
  const target = dragging ?? candidate;
  const options = useMemo(() => target ? new Map(placementOptions(doc, target).map((o) => [o.columnId, o])) : null, [doc, target]);

  // Relieve: qué sellos se ven (con margen) y cuántos faltan simular.
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const relief = useRef(new Map<string, 'ready' | 'pending' | 'error'>());
  const [reliefTick, setReliefTick] = useState(0);
  const onRelief = useCallback((id: string, state: 'ready' | 'pending' | 'error' | null) => {
    const m = relief.current;
    if (state === null ? !m.has(id) : m.get(id) === state) return;
    if (state === null) m.delete(id); else m.set(id, state);
    setReliefTick((t) => t + 1);
  }, []);
  // Zonas de fresa: cuántos sellos falta analizar y cuántos tienen algo para corregir.
  const zoneMap = useRef(new Map<string, StampZones['counts'] | 'pending'>());
  const [zoneTick, setZoneTick] = useState(0);
  const onZones = useCallback((id: string, state: StampZones['counts'] | 'pending' | null) => {
    const m = zoneMap.current;
    if (state === null ? !m.has(id) : m.get(id) === state) return;
    if (state === null) m.delete(id); else m.set(id, state);
    setZoneTick((t) => t + 1);
  }, []);
  const zoneStats = useMemo(() => {
    void zoneTick;
    const v = [...zoneMap.current.values()];
    const done = v.filter((x): x is StampZones['counts'] => x !== 'pending');
    return { total: v.length, ready: done.length, alta: done.filter((c) => c.alta).length, media: done.filter((c) => !c.alta && c.media).length,
      repaso: done.filter((c) => !c.alta && !c.media && c.repaso).length };
  }, [zoneTick]);

  // IntersectionObserver no ve a través de preserve-3d: se mide la caja proyectada
  // después de cada movimiento de cámara (y al terminar el giro de la vista).
  useEffect(() => {
    const root = viewport.current;
    if ((view === '2d' && !showZones) || !root) return;
    const measure = () => {
      const v = root.getBoundingClientRect(), m = 160;
      const ids: string[] = [];
      root.querySelectorAll<HTMLElement>('[data-stamp]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > v.left - m && r.left < v.right + m && r.bottom > v.top - m && r.top < v.bottom + m) ids.push(el.dataset.stamp ?? '');
      });
      setSeen((s) => ids.every((id) => s.has(id)) ? s : new Set([...s, ...ids]));
    };
    const a = window.setTimeout(measure, 120), b = window.setTimeout(measure, 980);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [view, showZones, doc.stamps, cam.zoom, cam.x, cam.y, vp.w, vp.h]);
  const reliefStats = useMemo(() => {
    void reliefTick;
    const states = [...relief.current.values()];
    return { total: states.length, ready: states.filter((s) => s !== 'pending').length };
  }, [reliefTick]);

  const strips = useMemo(() => {
    const out: Rect[] = []; let x = 0;
    for (const c of fixture.channels) { if (c.x0 > x) out.push({ x0: x, x1: c.x0, y0: 0, y1: H }); x = c.x1; }
    if (x < W) out.push({ x0: x, x1: W, y0: 0, y1: H });
    return out;
  }, [fixture, W, H]);

  // Zona de trabajo: las planchuelas desde su rótulo hasta un poco más abajo del último sello.
  const work = useMemo(() => {
    const x0 = Math.min(...fixture.bars.map((b) => b.x0)) - 8, x1 = Math.max(...fixture.bars.map((b) => b.x1)) + 8;
    const top = Math.min(...fixture.bars.map((b) => b.y0));
    const lowest = Math.max(0, ...doc.stamps.filter((s) => !s.excluded).map((s) => -s.topY + s.heightMm));
    const y1 = Math.min(H, Math.max(top + 150, lowest + 50));
    return { x0, x1, y0: top - 14, y1 };
  }, [fixture, doc.stamps, H]);

  // Si la zona de trabajo cambia bastante (se cargó el programa, se sumaron
  // sellos) y no se movió la cámara a mano, se vuelve a encuadrar.
  const workKey = Math.round(work.y1 / 20);
  const lastWork = useRef(workKey);
  useEffect(() => {
    if (workKey === lastWork.current) return;
    lastWork.current = workKey;
    if (userMoved.current || !ready || dragging || view !== '2d') return;
    const t = window.setTimeout(() => runRef.current({ kind: 'work' }), 80);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workKey]);

  // Rótulos: si dos quedan muy cerca en pantalla, el segundo sube una fila.
  const labelRows = useMemo(() => {
    const rows = new Map<string, number>();
    let prev: { x: number; row: number } | null = null;
    for (const b of [...fixture.bars].sort((a, c) => a.x0 - c.x0)) {
      const x = (b.x0 + b.x1) / 2;
      const row: number = prev && (x - prev.x) * S * scale < 40 && prev.row === 0 ? 1 : 0;
      rows.set(b.columnId, row);
      prev = { x, row };
    }
    return rows;
  }, [fixture, scale]);

  return (
    <div ref={viewport}
      className={cn('relative h-full w-full touch-none select-none overflow-hidden rounded-2xl', dragging ? 'cursor-copy' : 'cursor-grab active:cursor-grabbing')}
      onWheel={(e) => {
        userMoved.current = true;
        const r = viewport.current!.getBoundingClientRect();
        const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
        setCam((c) => {
          const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * Math.pow(1.0015, -e.deltaY)));
          const k = zoom / c.zoom;
          return { zoom, x: cx - (cx - c.x) * k, y: cy - (cy - c.y) * k, animate: false };
        });
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        // Con la captura del puntero el evento llega al lienzo: se busca el sello bajo el cursor.
        const hit = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest<HTMLElement>('[data-stamp]')).find(Boolean);
        if (hit?.dataset.stamp) { onSelect(hit.dataset.stamp); run({ kind: 'stamp', id: hit.dataset.stamp }); return; }
        const r = viewport.current!.getBoundingClientRect();
        const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
        userMoved.current = true;
        setCam((c) => {
          const zoom = Math.min(ZOOM_MAX, c.zoom * 2); const k = zoom / c.zoom;
          return { zoom, x: cx - (cx - c.x) * k, y: cy - (cy - c.y) * k, animate: true };
        });
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current || (e.target as HTMLElement).closest('button')) return;
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
        viewport.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (dragging && !readOnly && view === '2d') {
          const p = toMm(e.clientX, e.clientY);
          const w = Math.min(dragging.widthMm, dragging.heightMm), h = Math.max(dragging.widthMm, dragging.heightMm);
          setGhost(ghostAt(e.clientX, e.clientY, p.x, -p.y + h / 2, w, h));
          return;
        }
        if (!d) return;
        if (d.kind === 'pan') {
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
          if (d.moved) { userMoved.current = true; setCam((c) => ({ ...c, x: d.cx + e.clientX - d.x, y: d.cy + e.clientY - d.y, animate: false })); }
          return;
        }
        const s = doc.stamps.find((x) => x.instanceId === d.id);
        if (!s) return;
        if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) <= 3) return;
        const p = toMm(e.clientX, e.clientY);
        d.moved = true;
        setGhost(ghostAt(e.clientX, e.clientY, p.x, -(p.y - d.grabMm), s.widthMm, s.heightMm, s.instanceId));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (dragging) { if (ghost?.valid) onDrop(dragging.id, ghost.columnId, ghost.wantedTop); setGhost(null); return; }
        if (d?.kind === 'pan' && !d.moved) onSelect(null);
        if (d?.kind === 'stamp') { setMovingId(null); if (d.moved && ghost?.valid) onMove(d.id, ghost.columnId, ghost.wantedTop); }
        setGhost(null);
      }}
      onPointerLeave={() => { if (dragging) setGhost(null); }}
      onPointerCancel={() => { drag.current = null; setMovingId(null); setGhost(null); }}
    >
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${scale})`, transformOrigin: '0 0',
        transition: cam.animate ? 'transform 420ms cubic-bezier(0.22, 0.8, 0.2, 1)' : undefined }}>
        <div ref={world} style={{ width: W * S, height: H * S, position: 'absolute', left: -(W * S) / 2, top: -(H * S) / 2 + 8 * S,
          transformStyle: 'preserve-3d', transform: view === '2d' ? FLAT : ISO, transition: TRANSITION }}>

          <div data-fit="all" className="pointer-events-none absolute" style={{ left: -6 * S, top: -18 * S, width: (W + 12) * S, height: (H + 24) * S }} />
          <div data-fit="work" className="pointer-events-none absolute" style={{ left: work.x0 * S, top: work.y0 * S, width: (work.x1 - work.x0) * S, height: (work.y1 - work.y0) * S }} />

          {/* Base: cuerpo, franjas superiores entre canales y fondo de los canales. */}
          <Box r={{ x0: 0, x1: W, y0: 0, y1: H }} z0={-FIXTURE.plateThicknessMm} z1={-FIXTURE.channelDepthMm} top={look.floor} side={look.plateSide} />
          {strips.map((r, i) => <Box key={`s${i}`} r={r} z0={-FIXTURE.channelDepthMm} z1={0} top={look.strip} side={look.wall} />)}
          {view === '2d' && !fixture.hasDrawing ? <div className="absolute inset-0 rounded-[3px] outline outline-1 outline-white/35" /> : null}
          {fixture.hasDrawing ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ transform: 'translateZ(0.3px)' }}>
              <img src={baseC} alt="" draggable={false} className="absolute max-w-none"
                style={{ width: 420 * S, height: 594 * S, left: -SVG_BASE.x * S, top: -SVG_BASE.y * S,
                  filter: 'invert(1)', opacity: view === '2d' ? 0.4 : 0.16, transition: 'opacity 600ms' }} />
            </div>
          ) : view === '2d' ? fixture.channels.map((c, i) => (
            <div key={`c${i}`} className="pointer-events-none absolute outline outline-1 outline-white/20" style={{ left: c.x0 * S, top: c.y0 * S, width: (c.x1 - c.x0) * S, height: (c.y1 - c.y0) * S }} />
          )) : null}
          {!fixture.hasDrawing ? fixture.slots.map((s, i) => (
            <div key={`sl${i}`} className={cn('pointer-events-none absolute rounded-full outline', view === '2d' ? 'outline-[0.5px] outline-white/15' : 'outline-1 outline-white/25')}
              style={{ left: s.x0 * S, top: s.y0 * S, width: (s.x1 - s.x0) * S, height: (s.y1 - s.y0) * S, transform: `translateZ(${-FIXTURE.channelDepthMm * S + 0.5}px)` }} />
          )) : null}

          {/* Planchuelas paradas. En 3D/Mecanizado, como quedan después del frente:
              planeado + desbaste exterior, ranuras de corte y el resto en bruto. */}
          {fixture.bars.map((b) => {
            const col = doc.columns.find((c) => c.id === b.columnId)!;
            const stamps = shownDoc.stamps.filter((s) => !s.excluded && s.columnId === b.columnId);
            const flat = view === '2d';
            const segments = flat ? [{ y0: b.y0, y1: b.y1, depthMm: 0, kind: 'bruto' as const }] : barSegments(col, stamps);
            const faceZ = flat ? FIXTURE.barHeightMm : FIXTURE.barHeightMm - FACE_OPS.planeMm;
            const option = options?.get(b.columnId);
            return (
              <div key={b.columnId} className={cn('transition-opacity', option?.ok === false ? 'opacity-25' : !col.available && 'opacity-40')}
                style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}>
                {flat ? <Box r={b} z0={0} z1={FIXTURE.barHeightMm} top={look.bar} side={look.barSide} />
                  : <BarSolid b={b} segments={segments} view={view} sideClass={view === 'cnc' ? look.barSide : 'bg-[#090909]'} />}
                <div style={{ position: 'absolute', left: b.x0 * S, top: b.y0 * S, width: (b.x1 - b.x0) * S, height: (b.y1 - b.y0) * S,
                  transformStyle: 'preserve-3d', transform: `translateZ(${faceZ * S + 0.5}px)`, pointerEvents: 'auto' }}>
                  {!col.available ? <div className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 1.5px, transparent 1.5px 9px)' }} /> : null}
                  {option?.ok ? <div className="pointer-events-none absolute inset-0 bg-white/[0.07] outline outline-1 outline-white/80" /> : null}
                  {stamps.filter((s) => s.instanceId !== ghost?.instanceId).map((s) => {
                    const local = { ...s, centerX: s.centerX - (b.x0 - fixture.offsetX), topY: s.topY + b.y0 };
                    // Margen para ver la isla, sin salirse de la planchuela (el primer sello arranca en la punta).
                    const pad: ReliefPad = { x: Math.max(0, Math.min(2.5, (col.nominalMm - s.widthMm) / 2)),
                      top: Math.max(0, Math.min(0.9, -s.topY - b.y0)), bottom: 0.9 };
                    const left = (s.centerX + fixture.offsetX - b.x0 - s.widthMm / 2) * S, top = (-s.topY - b.y0) * S;
                    return (
                      <div key={s.instanceId} data-stamp={s.instanceId} tabIndex={-1} role="button"
                        aria-label={`${s.name}, ${s.widthMm} por ${s.heightMm} milímetros, planchuela ${col.nominalMm}`}
                        aria-pressed={s.instanceId === selectedId}
                        className={cn('absolute outline-none', view === '2d' && !readOnly ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', movingId === s.instanceId && 'opacity-25')}
                        style={{ left, top, width: s.widthMm * S, height: s.heightMm * S }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(s.instanceId); onContextMenu(s.instanceId, e.clientX, e.clientY); }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          onSelect(s.instanceId);
                          if (readOnly) return;
                          if (view !== '2d') {
                            // En 3D arrastrar mueve la vista; se avisa una vez cómo mover sellos.
                            if (!hinted.current) { hinted.current = true; onHint('Para mover sellos volvé a 2D (tecla 1) o usá las flechas del teclado.'); }
                            return;
                          }
                          e.stopPropagation();
                          const p = toMm(e.clientX, e.clientY);
                          drag.current = { kind: 'stamp', id: s.instanceId, grabMm: p.y - -s.topY, x: e.clientX, y: e.clientY, moved: false };
                          setMovingId(s.instanceId);
                          viewport.current?.setPointerCapture(e.pointerId);
                        }}
                        title={`${s.name} · ${s.widthMm}×${s.heightMm} mm · ${s.recipe}`}>
                        <div className="absolute" style={{ left: -left, top: -top }}>
                          <StampFace stamp={local} view={view} fixture={{ ...fixture, offsetX: 0 }} selected={s.instanceId === selectedId}
                            bad={invalid.has(s.instanceId)} warn={warnings.has(s.instanceId)} isNew={!!highlightIds?.has(s.instanceId)} reliefPad={pad}
                            visible={seen.has(s.instanceId)} unit={1 / scale} onRelief={onRelief} showZones={showZones} onZones={onZones} />
                        </div>
                      </div>
                    );
                  })}
                  {ghost && ghost.columnId === b.columnId ? (
                    <div className={cn('pointer-events-none absolute rounded-[2px] outline-dashed outline-2', ghost.valid ? 'bg-white/15 outline-white' : 'bg-red-500/20 outline-red-400')}
                      style={{ left: ((b.x1 - b.x0) / 2 - ghost.w / 2) * S, top: (-ghost.topY - b.y0) * S, width: ghost.w * S, height: ghost.h * S }} />
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Rótulos de cada planchuela: siempre de frente a la cámara y sin pisarse. */}
          {fixture.bars.map((b) => {
            const col = doc.columns.find((c) => c.id === b.columnId)!;
            const option = options?.get(b.columnId);
            const row = labelRows.get(b.columnId) ?? 0;
            return (
              <div key={`l${b.columnId}`} className="pointer-events-none absolute" aria-hidden
                style={{ left: ((b.x0 + b.x1) / 2) * S, top: (b.y0 - 2) * S, width: 0, height: 0, transformStyle: 'preserve-3d',
                  transform: view === '2d' ? `translateZ(${S}px) ${FLAT_BILLBOARD}` : `translateZ(${(FIXTURE.barHeightMm + 1) * S}px) ${BILLBOARD}`, transition: TRANSITION }}>
                <span className={cn('absolute bottom-0 left-0 -translate-x-1/2 whitespace-nowrap font-medium tabular-nums transition-colors',
                  !col.available ? 'text-zinc-500 line-through' : option?.ok === false ? 'text-zinc-600' : 'text-foreground')}
                  style={{ fontSize: fontPx(13), marginBottom: fontPx(row * 17) }}>
                  {b.nominalMm}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controles de cámara y de la página, dentro del lienzo. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <div className="pointer-events-auto" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>{toolbar}</div>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-zinc-950/85 p-0.5 backdrop-blur" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={() => zoomBy(1 / 1.4)} aria-label="Alejar" title="Alejar (−)"><Minus className="size-4" /></button>
          <button type="button" className={cn(PILL_GHOST, 'min-w-[3.75rem] px-1 tabular-nums')} onClick={() => run({ kind: 'work' })} title="Encuadrar los sellos (0)">{Math.round(cam.zoom * 100)} %</button>
          <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={() => zoomBy(1.4)} aria-label="Acercar" title="Acercar (+)"><Plus className="size-4" /></button>
          <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
          <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={() => run({ kind: 'work' })} aria-label="Encuadrar los sellos" title="Encuadrar los sellos (0)"><Scan className="size-4" /></button>
          <button type="button" className={cn(PILL_GHOST, 'px-2')} disabled={!selectedId} onClick={() => run({ kind: 'stamp', id: selectedId ?? undefined })} aria-label="Ir al sello elegido" title="Ir al sello elegido (F)"><Crosshair className="size-4" /></button>
          <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={() => run({ kind: 'all' })} aria-label="Ver la base entera" title="Ver la base entera"><Maximize className="size-4" /></button>
        </div>
      </div>

      {showZones ? (
        <div className="pointer-events-none absolute bottom-3 right-3 max-w-[58%] space-y-0.5 rounded-xl bg-zinc-950/90 px-3 py-1.5 text-[12px] text-zinc-300" role="status">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(['alta', 'media', 'repaso', 'baja'] as ZoneTone[]).map((sev) => (
              <span key={sev} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={sev === 'baja' ? { boxShadow: `inset 0 0 0 1.5px ${ZONE_FILL[sev]}` } : { background: ZONE_FILL[sev] }} />{ZONE_LABEL[sev]}
              </span>
            ))}
          </p>
          <p className="flex items-center gap-1.5 text-zinc-400">
            {zoneStats.ready < zoneStats.total ? <><Loader2 className="size-3 animate-spin" />Analizando la fresa · {zoneStats.ready} de {zoneStats.total}</>
              : zoneStats.alta || zoneStats.media ? <>{zoneStats.alta ? `${zoneStats.alta} ${zoneStats.alta === 1 ? 'sello' : 'sellos'} para corregir` : ''}{zoneStats.alta && zoneStats.media ? ' · ' : ''}{zoneStats.media ? `${zoneStats.media} pierden detalle` : ''}{zoneStats.repaso ? ` · ${zoneStats.repaso} con repaso 0,2` : ''} · elegí uno y «Ver fresa»</>
                : zoneStats.repaso ? `Nada para corregir · ${zoneStats.repaso} ${zoneStats.repaso === 1 ? 'sello lleva' : 'sellos llevan'} repaso 0,2 donde la 0,6 no llega`
                : zoneStats.total ? 'Ningún sello visible tiene zonas para corregir' : 'Acercá la vista a los sellos'}
          </p>
        </div>
      ) : null}
      {view !== '2d' && reliefStats.ready < reliefStats.total ? (
        <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-zinc-950/85 px-3 py-1.5 text-[12px] text-zinc-300" role="status">
          <Loader2 className="size-3.5 animate-spin" />Simulando relieve · {reliefStats.ready} de {reliefStats.total}
        </p>
      ) : null}

      {ghost && (dragging || movingId) ? (
        <div className={cn('pointer-events-none fixed z-50 max-w-[320px] rounded-xl px-3 py-1.5 text-[12px] shadow-xl',
          ghost.valid ? 'bg-zinc-900/95 text-zinc-200' : 'bg-red-950/95 text-red-200')}
          style={{ left: ghost.clientX + 14, top: ghost.clientY + (dragging ? 44 : 14) }}>
          {ghost.valid ? ghost.place : ghost.reason ?? 'No entra acá'}
        </div>
      ) : null}
    </div>
  );
}
