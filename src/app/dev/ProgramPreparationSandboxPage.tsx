import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProgramPreparationDialog } from '@/components/programas/Preparation/ProgramPreparationDialog';
import { PreparationBoard } from '@/components/programas/Preparation/PreparationBoard';
import { PROGRAM_CARD_SCENARIOS } from './programas-card/mockPrograms';
import { buildExecutionPlan, validatePreparation, type PreparationDocument, type PreparationObservation, type PreparationRecord } from '@/lib/programas/preparation';
import { LOCAL_ASPIRE_FILE_LIMIT, readLocalAspirePlan, readLocalAspireReport } from './programas-card/localAspireTest';
import type { Program, ProgramStamp } from '@/lib/types/index';
import { emptySimulation, SIMULATION_CASES, simulateAspireEdit, simulateSync, simulatedDocument, simulationDocument, simulationSources,
  type SimulationCase, type SimulationState } from './programas-card/preparationSimulation';

function initialSession(scenario: SimulationCase, serial: number) {
  const id = `simulation-C-${serial}`, sources = simulationSources();
  const program: Program = { ...PROGRAM_CARD_SCENARIOS[1].program, id, name: 'Prueba local · máquina C', machine: 'C', stampCount: sources.length,
    stamps: sources.map((s): ProgramStamp => ({ ...s, stampType: s.stampType as ProgramStamp['stampType'], tipoPlanchuela: s.tipoPlanchuela as ProgramStamp['tipoPlanchuela'],
      fabricationState: 'PROGRAMADO', anchoRealCm: s.widthMm / 10, largoRealCm: s.heightMm / 10 })), estadoPrograma: 'BORRADOR', bloqueado: false };
  const record: PreparationRecord = { document: simulationDocument(id, scenario, sources), revision: 1, syncedRevision: null, observation: null, updatedAt: new Date().toISOString() };
  return { program, record, scenario, serial, simulation: emptySimulation(), simulationObservation: null as PreparationObservation | null,
    native: null as { document: PreparationDocument; observation: PreparationObservation } | null };
}
export default function ProgramPreparationSandboxPage() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(() => initialSession('normal', 0));
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'native' | 'simulation'>('native');
  const [reading, setReading] = useState(false);
  const { program, record, simulation, scenario } = session;
  const sessionRef = useRef(session); sessionRef.current = session;
  const activeRecord = mode === 'native' ? record : { ...record, observation: session.simulationObservation };
  // Adaptador en memoria: estas acciones nunca llaman a Supabase, Aspire ni CNC.
  const storage = {
    load: async () => structuredClone(activeRecord),
    save: async (document: PreparationDocument, expected: number) => {
      if (record.revision !== expected || document.programId !== program.id) throw new Error('La revisión del ejemplo cambió. Volvé a abrir el editor.');
      const next = { ...record, document: structuredClone(document), revision: expected + 1, syncedRevision: null, updatedAt: new Date().toISOString() };
      setSession((current) => ({ ...current, record: next })); return { ...next, observation: activeRecord.observation };
    },
    upload: async () => { throw new Error('Las plantillas de esta simulación son ficticias; no se suben archivos.'); },
    remove: async (id: string, stampId: string) => {
      if (id !== program.id || !program.stamps.some((s) => s.id === stampId)) throw new Error('El sello no pertenece al programa de ejemplo.');
      const stamps = program.stamps.filter((s) => s.id !== stampId), next = { ...program, stamps, stampCount: stamps.length };
      setSession((current) => ({ ...current, program: next })); return next;
    },
  };
  const publish = (nextSimulation: SimulationState, nextRecord: PreparationRecord) => {
    setSession((current) => ({ ...current, simulation: nextSimulation, simulationObservation: nextRecord.observation })); return nextRecord;
  };
  const sync = async (saved: PreparationRecord, resolution?: 'app' | 'aspire') => {
    const result = simulateSync(saved.document, saved.revision, simulation, resolution);
    return publish(result.state, { ...saved, observation: result.observation });
  };
  const editAspire = async (saved: PreparationRecord, kind: 'geometry' | 'size') => {
    const next = simulateAspireEdit(simulation, kind);
    return publish(next, { ...saved, observation: { revision: saved.observation?.revision ?? saved.revision,
      stamps: structuredClone(next.current), issues: [], recalculated: false } });
  };
  const actions = mode === 'native' ? [] : [
    { label: 'Simular envío a Aspire', run: (saved: PreparationRecord) => sync(saved) },
    { label: 'Corregir detalle en Aspire simulado', run: (saved: PreparationRecord) => editAspire(saved, 'geometry') },
    { label: 'Agrandar sello 1 en Aspire +10 %', run: (saved: PreparationRecord) => editAspire(saved, 'size') },
    ...(simulation.conflicts.length ? [
      { label: 'Resolver conflicto: usar app', run: (saved: PreparationRecord) => sync(saved, 'app') },
      { label: 'Resolver conflicto: conservar Aspire', run: (saved: PreparationRecord) => sync(saved, 'aspire') },
    ] : []),
  ];
  const runAction = async (action: typeof actions[number]) => {
    setError(null); try { await action.run(activeRecord); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo simular.'); }
  };
  const native = session.native;
  const actual = mode === 'native' ? native?.observation.stamps ?? [] : simulation.current;
  const result = simulatedDocument(mode === 'native' && native ? native.document : record.document, actual, mode === 'native' ? native?.document : simulation.plan);
  const operations = buildExecutionPlan(result);
  const issues = validatePreparation(record.document, program.stamps);
  const exportNativeTest = () => {
    setError(null);
    if (issues.some((issue) => issue.severity === 'error')) { setError('Corregí las observaciones del armado antes de exportarlo.'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'alcohn-local-aspire-test', record }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `prueba-aspire-c-r${record.revision}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const readFile = async (file: File | undefined, kind: 'plan' | 'report') => {
    if (!file) return;
    setReading(true); setError(null);
    const snapshot = sessionRef.current;
    try {
      if (file.size > LOCAL_ASPIRE_FILE_LIMIT) throw new Error('El archivo de prueba supera los 8 MB.');
      const text = await file.text();
      if (sessionRef.current !== snapshot) throw new Error('El armado cambió mientras se leía el archivo. Intentá cargarlo nuevamente.');
      if (kind === 'plan') {
        const loaded = readLocalAspirePlan(text), next = initialSession('normal', Number(loaded.document.programId.split('-').pop()));
        const stamps = next.program.stamps.filter((s) => loaded.document.stamps.some((p) => p.selloId === s.id));
        setSession({ ...next, program: { ...next.program, stamps, stampCount: stamps.length }, record: loaded });
      } else {
        const observation = readLocalAspireReport(text, snapshot.record);
        setSession({ ...snapshot, record: { ...snapshot.record, observation, syncedRevision: null }, native: { document: structuredClone(snapshot.record.document), observation } });
      }
      setMode('native');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.'); }
    finally { setReading(false); }
  };
  return <main className="space-y-5 p-4 md:p-8">
    <div className="space-y-2"><h1 className="text-2xl font-semibold">Preparación de prueba · máquina C</h1>
      <p>Ocho sellos ficticios para probar el recorrido con Aspire real. Guardá el armado y leé el informe que devuelve el gadget local.</p>
      <p className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950">Prueba local sin pedidos reales. Los archivos se leen en este navegador; no se envían al servidor ni habilitan fabricación. Recargar reinicia la sesión: podés restaurarla con el armado descargado.</p>
      <div className="flex flex-wrap gap-2"><Button variant={mode === 'native' ? 'default' : 'outline'} onClick={() => setMode('native')} disabled={open || reading}>Aspire real · archivos locales</Button><Button variant={mode === 'simulation' ? 'default' : 'outline'} onClick={() => setMode('simulation')} disabled={open || reading}>Prueba lógica sin Aspire</Button></div>
    </div>
    <section className="space-y-2 rounded border p-4"><h2 className="font-medium">Prueba con Aspire real</h2>
      <p className="text-sm">Prepará y descargá el armado. Después de ejecutar el gadget de prueba en Aspire, cargá su informe. La descarga no abre Aspire automáticamente; usa las plantillas nativas de la copia C.</p>
      <div className="flex flex-wrap items-center gap-3"><Button onClick={() => setOpen(true)} disabled={reading}>Preparar el programa de prueba</Button><Button variant="outline" onClick={exportNativeTest} disabled={reading}>Descargar armado para prueba real</Button>
        <label className="text-sm">Restaurar armado de prueba<input aria-label="Restaurar armado de prueba" type="file" accept=".json,application/json" disabled={reading || open} className="block max-w-[280px] text-xs" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void readFile(file, 'plan'); }} /></label>
        <label className="text-sm">Leer informe de Aspire<input aria-label="Leer informe de Aspire" type="file" accept=".json,application/json" disabled={reading || open} className="block max-w-[280px] text-xs" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void readFile(file, 'report'); }} /></label></div>
      {reading ? <p role="status">Leyendo archivo local…</p> : null}
      {native ? <p role="status" className="text-sm">Informe leído de Aspire · r{native.observation.revision}{native.observation.revision === record.revision ? ' · corresponde al plan guardado' : ` · hay cambios en el plan r${record.revision}, falta volver a sincronizar`}. {native.observation.recalculated ? 'Declara trayectorias recalculadas.' : 'El recálculo quedó pendiente o falló.'}</p> : <p className="text-sm text-muted-foreground">Todavía no se leyó un informe real. El resultado aparecerá únicamente después de cargarlo.</p>}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
    <section className="space-y-2" aria-label="Casos para simular"><h2 className="font-medium">Elegí un caso</h2>
      <div className="flex flex-wrap gap-2">{SIMULATION_CASES.map((item) => <Button key={item.id} variant={item.id === scenario ? 'default' : 'outline'} onClick={() => { setSession(initialSession(item.id, session.serial + 1)); setError(null); }}>{item.name}</Button>)}</div>
      <p className="text-sm text-muted-foreground">{SIMULATION_CASES.find((item) => item.id === scenario)?.description} Cambiar de caso reinicia la prueba.</p>
    </section>
    {mode === 'simulation' ? <section className="space-y-2 rounded border p-4">
      <h2 className="font-medium">Probá este recorrido</h2>
      <ol className="list-inside list-decimal space-y-1 text-sm"><li>Simulá el envío inicial.</li><li>Corregí un detalle en Aspire simulado; después abrí el editor, mové Marca A y guardá. Al volver a enviar, conserva la corrección.</li><li>Agrandá Marca A en Aspire simulado y cambiá su tamaño también en el editor. Al enviar, pide resolver el conflicto.</li></ol>
      <div className="flex flex-wrap gap-2 pt-2">{actions.map((action) => <Button key={action.label} variant="outline" onClick={() => void runAction(action)}>{action.label}</Button>)}</div>
    </section> : null}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2 rounded border p-3"><h2 className="font-medium">Plan guardado en la app · r{record.revision}</h2>
        <div className="h-[500px]"><PreparationBoard document={record.document} selectedId={null} onSelect={() => undefined} onMove={() => undefined} readOnly showOperations /></div>
        <p className="text-xs text-muted-foreground">Rojo: corte transversal. Celeste: taladro del plan. No representan trayectorias de herramienta.</p>
        <p className="text-sm">{issues.length ? `${issues.length} ${issues.length === 1 ? 'observación' : 'observaciones'} por resolver` : 'Controles del armado sin observaciones'}</p>{issues.map((issue, i) => <p key={i} className="text-xs text-red-700">{issue.message}</p>)}
      </section>
      <section className="space-y-2 rounded border p-3"><h2 className="font-medium">{mode === 'native' ? 'Resultado leído de Aspire' : 'Resultado lógico simulado'}</h2>
        {actual.length ? <><div className="h-[500px]"><PreparationBoard document={result} selectedId={null} onSelect={() => undefined} onMove={() => undefined} readOnly showOperations /></div>
          <p className="text-sm">{actual.length} sellos · {operations.stamps.length} cortes derivados · {operations.stamps.length} taladros derivados · {operations.columns.length} planchuelas usadas.</p>
          {mode === 'native' ? <p className="text-xs text-muted-foreground">Dibujos y medidas del informe real. Las líneas de corte y taladros de esta vista se derivan de esas medidas; no son una vista previa CAM.</p> : null}</> : <p className="flex h-[450px] items-center justify-center text-sm text-muted-foreground">{mode === 'native' ? 'Cargá el informe de Aspire para ver el resultado real.' : 'Todavía no se aplicó un armado simulado.'}</p>}
        {activeRecord.observation?.issues.map((issue, i) => <p key={i} className="text-xs text-red-700">{issue.message}</p>)}
        {mode === 'native' && native ? <table className="w-full text-left text-xs"><caption className="pb-2 text-left">Medidas leídas de Aspire · largo × ancho</caption><thead><tr><th>Sello</th><th>Medida real</th><th>Mecanizado</th></tr></thead><tbody>{actual.map((s) => <tr key={s.instanceId}><td>{native.document.stamps.find((p) => p.instanceId === s.instanceId)?.name}</td><td>{s.heightMm.toFixed(2)} × {s.widthMm.toFixed(2)} mm</td><td>{s.recipe}</td></tr>)}</tbody></table> : null}
      </section>
    </div>
    {mode === 'simulation' ? <section className="rounded border p-3"><h2 className="mb-2 font-medium">Registro de la prueba lógica</h2>
      {simulation.events.length ? <ol className="list-inside list-decimal space-y-1 text-sm">{simulation.events.map((event, i) => <li key={i}>{event}</li>)}</ol> : <p className="text-sm text-muted-foreground">Las acciones y sus resultados aparecen acá.</p>}
    </section> : null}
    <ProgramPreparationDialog key={`${program.id}-${mode}`} program={program} open={open} onOpenChange={setOpen} storage={storage} localTest={mode === 'native'}
      simulation={mode === 'simulation' ? { description: 'Guardá antes de enviar. Los cambios en Aspire simulado afectan a Marca A, el primer sello. Al cerrar podés comparar ambos armados.', actions } : undefined} />
  </main>;
}
