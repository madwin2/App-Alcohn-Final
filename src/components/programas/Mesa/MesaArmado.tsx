import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Keyboard, LayoutGrid, Lock, Magnet, Plus, Redo2, ScanSearch, SlidersHorizontal, Undo2 } from 'lucide-react';
import { FresaCheckDialog } from '@/components/fresa/FresaCheckDialog';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { DoneReviewDialog } from '@/components/programas/DoneReview/DoneReviewDialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchSvgText } from '@/lib/fresa/useFresaReport';
import { type PreparationDocument, type PreparationMachine, type Recipe, type StampPlacement } from '@/lib/programas/preparation';
import {
  addStamp, columnStamps, fillFromQueue, fitsMachine, mesaChecks, mesaProgress, moveStamp, moveToNeighbor, queueSection, removeStamp,
  resizeStamp, sendToEnd, shiftStamp, updateStampGeometry, type AddResult, type MesaSource, type StampInfo,
} from '@/lib/programas/mesa';
import type { FabricationState, ProgramStamp } from '@/lib/types/index';
import { cn } from '@/lib/utils/cn';
import { FixtureScene, type CameraCommand, type SceneView } from './FixtureScene';
import { Dot, FOCUS, PILL_GHOST, PILL_PRIMARY, Panel, Segmented } from './mesaUi';
import { MesaQueue, type Misfit } from './MesaQueue';
import { MesaInspector } from './MesaInspector';
import { MesaSummary } from './MesaSummary';
import { MesaActionBar, type FabricationRecord } from './MesaActionBar';
import { STEP_LABEL } from './MesaChecklist';
import { ShortcutsDialog, StampContextMenu } from './MesaOverlays';

export interface MesaProgram {
  id: string;
  name: string;
  machine: PreparationMachine;
  doc: PreparationDocument;
  /** Revisión guardada y su documento (para saber si hay cambios). */
  savedRevision: number | null;
  savedDoc: PreparationDocument | null;
  syncedRevision: number | null;
  fileRevision: number | null;
  locked?: boolean;
  /** Va con el gadget anterior (G/XL, o una Chica que ya fue a Aspire sin preparación). */
  legacy?: boolean;
  /** Marcado como fabricado (queda en solo lectura). */
  fabricated?: FabricationRecord | null;
}

export const MACHINE_LABEL: Record<PreparationMachine, string> = { C: 'Chica', G: 'Grande', XL: 'XL' };
const MACHINES = (Object.keys(MACHINE_LABEL) as PreparationMachine[]).map((id) => ({ id, label: MACHINE_LABEL[id] }));
type FineMode = NonNullable<StampPlacement['fine']>['mode'];
type Notice = { text: string; tone: 'ok' | 'error' | 'info'; undo?: boolean };

const isTyping = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]');
const isDirty = (p: MesaProgram) => JSON.stringify(p.doc) !== JSON.stringify(p.savedDoc);

/**
 * Mesa de armado: un programa por máquina sobre su soporte real. Reemplaza
 * al tablero + hoja + «Preparar programa»: armar y preparar es lo mismo.
 */
