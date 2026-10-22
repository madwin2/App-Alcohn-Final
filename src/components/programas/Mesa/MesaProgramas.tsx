import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { checkPreparation } from '@/lib/programas/checkPreparation';
import { emptyDocument, reconcileMesa as reconcile, reflowMesa, type MesaPending as Pending, type MesaSource, type StampInfo } from '@/lib/programas/mesa';
import { type PreparationDocument, type PreparationMachine, type PreparationRecord } from '@/lib/programas/preparation';
import { generateProgramName } from '@/lib/programas/programName';
import { missingForRecipe, sortTemplateFiles } from '@/lib/programas/templateSort';
import {
  getProgramPreparation, inheritMachineSetup, peekMachineSetup, saveProgramPreparation, uploadPreparationTemplates, type MachineSetup as StoredSetup,
} from '@/lib/supabase/services/programPreparation.service';
import { getBroncePiezasUtiles } from '@/lib/supabase/services/bronceStock.service';
import { getEligibleStamps } from '@/lib/supabase/services/programs.service';
import type { usePrograms } from '@/lib/hooks/usePrograms';
import type { FabricationState, Program, ProgramStamp } from '@/lib/types/index';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import { MACHINE_LABEL, MesaArmado, type MesaProgram } from './MesaArmado';
import { MesaHistory } from './MesaHistory';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { RemoveStampDialog, type RemoveStampChoice } from '@/components/programas/RemoveStamp/RemoveStampDialog';
import { MachineSetupSheet, type MachineSetup } from './MachineSetupSheet';
import { Panel } from './mesaUi';

const MACHINES: PreparationMachine[] = ['C', 'G', 'XL'];
/**
 * Las tres máquinas usan el gadget 3.2 con preparación (usuario, 2026-10-20:
 * «dejemos todas activas para probar todas»). Un programa que ya fue a Aspire
 * con el gadget anterior sigue en ese flujo (`wentLegacy`).
 */
const isLegacy = (_m: PreparationMachine) => false;
const DONE_STATES = new Set<FabricationState>(['HECHO', 'VERIFICAR', 'RETOCAR', 'REHACER']);
/** Un fabricado sigue a mano en la mesa un par de días; después queda en el historial. */
const FABRICATED_VISIBLE_DAYS = 2;

type Programs = ReturnType<typeof usePrograms>;
interface Loaded {
  /** Preparación guardada (solo C); null = todavía no se guardó. */
  record: PreparationRecord | null;
  /** Borrador en pantalla. */
  draft: PreparationDocument;
  /** G/XL: la fresa se chequea en memoria y la mesa no guarda el armado. */
  legacy: boolean;
}

/**
 * Una Chica que ya fue a Aspire con el gadget anterior (sin preparación) sigue
 * en ese flujo: guardar una preparación la pasaría al gadget 3.2 y dejaría
 * vencido lo que ya está hecho en Aspire.
 */
const wentLegacy = (p: Program, record: PreparationRecord | null) => !record && !!(p.syncAt || p.archivoAspireUrl || p.archivoZipUrl);
const isFabricated = (p: Program) => p.stamps.length > 0 && p.stamps.every((s) => DONE_STATES.has(s.fabricationState ?? 'SIN_HACER'));
/** En la máquina: algún sello en Haciendo y todavía no terminó. */
const isFabricating = (p: Program) => !isFabricated(p) && p.stamps.some((s) => s.fabricationState === 'HACIENDO');
/** Cuándo terminó: el último sello que pasó a Hecho (no `updated_at`, que lo tocan triggers y relecturas). */
const finishedAt = (p: Program) => p.finishedAt ?? p.lastUpdated;

const withSetup = (doc: PreparationDocument, setup: StoredSetup | null): PreparationDocument =>
  setup ? reflowMesa({ ...doc, columns: setup.columns, gapMm: setup.gapMm, supportVerified: setup.supportVerified, recipes: setup.recipes }) : doc;

/**
 * La mesa de armado con los datos reales: programas de C/G/XL, la cola de
 * sellos elegibles y, en la Chica, la preparación con revisiones.
 * Sumar o quitar un sello se asigna al instante (como el tablero); el armado
 * de la Chica se guarda con «Guardar y chequear».
 */
