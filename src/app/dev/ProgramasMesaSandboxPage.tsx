import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { MACHINE_LABEL, MesaArmado, type MesaProgram } from '@/components/programas/Mesa/MesaArmado';
import { MachineSetupSheet, type MachineSetup } from '@/components/programas/Mesa/MachineSetupSheet';
import { addStamp, emptyDocument, fitsMachine, reflowMesa, type MesaSource } from '@/lib/programas/mesa';
import { checkPreparation } from '@/lib/programas/checkPreparation';
import type { PreparationDocument, PreparationMachine } from '@/lib/programas/preparation';
import { mockQueue } from './programas-card/mesaMock';

const MACHINES: PreparationMachine[] = ['C', 'G', 'XL'];

/** Soporte y plantillas de ejemplo, ya verificados (en la app real vienen de la máquina). */
function mockSetup(machine: PreparationMachine): MachineSetup {
  const doc = emptyDocument('setup', machine);
  doc.supportVerified = true;
  for (const [id, r] of Object.entries(doc.recipes)) {
    r.verified = true;
    r.templatePaths = r.templates.map((t) => `ejemplo/${id}/${t}`);
    r.fineTemplates = { full: { name: 'repaso.ToolpathTemplate', path: `ejemplo/${id}/fine_full/repaso.ToolpathTemplate` } };
  }
  doc.recipes.ALIMENTO.perimeterTemplate = { name: 'Corte Forma.ToolpathTemplate', path: 'ejemplo/ALIMENTO/food_perimeter/corte.ToolpathTemplate' };
  return { columns: doc.columns, gapMm: doc.gapMm, supportVerified: doc.supportVerified, recipes: doc.recipes };
}

/** Uno por día y máquina es lo habitual; el segundo del mismo día se numera («17 oct · 2»). */
function newProgram(id: string, machine: PreparationMachine, setup: MachineSetup, today: Date, existing: MesaProgram[] = []): MesaProgram {
  const doc: PreparationDocument = { ...emptyDocument(id, machine), ...setup, columns: setup.columns.map((c) => ({ ...c })) };
  const day = format(today, 'd MMM', { locale: es });
  const same = existing.filter((p) => p.machine === machine && (p.name === day || p.name.startsWith(`${day} · `))).length;
  return { id, machine, name: same ? `${day} · ${same + 1}` : day, doc, savedRevision: null, savedDoc: null, syncedRevision: null, fileRevision: null };
}

type SandboxState = ReturnType<typeof freshState>;
const DRAFT_KEY = 'mesa-programas-borrador-v1';

/** Borrador del prototipo en este navegador (en producción lo guarda la base). */
function loadDraft(today: Date): SandboxState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) { const d = JSON.parse(raw) as SandboxState & { day: string }; if (d.day === today.toDateString() && Array.isArray(d.programs)) return d; }
  } catch { /* sin almacenamiento: se arranca de cero */ }
  return freshState(today);
}

function freshState(today: Date) {
  const setups = Object.fromEntries(MACHINES.map((m) => [m, mockSetup(m)])) as Record<PreparationMachine, MachineSetup>;
  const queue = mockQueue(today);
  const c = newProgram('mesa-c-1', 'C', setups.C, today);
  for (const s of queue.filter((q) => ['Estudio Luna', 'Taller Río', 'Café Norte'].includes(q.designName))) {
    const r = addStamp(c.doc, s); if (r.added) c.doc = r.doc;
  }
  return { setups, queue, programs: [c], selected: { C: c.id } as Partial<Record<PreparationMachine, string>> };
}

/**
 * Prototipo de la nueva página de Programas: la mesa de armado.
 * Datos en memoria; el chequeo de fresa es el real; Aspire está simulado.
 * Abrí /dev/mesa-programas
 */