export function MesaArmado({
  machine, onMachine, programs, programId, onProgram, onNewProgram, queue, soldSizes, stampInfo = {}, today, machinesFor,
  legacyAspire, checking, onChange, onSave, onAspire, onFabricated, onSetup, onOpenBoard,
}: {
  machine: PreparationMachine;
  onMachine: (m: PreparationMachine) => void;
  programs: MesaProgram[];
  programId: string | null;
  onProgram: (id: string) => void;
  onNewProgram: () => void;
  /** Sellos sin programa (de todas las máquinas). */
  queue: MesaSource[];
  /** Medida vendida por sello (lado corto/largo). */
  soldSizes: Record<string, { shortMm: number; longMm: number }>;
  /** Nota, prioridad y vencimiento del pedido de cada sello. */
  stampInfo?: Record<string, StampInfo>;
  today: Date;
  /** Otras máquinas donde entra un sello (para los que no entran en esta). */
  machinesFor: (s: MesaSource) => PreparationMachine[];
  /** Esta máquina todavía usa el gadget/ZIP anterior. */
  legacyAspire: boolean;
  checking: boolean;
  onChange: (programId: string, doc: PreparationDocument) => void;
  onSave: (programId: string) => Promise<void>;
  onAspire: (programId: string) => void;
  onFabricated: (programId: string, states: { instanceId: string; state: FabricationState }[]) => void;
  onSetup: () => void;
  /** Abre el tablero con todos los programas (ABC, terminados, papelera…). */
  onOpenBoard?: () => void;
}) {
  // Mensajes en la pantalla (los toasts tapaban el botón principal).
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), notice.undo ? 8000 : 5000); return () => window.clearTimeout(t); }, [notice]);
  const machinePrograms = programs.filter((p) => p.machine === machine);
  const program = machinePrograms.find((p) => p.id === programId) ?? null;
  const doc = program?.doc ?? null;
  const readOnly = !program || !!program.locked || !!program.fabricated;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<MesaSource | null>(null);
  const [hovered, setHovered] = useState<MesaSource | null>(null);
  const [history, setHistory] = useState<Record<string, { past: PreparationDocument[]; future: PreparationDocument[] }>>({});
  const [view, setView] = useState<SceneView>('2d');
  // Zonas de fresa sobre los sellos: preferencia de quien mira (se recuerda en este navegador).
  const [zonesOn, setZonesOn] = useState(() => { try { return window.localStorage.getItem('mesa-zonas-fresa') === '1'; } catch { return false; } });
  useEffect(() => { try { window.localStorage.setItem('mesa-zonas-fresa', zonesOn ? '1' : '0'); } catch { /* sin almacenamiento */ } }, [zonesOn]);
  const [camera, setCamera] = useState<CameraCommand>({ kind: 'work', key: 0 });
  const [fresa, setFresa] = useState<{ instanceId: string; svg: string; machined: boolean } | null>(null);
  const [fill, setFill] = useState<{ doc: PreparationDocument; added: string[] } | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  const [fabAsk, setFabAsk] = useState(false);
  const [fabReview, setFabReview] = useState(false);

  const cam = useCallback((kind: CameraCommand['kind'], id?: string) => setCamera((c) => ({ kind, id, key: c.key + 1 })), []);
  useEffect(() => { setSelectedId(null); setFill(null); setMenu(null); cam('work'); }, [programId, machine, cam]);

  // Arrastre desde la cola: se sigue el puntero; soltar fuera de la mesa cancela.
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!dragging) { setPointer(null); return; }
    const move = (e: PointerEvent) => setPointer({ x: e.clientX, y: e.clientY });
    const end = () => setDragging(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDragging(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end); window.removeEventListener('keydown', key);
    };
  }, [dragging]);

  const machineQueue = useMemo(() => doc ? queue.filter((s) => fitsMachine(doc, s)) : [], [queue, doc]);
  const misfits = useMemo((): Misfit[] => {
    if (!doc) return [];
    const widest = Math.max(...doc.columns.map((c) => c.usableMm));
    return queue.filter((s) => !fitsMachine(doc, s)).map((s) => ({
      source: s,
      reason: `${Math.min(s.widthMm, s.heightMm)} mm de ancho; acá entra hasta ${widest} mm.`,
      machines: machinesFor(s).filter((m) => m !== machine).map((id) => ({ id, label: MACHINE_LABEL[id] })),
    }));
  }, [queue, doc, machinesFor, machine]);
  const dirty = !!program && isDirty(program);
  const legacy = program?.legacy ?? legacyAspire;
  const groups = useMemo(() => doc ? mesaChecks(doc, undefined, { legacy }) : [], [doc, legacy]);
  const progress = useMemo(() => doc && program ? mesaProgress(doc, { savedRevision: program.savedRevision, dirty, syncedRevision: program.syncedRevision, fileRevision: program.fileRevision }, undefined, { legacy }) : null, [doc, program, dirty, legacy]);
  const warnings = useMemo(() => new Set(groups.flatMap((g) => g.id === 'fresa' ? g.items.map((i) => i.instanceId ?? '') : [])), [groups]);
  const selected = doc?.stamps.find((s) => s.instanceId === selectedId) ?? null;
  const waitingSince = program ? waiting[program.id] ?? null : null;

  // La espera de Aspire termina cuando el gadget devuelve la revisión.
  useEffect(() => {
    if (program && progress?.done.aspire && waiting[program.id] !== undefined) {
      setWaiting(({ [program.id]: _, ...rest }) => rest);
      setNotice({ text: `Aspire devolvió la revisión ${program.savedRevision}`, tone: 'ok' });
    }
  }, [program, progress?.done.aspire, waiting]);

  // Con cambios sin guardar, avisar antes de salir de la página.
  useEffect(() => {
    // Solo cambios sobre una revisión guardada: la asignación de sellos ya se guarda al instante.
    if (!programs.some((p) => p.savedDoc !== null && !p.legacy && isDirty(p))) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [programs]);

  const commit = useCallback((next: PreparationDocument) => {
    if (!program || readOnly || JSON.stringify(program.doc) === JSON.stringify(next)) return;
    setHistory((h) => ({ ...h, [program.id]: { past: [...(h[program.id]?.past ?? []), program.doc].slice(-60), future: [] } }));
    onChange(program.id, next);
  }, [program, readOnly, onChange]);
  const apply = (r: AddResult, opts: { select?: boolean; ok?: string } = {}) => {
    if (!r.added) { setNotice({ text: r.reason, tone: 'error' }); return false; }
    commit(r.doc); if (opts.select ?? true) setSelectedId(r.instanceId);
    if (opts.ok) setNotice({ text: opts.ok, tone: 'ok', undo: true });
    return true;
  };
  const undo = () => {
    if (!program) return;
    const h = history[program.id]; const prev = h?.past[h.past.length - 1];
    if (!prev) return;
    setHistory({ ...history, [program.id]: { past: h.past.slice(0, -1), future: [program.doc, ...h.future] } });
    onChange(program.id, prev);
    setNotice({ text: 'Deshecho', tone: 'info' });
  };
  const redo = () => {
    if (!program) return;
    const h = history[program.id]; const next = h?.future[0];
    if (!next) return;
    setHistory({ ...history, [program.id]: { past: [...h.past, program.doc], future: h.future.slice(1) } });
    onChange(program.id, next);
  };
  const patch = (instanceId: string, change: Partial<StampPlacement>) => doc && commit({ ...doc, stamps: doc.stamps.map((s) => s.instanceId === instanceId ? { ...s, ...change } : s) });
  const remove = (instanceId: string) => {
    if (!doc || readOnly) return;
    const s = doc.stamps.find((x) => x.instanceId === instanceId);
    commit(removeStamp(doc, instanceId)); setSelectedId(null);
    setNotice({ text: `Quitaste ${s?.name ?? 'el sello'}: vuelve a la cola`, tone: 'info', undo: true });
  };
  /** Elegir desde una lista (resumen, controles): además lleva la cámara al sello. */
  const pick = (instanceId: string) => { setSelectedId(instanceId); cam('stamp', instanceId); };

  // Orden físico para Tab: planchuelas de izquierda a derecha, de arriba abajo.
  const order = useMemo(() => doc ? [...doc.columns].sort((a, b) => a.centerX - b.centerX).flatMap((c) => columnStamps(doc, c.id).map((s) => s.instanceId)) : [], [doc]);

  const save = () => {
    if (!program || checking || readOnly || !doc?.stamps.length) return;
    const n = (program.savedRevision ?? 0) + 1;
    void onSave(program.id).then(
      () => setNotice({ text: legacy ? 'Se chequeó la fresa de todos los sellos' : `Revisión ${n} guardada · se chequeó la fresa de todos los sellos`, tone: 'ok' }),
      (e) => setNotice({ text: e instanceof Error ? e.message : 'No se pudo guardar', tone: 'error' }));
  };
  const toAspire = () => {
    if (!program) return;
    setWaiting((w) => ({ ...w, [program.id]: Date.now() }));
    onAspire(program.id);
  };
  const openFill = () => {
    if (!doc) return;
    const r = fillFromQueue(doc, machineQueue);
    setSelectedId(null);
    setFill(r);
    if (r.added.length) cam('work');
  };
  const applyFill = () => {
    if (!fill) return;
    commit(fill.doc);
    setNotice({ text: `${fill.added.length} ${fill.added.length === 1 ? 'sello sumado' : 'sellos sumados'}`, tone: 'ok', undo: true });
    setFill(null);
  };
  const addMany = (list: MesaSource[]) => {
    if (!doc) return;
    const r = fillFromQueue(doc, list);
    const missing = list.length - r.added.length;
    if (!r.added.length) { setNotice({ text: 'No entra ninguno de los elegidos en las planchuelas disponibles', tone: 'error' }); return; }
    commit(r.doc);
    setNotice({ text: `${r.added.length} sumados${missing ? ` · ${missing} no entraron` : ''}`, tone: missing ? 'info' : 'ok', undo: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || fresa || shortcuts || fabAsk || fabReview) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 's') { e.preventDefault(); save(); return; }
      if (mod || e.altKey) return;
      if (e.key === '?') { setShortcuts(true); return; }
      if (e.key === 'Escape') { if (fill) setFill(null); else setSelectedId(null); return; }
      if (k === '1' || k === '2' || k === '3') { setView(k === '1' ? '2d' : k === '2' ? '3d' : 'cnc'); return; }
      if (k === '0') { cam('work'); return; }
      if (k === 'z') { setZonesOn((v) => !v); return; }
      if (k === 'f') { cam(selectedId ? 'stamp' : 'work', selectedId ?? undefined); return; }
      if (e.key === '+' || e.key === '=') { cam('in'); return; }
      if (e.key === '-' || e.key === '_') { cam('out'); return; }
      if (!doc) return;
      if (e.key === 'Tab' && order.length && (document.activeElement === document.body || (document.activeElement as HTMLElement)?.closest('[data-stamp], [data-mesa-canvas]'))) {
        e.preventDefault();
        const i = selectedId ? order.indexOf(selectedId) : -1;
        const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
        pick(next);
        return;
      }
      if (!selectedId || readOnly || fill) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selectedId); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); apply(shiftStamp(doc, selectedId, e.key === 'ArrowUp' ? -1 : 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (apply(moveToNeighbor(doc, selectedId, e.key === 'ArrowLeft' ? -1 : 1))) cam('stamp', selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openFresa = async (s: StampPlacement) => {
    try { setFresa({ instanceId: s.instanceId, svg: s.vectorSvg ?? await fetchSvgText(s.sourceUrl), machined: !!s.vectorSvg && !!s.vectorAlreadyMachined }); }
    catch (e) { setNotice({ text: `No se pudo abrir el vector${e instanceof Error ? `: ${e.message}` : ''}`, tone: 'error' }); }
  };
  const fresaStamp = doc?.stamps.find((s) => s.instanceId === fresa?.instanceId) ?? null;

  const stepFor = (h: number) => h >= 40 ? 1 : 0.5;
  const sizeLimits = selected && doc ? (() => {
    const up = stepFor(selected.heightMm), down = stepFor(selected.heightMm - 0.01);
    const g = resizeStamp(doc, selected.instanceId, selected.heightMm + up);
    const sh = selected.heightMm - down > 3 ? resizeStamp(doc, selected.instanceId, selected.heightMm - down) : null;
    return { grow: { stepMm: up, reason: g.added ? null : g.reason }, shrink: { stepMm: down, reason: !sh ? 'Es la medida mínima.' : sh.added ? null : sh.reason } };
  })() : null;

  const menuStamp = menu && doc ? doc.stamps.find((s) => s.instanceId === menu.id) ?? null : null;
  const menuRow = menuStamp && doc ? columnStamps(doc, menuStamp.columnId) : [];
  const menuIndex = menuStamp ? menuRow.findIndex((s) => s.instanceId === menuStamp.instanceId) : -1;

  const shownDoc = fill?.doc ?? doc;
  const highlight = useMemo(() => fill ? new Set(fill.doc.stamps.filter((s) => fill.added.includes(s.selloId)).map((s) => s.instanceId)) : undefined, [fill]);
  const fillInfo = fill ? {
    count: fill.added.length,
    urgent: machineQueue.filter((s) => fill.added.includes(s.id) && queueSection(s, today) === 'urgentes').length,
    left: machineQueue.length - fill.added.length,
  } : null;

  const help = readOnly ? 'Solo lectura: el programa está fabricado o bloqueado · se puede mirar en 2D, 3D y Mecanizado'
    : dragging ? 'Soltá sobre una planchuela resaltada · Esc cancela'
    : fill ? 'Vista previa: los sellos punteados son los que sumaría «Llenar solo»'
      : view !== '2d' ? 'Relieve estimado · doble clic en un sello para verlo de cerca · el repaso parcial se revisa en Aspire'
        : selected ? 'Arrastrá para cambiar el orden · ↑ ↓ orden · ← → planchuela · Supr quita'
          : 'Arrastrá sellos desde la cola · rueda o doble clic para acercar · ? atajos';

  const stageOf = (p: MesaProgram) => {
    if (p.fabricated) return STEP_LABEL.fabricado;
    const pr = mesaProgress(p.doc, { savedRevision: p.savedRevision, dirty: isDirty(p), syncedRevision: p.syncedRevision, fileRevision: p.fileRevision }, undefined, { legacy: p.legacy ?? legacyAspire });
    // La última etapa cumplida («Armando» mientras no hay ninguna).
    const last = (['fabricar', 'aspire', 'revisar'] as const).find((s) => pr.done[s]);
    return last ? STEP_LABEL[last] : 'Armando';
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented value={machine} onChange={onMachine} options={MACHINES.map((m) => ({ id: m.id, label: m.label }))} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(FOCUS, 'flex items-center gap-2 rounded-full bg-white/[0.05] px-3.5 py-1.5 text-[13px] hover:bg-white/[0.09]')} aria-label="Elegir programa">
              {program ? (
                <>
                  {program.locked || program.fabricated ? <Lock className="size-3.5 text-zinc-400" /> : null}
                  <span className="font-medium">{program.name}</span>
                  <span className="text-zinc-400">· {program.doc.stamps.length} {program.doc.stamps.length === 1 ? 'sello' : 'sellos'} · {stageOf(program)}</span>
                  {dirty && program.savedRevision !== null ? <span className="flex items-center gap-1.5 text-amber-200"><Dot tone="warning" />sin guardar</span>
                    : dirty ? <span className="text-zinc-400">· borrador</span> : null}
                </>
              ) : <span className="text-zinc-300">Sin programa</span>}
              <ChevronDown className="size-4 text-zinc-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[320px]">
            {machinePrograms.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => onProgram(p.id)} className={cn('flex items-center gap-2', p.id === programId && 'bg-white/[0.06]')}>
                {p.locked || p.fabricated ? <Lock className="size-3.5 text-zinc-400" /> : <span className="size-3.5" />}
                <span className="font-medium">{p.name}</span>
                <span className="flex-1 text-zinc-400">{p.doc.stamps.length} {p.doc.stamps.length === 1 ? 'sello' : 'sellos'}</span>
                <span className="text-[12px] text-zinc-400">{stageOf(p)}</span>
              </DropdownMenuItem>
            ))}
            {machinePrograms.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={onNewProgram}><Plus className="mr-2 size-4" />Nuevo programa para la {MACHINE_LABEL[machine]}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={() => setShortcuts(true)} aria-label="Atajos de teclado" title="Atajos de teclado (?)"><Keyboard className="size-4" /></button>
          {onOpenBoard ? <button type="button" className={PILL_GHOST} onClick={onOpenBoard} title="Tablero con todos los programas: ABC, terminados, papelera, bloqueo e historial"><LayoutGrid className="size-4" />Todos los programas</button> : null}
          <button type="button" className={PILL_GHOST} onClick={onSetup} title="Soporte y plantillas de la máquina"><SlidersHorizontal className="size-4" />Máquina {MACHINE_LABEL[machine]}</button>
        </div>
      </header>

      {!program || !doc || !progress ? (
        <Panel className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-[22px] font-medium">Armá el programa de hoy</p>
          <p className="max-w-md text-[14px] text-zinc-400">Arrastrás sellos de la cola sobre las planchuelas de la {MACHINE_LABEL[machine]}. La app controla lugar, separación y fresa antes de Aspire.</p>
          <button type="button" className={PILL_PRIMARY} onClick={onNewProgram}><Plus className="size-4" />Nuevo programa</button>
        </Panel>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[288px_minmax(0,1fr)_316px] lg:overflow-visible 2xl:grid-cols-[312px_minmax(0,1fr)_356px]">
            <MesaQueue queue={machineQueue} misfits={misfits} today={today} disabled={readOnly || !!fill} fillPreview={fillInfo}
              onDragStart={(s) => { setDragging(s); setView('2d'); }}
              onHover={setHovered}
              onAdd={(s) => { const r = addStamp(doc, s); if (apply(r, { ok: `${s.designName} sumado` }) && r.added) cam('stamp', r.instanceId); }}
              onAddMany={addMany}
              onFill={openFill} onFillApply={applyFill} onFillCancel={() => setFill(null)}
              onGoMachine={onMachine} />

            <Panel label="Planchuelas" className="relative flex min-h-[60vh] flex-col p-3 lg:min-h-0">
              <div className="min-h-0 flex-1" data-mesa-canvas>
                <FixtureScene doc={shownDoc!} view={view} camera={camera} selectedId={selectedId} dragging={dragging} candidate={dragging ? null : hovered}
                  readOnly={readOnly || !!fill} warnings={warnings} highlightIds={highlight} showZones={zonesOn}
                  onSelect={(id) => { if (!fill) setSelectedId(id); }}
                  onDrop={(id, columnId, topY) => { const s = queue.find((q) => q.id === id); if (s) apply(addStamp(doc, s, { columnId, topY }), { ok: `${s.designName} sumado` }); }}
                  onMove={(id, columnId, topY) => apply(moveStamp(doc, id, columnId, topY))}
                  onContextMenu={(id, x, y) => { if (!fill) setMenu({ id, x, y }); }}
                  onHint={(text) => setNotice({ text, tone: 'info' })}
                  toolbar={(
                    <div className="flex items-center gap-1 rounded-full bg-zinc-950/85 p-0.5 backdrop-blur">
                      <Segmented size="sm" value={view} onChange={setView} options={[
                        { id: '2d', label: '2D', title: 'Para armar (1)' }, { id: '3d', label: '3D', title: 'Relieve estimado en líneas (2)' }, { id: 'cnc', label: 'Mecanizado', title: 'El mismo relieve en bronce (3)' }]} />
                      <button type="button" aria-pressed={zonesOn} onClick={() => setZonesOn((v) => !v)}
                        title="Marcar sobre cada sello las zonas donde la fresa no llega bien (Z)"
                        className={cn(PILL_GHOST, 'px-2.5 py-1 text-[12px]', zonesOn && 'bg-white/[0.14] text-foreground')}>
                        <ScanSearch className="size-3.5" />Fresa
                      </button>
                      <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden />
                      <button type="button" className={cn(PILL_GHOST, 'px-2')} disabled={readOnly || !history[program.id]?.past.length} onClick={undo} aria-label="Deshacer" title="Deshacer (Ctrl+Z)"><Undo2 className="size-4" /></button>
                      <button type="button" className={cn(PILL_GHOST, 'px-2')} disabled={readOnly || !history[program.id]?.future.length} onClick={redo} aria-label="Rehacer" title="Rehacer (Ctrl+Mayús+Z)"><Redo2 className="size-4" /></button>
                      <span className="hidden items-center gap-1.5 px-2 text-[12px] text-zinc-400 xl:flex" title="Los sellos quedan centrados y separados exactamente 8 mm. Arrastrar solo cambia su orden o planchuela."><Magnet className="size-3.5" />8 mm</span>
                    </div>
                  )} />
              </div>
              <p className="px-2 pt-2 text-[12px] text-zinc-400">{help}</p>
              {notice ? (
                <div aria-live="polite" className={cn('absolute bottom-[4.5rem] left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-[13px] shadow-2xl ring-1',
                  notice.tone === 'error' ? 'bg-red-950/95 text-red-100 ring-red-400/20' : 'bg-zinc-900/95 text-foreground ring-white/10')}>
                  <Dot tone={notice.tone} /><span className="min-w-0 truncate">{notice.text}</span>
                  {notice.undo && history[program.id]?.past.length ? <button type="button" className={cn(FOCUS, 'shrink-0 rounded-full px-2 font-medium text-white underline-offset-2 hover:underline')} onClick={() => { undo(); setNotice(null); }}>Deshacer</button> : null}
                </div>
              ) : null}
            </Panel>

            <Panel label="Detalle" className="flex min-h-0 flex-col overflow-y-auto p-5">
              {selected && sizeLimits ? (
                <MesaInspector doc={doc} stamp={selected} readOnly={readOnly}
                  sold={soldSizes[selected.selloId] ?? { shortMm: selected.widthMm, longMm: selected.heightMm }}
                  info={stampInfo[selected.selloId]} today={today}
                  grow={sizeLimits.grow} shrink={sizeLimits.shrink}
                  onRecipe={(recipe: Recipe) => patch(selected.instanceId, { recipe })}
                  onResize={(h) => apply(resizeStamp(doc, selected.instanceId, h))}
                  onFine={(mode: FineMode) => patch(selected.instanceId, { fine: { mode, needsFine: true, inputHash: '', widthMm: selected.widthMm, heightMm: selected.heightMm, recipe: selected.recipe, outcome: 'sin_analisis' } })}
                  onColumn={(columnId) => apply(sendToEnd(doc, selected.instanceId, columnId))}
                  onEnd={() => apply(sendToEnd(doc, selected.instanceId))}
                  onShift={(direction) => apply(shiftStamp(doc, selected.instanceId, direction))}
                  onRemove={() => remove(selected.instanceId)}
                  onFresa={() => void openFresa(selected)}
                  onClose={() => setSelectedId(null)} />
              ) : (
                <MesaSummary doc={doc} readOnly={readOnly} warnings={warnings} info={stampInfo} today={today} onPick={pick} onShortcuts={() => setShortcuts(true)}
                  onToggleMaterial={(columnId) => commit({ ...doc, columns: doc.columns.map((c) => c.id === columnId ? { ...c, available: !c.available } : c) })} />
              )}
            </Panel>
          </div>

          <MesaActionBar progress={progress} groups={groups} checking={checking} dirty={dirty} savedRevision={program.savedRevision}
            hasStamps={doc.stamps.length > 0} readOnly={readOnly} locked={!!program.locked} legacyAspire={legacy}
            waitingSince={waitingSince} fabricated={program.fabricated ?? null}
            onSave={save} onAspire={toAspire} onFabricated={() => setFabAsk(true)} onPick={pick} onSetup={onSetup} />
        </>
      )}

      {dragging && pointer ? (
        <div className="pointer-events-none fixed z-50 rounded-full bg-zinc-900/95 px-3 py-1.5 text-[12px] shadow-xl" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
          {dragging.designName} · {Math.min(dragging.widthMm, dragging.heightMm)}×{Math.max(dragging.widthMm, dragging.heightMm)} mm
        </div>
      ) : null}

      <StampContextMenu at={menu ? { x: menu.x, y: menu.y } : null} onClose={() => setMenu(null)}
        actions={menuStamp && doc ? {
          recipe: menuStamp.recipe, readOnly,
          canUp: menuIndex > 0, canDown: menuIndex < menuRow.length - 1,
          canLeft: moveToNeighbor(doc, menuStamp.instanceId, -1).added, canRight: moveToNeighbor(doc, menuStamp.instanceId, 1).added,
          onFocus: () => cam('stamp', menuStamp.instanceId), onFresa: () => void openFresa(menuStamp),
          onShift: (d) => apply(shiftStamp(doc, menuStamp.instanceId, d)), onEnd: () => apply(sendToEnd(doc, menuStamp.instanceId)),
          onNeighbor: (d) => apply(moveToNeighbor(doc, menuStamp.instanceId, d)),
          onRecipe: (recipe) => patch(menuStamp.instanceId, { recipe }), onRemove: () => remove(menuStamp.instanceId),
        } : null} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />

      <ConfirmDialog open={fabAsk} onOpenChange={setFabAsk}
        title="¿Algún sello salió mal?" description="¿Hay que rehacer o retocar alguno de este programa?"
        confirmLabel="Sí" cancelLabel="No"
        onConfirm={() => { setFabAsk(false); setFabReview(true); }}
        onCancel={() => {
          setFabAsk(false);
          if (program && doc) { onFabricated(program.id, doc.stamps.map((s) => ({ instanceId: s.instanceId, state: 'HECHO' }))); setNotice({ text: 'Sellos marcados como Hecho', tone: 'ok' }); }
        }} />
      <DoneReviewDialog open={fabReview} onOpenChange={setFabReview} programName={program?.name ?? ''}
        stamps={(doc?.stamps ?? []).map((s): ProgramStamp => ({ id: s.instanceId, designName: s.name, widthMm: s.widthMm, heightMm: s.heightMm, stampType: s.recipe, vectorPreviewUrl: s.sourceUrl }))}
        onConfirm={(assignments) => {
          if (!program) return;
          onFabricated(program.id, assignments.map((a) => ({ instanceId: a.stampId, state: a.state })));
          setNotice({ text: 'Estados de fabricación actualizados', tone: 'ok' });
        }} />

      <FresaCheckDialog open={!!fresa} onOpenChange={(o) => { if (!o) setFresa(null); }} title={fresaStamp?.name ?? ''} svgText={fresa?.svg ?? null}
        target={fresaStamp ? { mode: 'fabricacion', longSideMm: Math.max(fresaStamp.widthMm, fresaStamp.heightMm), stampType: fresaStamp.recipe, alimento: fresaStamp.recipe === 'ALIMENTO' } : null}
        applyLabel="Usar en este programa" applyHint="Conserva lo vendido; el vector corregido queda solo en este programa."
        onApply={(svgText, _fix, opts) => {
          if (!fresaStamp || !fresa || !doc) return;
          const w = opts.fabricationMm.widthMm, h = opts.fabricationMm.heightMm;
          apply(updateStampGeometry(doc, fresaStamp.instanceId, { vectorSvg: svgText, vectorAlreadyMachined: fresa.machined,
            widthMm: fresa.machined ? w : Math.min(w, h), heightMm: fresa.machined ? h : Math.max(w, h), sourceWidthMm: w, sourceHeightMm: h }));
        }} />
    </div>
  );
}