export function MesaProgramas({ programs: api, onOpenBoard }: { programs: Programs; onOpenBoard: () => void }) {
  const { toast } = useToast();
  const { programs, loading, error } = api;
  const today = useMemo(() => new Date(), []);
  const [machine, setMachine] = useState<PreparationMachine>(() => {
    try { const m = window.localStorage.getItem('mesa-maquina'); return (MACHINES as string[]).includes(m ?? '') ? m as PreparationMachine : 'C'; } catch { return 'C'; }
  });
  useEffect(() => { try { window.localStorage.setItem('mesa-maquina', machine); } catch { /* sin almacenamiento */ } }, [machine]);
  const [selected, setSelected] = useState<Partial<Record<PreparationMachine, string>>>({});
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [checking, setChecking] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [eligible, setEligible] = useState<Record<PreparationMachine, ProgramStamp[]> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [broncePiezas, setBroncePiezas] = useState<Partial<Record<number, number[]>>>({});
  // Dato informativo del stock de bronce; se refresca al cambiar de máquina.
  useEffect(() => {
    let cancelled = false;
    void getBroncePiezasUtiles().then((p) => { if (!cancelled) setBroncePiezas(p); });
    return () => { cancelled = true; };
  }, [machine]);
  /** Programas viejos abiertos desde el historial (no vienen con la lista de trabajo). */
  const [fromHistory, setFromHistory] = useState<Program[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Program | null>(null);
  const setups = useRef<Partial<Record<PreparationMachine, Promise<StoredSetup | null>>>>({});
  const pending = useRef<Pending>({ adding: new Set(), removing: new Set() });
  const setupFor = (m: PreparationMachine) => (setups.current[m] ??= peekMachineSetup(m).catch(() => null));

  // Programas que van en la mesa: C/G/XL en curso, los fabricados de los últimos días y los abiertos desde el historial.
  const mesaPrograms = useMemo(() => {
    const ids = new Set(programs.map((p) => p.id));
    const opened = new Set(fromHistory.map((p) => p.id));
    return [...programs, ...fromHistory.filter((p) => !ids.has(p.id))]
      .filter((p): p is Program & { machine: PreparationMachine } => (MACHINES as string[]).includes(p.machine))
      .filter((p) => opened.has(p.id) || !isFabricated(p) || differenceInCalendarDays(today, parseISO(finishedAt(p))) <= FABRICATED_VISIBLE_DAYS)
      .sort((a, b) => (b.productionDate ?? '').localeCompare(a.productionDate ?? '') || b.createdAt.localeCompare(a.createdAt));
  }, [programs, fromHistory, today]);
  const programId = selected[machine]
    ?? mesaPrograms.find((p) => p.machine === machine && !isFabricated(p) && !p.bloqueado)?.id
    ?? mesaPrograms.find((p) => p.machine === machine)?.id ?? null;
  const program = mesaPrograms.find((p) => p.id === programId) ?? null;

  // Cola: sellos elegibles de cada máquina (para saber dónde entra cada uno).
  const refreshQueue = useCallback(async () => {
    try {
      const lists = await Promise.all(MACHINES.map((m) => getEligibleStamps({ machine: m })));
      setEligible(Object.fromEntries(MACHINES.map((m, i) => [m, lists[i]])) as Record<PreparationMachine, ProgramStamp[]>);
    } catch (e) { toast({ title: 'No se pudo cargar la cola', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  }, [toast]);
  // Se recarga cuando cambian los programas (incluye realtime de otras PCs).
  // Espaciado: con otras PCs trabajando los programas cambian seguido y cada recarga son tres consultas.
  useEffect(() => { const t = window.setTimeout(() => void refreshQueue(), 1500); return () => window.clearTimeout(t); }, [programs, refreshQueue]);

  // Carga el borrador del programa elegido y lo mantiene al día con sus sellos.
  useEffect(() => {
    if (!program) return;
    const current = loaded[program.id];
    if (current) {
      const next = reconcile(current.draft, program.stamps, pending.current);
      if (next !== current.draft) setLoaded((l) => ({ ...l, [program.id]: { ...l[program.id], draft: next } }));
      return;
    }
    let alive = true;
    void (async () => {
      const legacy = isLegacy(program.machine);
      const record = legacy ? null : await getProgramPreparation(program.id).catch((e) => {
        toast({ title: 'No se pudo leer la preparación', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        return null;
      });
      const base = record ? record.document : withSetup(emptyDocument(program.id, program.machine), await setupFor(program.machine));
      const draft = reconcile(base, program.stamps);
      if (alive) setLoaded((l) => l[program.id] ? l : { ...l, [program.id]: { record, draft, legacy } });
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, program?.stamps]);

  const queue = useMemo(() => {
    if (!eligible) return [];
    const used = new Set(Object.values(loaded).flatMap((l) => l.draft.stamps.map((s) => s.selloId)));
    const seen = new Map<string, ProgramStamp>();
    for (const m of MACHINES) for (const s of eligible[m]) if (!used.has(s.id)) seen.set(s.id, s);
    return [...seen.values()] as MesaSource[];
  }, [eligible, loaded]);
  const machinesFor = useCallback((s: MesaSource) => MACHINES.filter((m) => eligible?.[m].some((x) => x.id === s.id)), [eligible]);
  const soldSizes = useMemo(() => {
    const out: Record<string, { shortMm: number; longMm: number }> = {};
    for (const s of [...queue, ...programs.flatMap((p) => p.stamps)] as ProgramStamp[]) {
      const w = s.anchoRealCm != null ? s.anchoRealCm * 10 : s.widthMm, h = s.largoRealCm != null ? s.largoRealCm * 10 : s.heightMm;
      out[s.id] = { shortMm: Math.min(w, h), longMm: Math.max(w, h) };
    }
    return out;
  }, [queue, programs]);

  const stampInfo = useMemo(() => {
    const out: Record<string, StampInfo> = {};
    for (const s of [...queue, ...programs.flatMap((p) => p.stamps)] as ProgramStamp[]) out[s.id] = { notes: s.notes, isPriority: s.isPriority, deadlineAt: s.deadlineAt, mecanizado: s.mecanizado };
    return out;
  }, [queue, programs]);

  const mesaList: MesaProgram[] = useMemo(() => mesaPrograms.flatMap((p): MesaProgram[] => {
    const l = loaded[p.id];
    const fabricated = isFabricated(p) ? {
      at: format(parseISO(finishedAt(p)), 'd MMM', { locale: es }),
      retocar: p.stamps.filter((s) => s.fabricationState === 'RETOCAR').length,
      rehacer: p.stamps.filter((s) => s.fabricationState === 'REHACER').length,
    } : null;
    const fabricating = isFabricating(p) ? { since: p.fabricationStartedAt ? format(parseISO(p.fabricationStartedAt), "HH:mm 'del' d MMM", { locale: es }) : null } : null;
    const base = { id: p.id, name: p.name, machine: p.machine, stampCount: p.stamps.length, productionDate: p.productionDate, fabricated, fabricating, fromHistory: fromHistory.some((x) => x.id === p.id) };
    // Sin cargar todavía (solo se carga el elegido): alcanza para la lista de programas.
    if (!l) return [{ ...base, doc: emptyDocument(p.id, p.machine), savedRevision: null, savedDoc: null, syncedRevision: null, fileRevision: null, locked: p.bloqueado, loading: true }];
    const locked = p.bloqueado;
    if (l.legacy || wentLegacy(p, l.record)) {
      // G/XL: no hay revisiones; Aspire queda hecho cuando el gadget sincronizó y no hubo cambios después.
      const synced = !!p.syncAt && !p.dirty;
      return [{ ...base, doc: l.draft, savedRevision: 1, savedDoc: l.draft,
        syncedRevision: synced ? 1 : null, fileRevision: synced && p.archivoAspireUrl ? 1 : null, locked, legacy: true }];
    }
    const r = l.record;
    // El archivo vale para la revisión si se subió después de guardarla y Aspire la sincronizó.
    const filed = !!r && r.syncedRevision === r.revision && !!p.archivoAspireSubidoAt && !!r.updatedAt && p.archivoAspireSubidoAt >= r.updatedAt;
    return [{ ...base, doc: l.draft, savedRevision: r?.revision ?? null, savedDoc: r?.document ?? null,
      syncedRevision: r?.syncedRevision ?? null, fileRevision: filed ? r!.revision : null, locked, legacy: false }];
  }), [mesaPrograms, loaded, fromHistory]);

  const setDraft = (id: string, draft: PreparationDocument) => setLoaded((l) => l[id] ? { ...l, [id]: { ...l[id], draft } } : l);

  /** Cambios del armado; sumar y quitar sellos se asignan al instante en el servidor. */
  const onChange = async (id: string, next: PreparationDocument) => {
    const prev = loaded[id]?.draft;
    if (!prev) return;
    setDraft(id, next);
    const before = new Set(prev.stamps.map((s) => s.selloId)), after = new Set(next.stamps.map((s) => s.selloId));
    const added = [...after].filter((x) => !before.has(x)), removed = [...before].filter((x) => !after.has(x));
    if (!added.length && !removed.length) return;
    added.forEach((x) => pending.current.adding.add(x)); removed.forEach((x) => pending.current.removing.add(x));
    try {
      if (added.length) await api.addStamps(id, added);
      // Igual que «Preparar programa»: quitar devuelve el sello a su estado anterior.
      for (const selloId of removed) await api.removeStamp(id, selloId, { restoreMode: 'PREVIOUS' });
    } catch (e) {
      setLoaded((l) => l[id] ? { ...l, [id]: { ...l[id], draft: reconcile(prev, programs.find((p) => p.id === id)?.stamps ?? []) } } : l);
      toast({ title: 'No se pudo cambiar el programa', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      added.forEach((x) => pending.current.adding.delete(x)); removed.forEach((x) => pending.current.removing.delete(x));
      void refreshQueue();
    }
  };

  const onSave = async (id: string) => {
    const l = loaded[id];
    if (!l) return;
    const p = programs.find((x) => x.id === id);
    setChecking(true);
    try {
      if (l.legacy || (p && wentLegacy(p, l.record))) {
        const checked = await checkPreparation(l.draft);
        setDraft(id, checked);
        return;
      }
      let doc = l.draft;
      // Primera vez: las plantillas de la máquina se copian a la carpeta del programa.
      if (!l.record) {
        const setup = await inheritMachineSetup(id, doc.machine);
        if (setup) doc = { ...doc, recipes: setup.recipes };
      }
      const checked = await checkPreparation(doc, l.record?.observation);
      const saved = await saveProgramPreparation(checked, l.record?.revision ?? 0);
      setLoaded((x) => ({ ...x, [id]: { ...x[id], record: saved, draft: saved.document } }));
      await api.fetchPrograms({ silent: true });
    } finally { setChecking(false); }
  };

  /**
   * Todas las plantillas de Aspire de una vez (una trayectoria por archivo):
   * cada una va a su receta, al repaso o al Corte Forma según lo que tiene
   * adentro. Reemplaza lo cargado en las recetas que reciben algo; queda en el
   * borrador hasta «Guardar y chequear».
   */
  const uploadAllTemplates = async (id: string, files: File[]) => {
    try {
      const { sorted, rejected, byName } = await sortTemplateFiles(files);
      if (!sorted.length) {
        toast({ title: 'Ninguna plantilla se pudo usar', description: rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '), variant: 'destructive' });
        return;
      }
      const ordered = [...sorted].sort((a, b) => (a.stage ?? 99) - (b.stage ?? 99));
      const fileOf = (name: string) => byName.get(name)!;
      type RecipeSetup = PreparationDocument['recipes']['CLASICO'];
      const updates: Partial<Record<keyof PreparationDocument['recipes'], Partial<RecipeSetup>>> = {};
      const full = ordered.find((s) => s.slot.kind === 'fine_full');
      const internal = ordered.find((s) => s.slot.kind === 'fine_internal');
      for (const recipe of ['CLASICO', '3MM', 'ALIMENTO'] as const) {
        const auto = ordered.filter((s) => s.slot.kind === 'automatic' && s.slot.recipes.includes(recipe));
        const perimeter = recipe === 'ALIMENTO' ? ordered.find((s) => s.slot.kind === 'food_perimeter') : undefined;
        if (!auto.length && !full && !internal && !perimeter) continue;
        const next: Partial<RecipeSetup> = { verified: false };
        if (auto.length) {
          next.templatePaths = await uploadPreparationTemplates(id, recipe, auto.map((s) => fileOf(s.name)));
          next.templates = auto.map((s) => s.name);
        }
        const fine: NonNullable<RecipeSetup['fineTemplates']> = {};
        for (const [kind, s] of [['full', full], ['internal', internal]] as const) {
          if (!s) continue;
          const [path] = await uploadPreparationTemplates(id, recipe, [fileOf(s.name)], kind === 'full' ? 'fine_full' : 'fine_internal');
          fine[kind] = { name: s.name, path };
        }
        if (fine.full || fine.internal) next.fineTemplates = fine;
        if (perimeter) {
          const [path] = await uploadPreparationTemplates(id, recipe, [fileOf(perimeter.name)], 'food_perimeter');
          next.perimeterTemplate = { name: perimeter.name, path };
        }
        updates[recipe] = next;
      }
      setLoaded((l) => {
        const d = l[id]?.draft;
        if (!d) return l;
        const recipes = { ...d.recipes };
        for (const r of Object.keys(updates) as (keyof typeof recipes)[]) {
          const u = updates[r]!;
          recipes[r] = { ...recipes[r], ...u, fineTemplates: u.fineTemplates ? { ...recipes[r].fineTemplates, ...u.fineTemplates } : recipes[r].fineTemplates };
        }
        return { ...l, [id]: { ...l[id], draft: { ...d, recipes } } };
      });
      const label = { CLASICO: 'Clásico', '3MM': '3 mm', ALIMENTO: 'Alimento' } as const;
      const missing = (['CLASICO', '3MM', 'ALIMENTO'] as const).flatMap((r) => {
        const m = missingForRecipe(r, sorted);
        return m.length ? [`${label[r]}: falta ${m.join(', ')}.`] : [];
      });
      toast({
        title: `${sorted.length} plantilla${sorted.length === 1 ? '' : 's'} cargada${sorted.length === 1 ? '' : 's'}`,
        description: [...rejected.map((r) => `No se usó «${r.name}»: ${r.reason}.`), ...missing,
          'Revisalas, marcá «Verifiqué…» en cada receta y tocá «Guardar y chequear».'].join(' '),
        variant: rejected.length ? 'destructive' : undefined,
      });
    } catch (e) { toast({ title: 'No se pudieron subir las plantillas', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  // Mientras se espera a Aspire, se relee la preparación para ver si el gadget sincronizó.
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  useEffect(() => {
    if (!waitingFor) return;
    const tick = async () => {
      const l = loaded[waitingFor];
      if (!l || l.legacy) return;
      const record = await getProgramPreparation(waitingFor).catch(() => null);
      if (record && record.syncedRevision !== l.record?.syncedRevision) {
        setLoaded((x) => ({ ...x, [waitingFor]: { ...x[waitingFor], record } }));
        if (record.syncedRevision === record.revision) setWaitingFor(null);
      }
    };
    const t = window.setInterval(() => void tick(), 5000);
    return () => window.clearInterval(t);
  }, [waitingFor, loaded]);

  const onAspire = async (id: string) => {
    try {
      await api.downloadPackage(id);
      setWaitingFor(id);
    } catch (e) { toast({ title: 'No se pudo armar el paquete', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  /** «Empezar a fabricar»: la máquina quedó corriendo, todos los sellos a Haciendo. */
  const onStart = async (id: string) => {
    setStarting(id);
    try {
      await api.setFabricationStateForProgram(id, 'HACIENDO');
      return true;
    } catch (e) {
      toast({ title: 'No se pudo empezar a fabricar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      return false;
    } finally { setStarting(null); }
  };

  const openFromHistory = (p: Program) => {
    if ((MACHINES as string[]).includes(p.machine)) {
      setFromHistory((list) => list.some((x) => x.id === p.id) ? list : [...list, p]);
      setMachine(p.machine as PreparationMachine);
      setSelected((s) => ({ ...s, [p.machine]: p.id }));
    }
    setHistoryOpen(false);
  };

  const onEditProgram = async (id: string, updates: { name?: string; productionDate?: string }) => {
    await api.updateProgram(id, updates);
    await api.fetchPrograms({ silent: true });
  };

  /** Igual que la papelera del tablero: libera los sellos (estado anterior o uno elegido) y borra el programa. */
  const deleteProgram = async (p: Program, choice: RemoveStampChoice) => {
    try {
      await api.deleteProgram(p.id, { restoreMode: choice.mode, newFabricationState: choice.mode === 'NEW' ? choice.state : undefined });
      setSelected((s) => { const { [p.machine as PreparationMachine]: _, ...rest } = s; return rest; });
      setLoaded(({ [p.id]: _, ...rest }) => rest);
      setFromHistory((list) => list.filter((x) => x.id !== p.id));
      toast({ title: 'Programa eliminado', description: p.stamps.length ? `${p.stamps.length} ${p.stamps.length === 1 ? 'sello volvió' : 'sellos volvieron'} a la cola.` : undefined });
    } catch (e) {
      toast({ title: 'No se pudo eliminar el programa', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { void refreshQueue(); }
  };

  const onFabricated = async (id: string, states: { instanceId: string; state: FabricationState }[]) => {
    const doc = loaded[id]?.draft;
    if (!doc) return;
    try {
      if (states.every((s) => s.state === 'HECHO')) await api.setFabricationStateForProgram(id, 'HECHO');
      else await api.setStampFabricationStates(id, states.flatMap(({ instanceId, state }) => {
        const selloId = doc.stamps.find((s) => s.instanceId === instanceId)?.selloId;
        return selloId ? [{ stampId: selloId, state }] : [];
      }));
    } catch (e) { toast({ title: 'No se pudo marcar como fabricado', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const onNewProgram = async () => {
    try {
      const created = await api.createProgram({
        machine, productionDate: todayArgentinaDateKey(), name: generateProgramName({ date: todayArgentinaDateKey(), machine, stampCount: 0 }),
      });
      setSelected((s) => ({ ...s, [machine]: created.id }));
    } catch (e) { toast({ title: 'No se pudo crear el programa', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const current = program ? loaded[program.id] : null;
  const setup: MachineSetup | null = current ? { columns: current.draft.columns, gapMm: current.draft.gapMm, supportVerified: current.draft.supportVerified, recipes: current.draft.recipes } : null;

  if (loading && !programs.length) {
    return <Panel className="flex h-full items-center justify-center gap-2 text-[14px] text-zinc-400"><Loader2 className="size-4 animate-spin" />Cargando programas…</Panel>;
  }
  if (error) return <Panel className="flex h-full items-center justify-center text-[14px] text-red-300">No se pudieron cargar los programas: {error.message}</Panel>;

  return (
    <>
      <MesaArmado
        machine={machine} onMachine={setMachine}
        programs={mesaList}
        programId={programId}
        onProgram={(id) => setSelected((s) => ({ ...s, [machine]: id }))}
        onNewProgram={() => void onNewProgram()}
        queue={queue} soldSizes={soldSizes} stampInfo={stampInfo} today={today} machinesFor={machinesFor}
        legacyAspire={isLegacy(machine)}
        checking={checking || (!!program && !current)}
        onChange={(id, doc) => void onChange(id, doc)}
        onSave={onSave}
        onAspire={(id) => void onAspire(id)}
        onFabricated={(id, states) => void onFabricated(id, states)}
        onStart={onStart} starting={!!program && starting === program.id}
        onOpenHistory={() => setHistoryOpen(true)}
        onEditProgram={onEditProgram}
        onDeleteProgram={(id) => setDeleting(mesaPrograms.find((p) => p.id === id) ?? null)}
        onSetup={() => setSetupOpen(true)}
        onOpenBoard={onOpenBoard}
        broncePiezas={broncePiezas}
      />
      <RemoveStampDialog
        open={!!deleting && deleting.stamps.length > 0}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        bulkCount={deleting?.stamps.length || 1}
        title="Eliminar programa"
        description={deleting ? `¿Eliminar «${deleting.name}»? Se liberarán ${deleting.stamps.length} sello${deleting.stamps.length === 1 ? '' : 's'} y vuelven a la cola.` : ''}
        confirmLabel="Eliminar" confirmVariant="destructive"
        onConfirm={(choice) => { const p = deleting; setDeleting(null); if (p) void deleteProgram(p, choice); }} />
      <ConfirmDialog
        open={!!deleting && deleting.stamps.length === 0}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title="Eliminar programa"
        description={deleting ? `¿Eliminar «${deleting.name}»? No tiene sellos. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar" variant="destructive"
        onConfirm={() => { const p = deleting; setDeleting(null); if (p) void deleteProgram(p, { mode: 'PREVIOUS' }); }} />
      <MesaHistory open={historyOpen} onOpenChange={setHistoryOpen} machine={machine} onOpenProgram={openFromHistory} />
      {program && setup ? (
        <MachineSetupSheet open={setupOpen} onOpenChange={setSetupOpen} machine={machine} machineLabel={MACHINE_LABEL[machine]} setup={setup}
          onChange={(next) => current && setDraft(program.id, reflowMesa({ ...current.draft, ...next,
            columns: next.columns.map((c) => ({ ...c, available: current.draft.columns.find((x) => x.id === c.id)?.available ?? true })) }))}
          onUploadAll={isLegacy(machine) ? undefined : (files) => uploadAllTemplates(program.id, files)} />
      ) : null}
    </>
  );
}