export default function ProgramasMesaSandboxPage() {
  const today = useMemo(() => new Date(), []);
  const [state, setState] = useState(() => loadDraft(today));
  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, day: today.toDateString() })); } catch { /* lleno o bloqueado */ }
  }, [state, today]);
  const [machine, setMachine] = useState<PreparationMachine>('C');
  const [checking, setChecking] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const used = useMemo(() => new Set(state.programs.flatMap((p) => p.doc.stamps.map((s) => s.selloId))), [state.programs]);
  const queue = state.queue.filter((s) => !used.has(s.id));
  const soldSizes = useMemo(() => Object.fromEntries(state.queue.map((s: MesaSource) => [s.id, { shortMm: Math.min(s.widthMm, s.heightMm), longMm: Math.max(s.widthMm, s.heightMm) }])), [state.queue]);
  const updateProgram = (id: string, change: (p: MesaProgram) => MesaProgram) => setState((s) => ({ ...s, programs: s.programs.map((p) => p.id === id ? change(p) : p) }));

  return (
    <AppMain className="ml-0 bg-black">
      <div className="flex h-screen flex-col gap-3 p-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5">Prototipo · datos de ejemplo · Aspire simulado</span>
          <span>La fresa se chequea de verdad al guardar · el borrador queda en este navegador.</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setState(freshState(today)); setMachine('C'); }}><RotateCcw className="mr-1 size-4" />Reiniciar</Button>
            <Button size="sm" variant="ghost" asChild><Link to="/dev/programas"><ArrowLeft className="mr-1 size-4" />Tablero actual</Link></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <MesaArmado
            machine={machine} onMachine={setMachine}
            programs={state.programs}
            programId={state.selected[machine] ?? null}
            onProgram={(id) => setState((s) => ({ ...s, selected: { ...s.selected, [machine]: id } }))}
            onNewProgram={() => {
              const p = newProgram(`mesa-${machine}-${Date.now()}`, machine, state.setups[machine], today, state.programs);
              setState((s) => ({ ...s, programs: [...s.programs, p], selected: { ...s.selected, [machine]: p.id } }));
            }}
            queue={queue} soldSizes={soldSizes} today={today}
            stampInfo={Object.fromEntries(state.queue.map((s) => [s.id, { notes: s.notes, isPriority: s.isPriority, deadlineAt: s.deadlineAt }]))}
            legacyAspire={machine !== 'C'}
            machinesFor={(s) => MACHINES.filter((m) => fitsMachine({ ...emptyDocument('x', m), columns: state.setups[m].columns }, s))}
            onFabricated={(id, states) => updateProgram(id, (p) => ({ ...p, locked: true, fabricated: {
              at: format(new Date(), "d MMM HH:mm", { locale: es }),
              retocar: states.filter((x) => x.state === 'RETOCAR').length, rehacer: states.filter((x) => x.state === 'REHACER').length } }))}
            checking={checking}
            onChange={(id, doc) => updateProgram(id, (p) => ({ ...p, doc }))}
            onSave={async (id) => {
              const program = state.programs.find((p) => p.id === id);
              if (!program) return;
              setChecking(true);
              try {
                const checked = await checkPreparation(program.doc);
                updateProgram(id, (p) => ({ ...p, doc: checked, savedDoc: checked, savedRevision: (p.savedRevision ?? 0) + 1 }));
              } finally { setChecking(false); }
            }}
            onAspire={(id) => {
              window.setTimeout(() => updateProgram(id, (p) => ({ ...p, syncedRevision: p.savedRevision, fileRevision: p.savedRevision })), 2000);
            }}
            onSetup={() => setSetupOpen(true)}
          />
        </div>
      </div>
      <MachineSetupSheet open={setupOpen} onOpenChange={setSetupOpen} machine={machine} machineLabel={MACHINE_LABEL[machine]} setup={state.setups[machine]}
        onChange={(setup) => setState((s) => ({
          ...s, setups: { ...s.setups, [machine]: setup },
          programs: s.programs.map((p) => p.machine !== machine ? p : { ...p, doc: reflowMesa({ ...p.doc, supportVerified: setup.supportVerified, recipes: setup.recipes,
            columns: setup.columns.map((c) => ({ ...c, available: p.doc.columns.find((x) => x.id === c.id)?.available ?? true })) }) }),
        }))} />
      <Toaster />
    </AppMain>
  );
}
