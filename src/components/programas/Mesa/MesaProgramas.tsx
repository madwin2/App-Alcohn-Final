import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { checkPreparation } from '@/lib/programas/checkPreparation';
import { emptyDocument, reconcileMesa as reconcile, reflowMesa, type MesaPending as Pending, type MesaSource } from '@/lib/programas/mesa';
import { type PreparationDocument, type PreparationMachine, type PreparationRecord } from '@/lib/programas/preparation';
import { generateProgramName } from '@/lib/programas/programName';
import {
  getProgramPreparation, inheritMachineSetup, peekMachineSetup, saveProgramPreparation, uploadPreparationTemplates, type MachineSetup as StoredSetup,
} from '@/lib/supabase/services/programPreparation.service';
import { getEligibleStamps } from '@/lib/supabase/services/programs.service';
import type { usePrograms } from '@/lib/hooks/usePrograms';
import type { FabricationState, Program, ProgramStamp } from '@/lib/types/index';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import { MACHINE_LABEL, MesaArmado, type MesaProgram } from './MesaArmado';
import { MachineSetupSheet, type MachineSetup } from './MachineSetupSheet';
import { Panel } from './mesaUi';

const MACHINES: PreparationMachine[] = ['C', 'G', 'XL'];
/** Solo la Chica tiene calificado el gadget 3.2 con preparación (ADR-027). */
const isLegacy = (m: PreparationMachine) => m !== 'C';
const DONE_STATES = new Set<FabricationState>(['HECHO', 'VERIFICAR', 'RETOCAR', 'REHACER']);
/** Un fabricado sigue a mano en la mesa un par de días; después queda en «Todos». */
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
  const setups = useRef<Partial<Record<PreparationMachine, Promise<StoredSetup | null>>>>({});
  const pending = useRef<Pending>({ adding: new Set(), removing: new Set() });
  const setupFor = (m: PreparationMachine) => (setups.current[m] ??= peekMachineSetup(m).catch(() => null));

  // Programas que van en la mesa: C/G/XL, sin los fabricados viejos.
  const mesaPrograms = useMemo(() => programs
    .filter((p): p is Program & { machine: PreparationMachine } => (MACHINES as string[]).includes(p.machine))
    .filter((p) => !isFabricated(p) || differenceInCalendarDays(today, parseISO(p.lastUpdated)) <= FABRICATED_VISIBLE_DAYS)
    .sort((a, b) => (b.productionDate ?? '').localeCompare(a.productionDate ?? '') || b.createdAt.localeCompare(a.createdAt)), [programs, today]);
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
    const out: Record<string, { notes?: string | null; isPriority?: boolean; deadlineAt?: string }> = {};
    for (const s of [...queue, ...programs.flatMap((p) => p.stamps)] as ProgramStamp[]) out[s.id] = { notes: s.notes, isPriority: s.isPriority, deadlineAt: s.deadlineAt };
    return out;
  }, [queue, programs]);

  const mesaList: MesaProgram[] = useMemo(() => mesaPrograms.flatMap((p): MesaProgram[] => {
    const l = loaded[p.id];
    if (!l) return [{ id: p.id, name: p.name, machine: p.machine, doc: emptyDocument(p.id, p.machine), savedRevision: null, savedDoc: null, syncedRevision: null, fileRevision: null, locked: true }];
    const fabricated = isFabricated(p) ? {
      at: format(parseISO(p.lastUpdated), 'd MMM', { locale: es }),
      retocar: p.stamps.filter((s) => s.fabricationState === 'RETOCAR').length,
      rehacer: p.stamps.filter((s) => s.fabricationState === 'REHACER').length,
    } : null;
    const locked = p.bloqueado || p.estadoPrograma === 'EN_FABRICACION';
    if (l.legacy || wentLegacy(p, l.record)) {
      // G/XL: no hay revisiones; Aspire queda hecho cuando el gadget sincronizó y no hubo cambios después.
      const synced = !!p.syncAt && !p.dirty;
      return [{ id: p.id, name: p.name, machine: p.machine, doc: l.draft, savedRevision: 1, savedDoc: l.draft,
        syncedRevision: synced ? 1 : null, fileRevision: synced && p.archivoAspireUrl ? 1 : null, locked, fabricated, legacy: true }];
    }
    const r = l.record;
    // El archivo vale para la revisión si se subió después de guardarla y Aspire la sincronizó.
    const filed = !!r && r.syncedRevision === r.revision && !!p.archivoAspireSubidoAt && !!r.updatedAt && p.archivoAspireSubidoAt >= r.updatedAt;
    return [{ id: p.id, name: p.name, machine: p.machine, doc: l.draft, savedRevision: r?.revision ?? null, savedDoc: r?.document ?? null,
      syncedRevision: r?.syncedRevision ?? null, fileRevision: filed ? r!.revision : null, locked, fabricated, legacy: false }];
  }), [mesaPrograms, loaded]);

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
        onSetup={() => setSetupOpen(true)}
        onOpenBoard={onOpenBoard}
      />
      {program && setup ? (
        <MachineSetupSheet open={setupOpen} onOpenChange={setSetupOpen} machine={machine} machineLabel={MACHINE_LABEL[machine]} setup={setup}
          onChange={(next) => current && setDraft(program.id, reflowMesa({ ...current.draft, ...next,
            columns: next.columns.map((c) => ({ ...c, available: current.draft.columns.find((x) => x.id === c.id)?.available ?? true })) }))}
          onUpload={isLegacy(machine) ? undefined : async (recipe, files) => {
            try {
              const paths = await uploadPreparationTemplates(program.id, recipe, files);
              const d = loaded[program.id]?.draft;
              if (d) setDraft(program.id, { ...d, recipes: { ...d.recipes, [recipe]: { ...d.recipes[recipe], templates: files.map((f) => f.name), templatePaths: paths, verified: false } } });
            } catch (e) { toast({ title: 'No se pudieron subir las plantillas', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
          }} />
      ) : null}
    </>
  );
}
