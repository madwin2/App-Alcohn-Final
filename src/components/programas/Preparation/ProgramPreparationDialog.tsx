import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Redo2, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Program } from '@/lib/types/index';
import { adoptObservedStamp, arrangePreparation, createPreparation, observedSvgForStamp, validatePreparation, type PreparationDocument, type PreparationRecord, type Recipe, type StampPlacement } from '@/lib/programas/preparation';
import { discardProgramPreparation, getProgramPreparation, inheritMachineSetup, saveProgramPreparation, uploadPreparationTemplates } from '@/lib/supabase/services/programPreparation.service';
import { useToast } from '@/components/ui/use-toast';
import { PreparationBoard } from './PreparationBoard';
import { FresaCheckDialog } from '@/components/fresa/FresaCheckDialog';
import { fetchSvgText } from '@/lib/fresa/useFresaReport';
import { removeStampFromProgram } from '@/lib/supabase/services/programs.service';
import { checkPreparation } from '@/lib/programas/checkPreparation';
import { PASS_OUTCOME_LABEL, type PassOutcome } from '@/lib/fresa/passes';

function NumberField({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs">{label}<input type="number" step="0.1" value={value} disabled={disabled}
    className="h-8 w-full rounded-md border bg-background px-2" onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} /></label>;
}

interface PreparationStorage {
  load: typeof getProgramPreparation; save: typeof saveProgramPreparation; upload: typeof uploadPreparationTemplates;
  remove: typeof removeStampFromProgram;
  discard?: typeof discardProgramPreparation; inherit?: typeof inheritMachineSetup;
}
const serverStorage: PreparationStorage = { load: getProgramPreparation, save: saveProgramPreparation, upload: uploadPreparationTemplates,
  remove: removeStampFromProgram, discard: discardProgramPreparation, inherit: inheritMachineSetup };
interface PreparationSimulation {
  description: string;
  actions: { label: string; run: (record: PreparationRecord) => Promise<PreparationRecord> }[];
}
export function ProgramPreparationDialog({ program, open, onOpenChange, onRefresh, storage = serverStorage, simulation, localTest = false }: { program: Program; open: boolean; onOpenChange: (open: boolean) => void; onRefresh?: () => Promise<void> | void; storage?: PreparationStorage; simulation?: PreparationSimulation; localTest?: boolean }) {
  const { toast } = useToast();
  const [record, setRecord] = useState<PreparationRecord | null>(null);
  const [history, setHistory] = useState<PreparationDocument[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkSvg, setCheckSvg] = useState<string | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [checkMachined, setCheckMachined] = useState(false);
  const readOnly = program.bloqueado || ['EN_FABRICACION', 'FINALIZADO'].includes(program.estadoPrograma);
  const doc = history[cursor] ?? null;
  const selected = doc?.stamps.find((s) => s.instanceId === selectedId) ?? null;
  const checkStamp = doc?.stamps.find((s) => s.instanceId === checkId) ?? null;
  const issues = useMemo(() => doc ? validatePreparation(doc, program.stamps) : [], [doc, program.stamps]);
  const dirty = !!doc && JSON.stringify(doc) !== JSON.stringify(record?.document);

  useEffect(() => {
    if (!open || program.machine === 'ABC') return;
    let alive = true;
    setLoading(true); setNotice(null); setStorageReady(true); setRecord(null);
    const fresh = createPreparation(program.id, program.machine, program.stamps);
    setHistory([fresh]); setCursor(0); setSelectedId(fresh.stamps[0]?.instanceId ?? null);
    void storage.load(program.id).then(async (loaded) => {
      if (!alive) return;
      setRecord(loaded);
      if (loaded) { setHistory([loaded.document]); setSelectedId(loaded.document.stamps[0]?.instanceId ?? null); return; }
      // Programa nuevo: el soporte y las plantillas son de la máquina.
      const setup = await storage.inherit?.(program.id, fresh.machine).catch(() => null);
      if (!alive || !setup) return;
      const { fromProgramName, ...machineSetup } = setup;
      setHistory([fresh, arrangePreparation({ ...fresh, ...machineSetup })]); setCursor(1);
      setNotice(`Se tomaron el soporte y las plantillas de «${fromProgramName}». Revisá el armado y guardá.`);
    }).catch((error) => { if (alive) { setStorageReady(false); setNotice(error instanceof Error ? error.message : 'No se pudo cargar la preparación.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Un nuevo programa abre otro borrador; las actualizaciones externas se
    // presentan como diferencias y nunca pisan una edición en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, program.id]);

  const edit = (next: PreparationDocument) => {
    if (readOnly || loading || saving) return;
    const retained = history.slice(0, cursor + 1);
    const nextHistory = [...retained, next].slice(-80);
    setHistory(nextHistory); setCursor(nextHistory.length - 1);
  };
  const changeStamp = (id: string, patch: Partial<StampPlacement>) => {
    if (doc) edit({ ...doc, stamps: doc.stamps.map((s) => s.instanceId === id ? { ...s, ...patch } : s) });
  };
  const move = (id: string, columnId: string, topY: number) => {
    const col = doc?.columns.find((c) => c.id === columnId);
    if (col) changeStamp(id, { columnId, centerX: col.centerX, topY });
  };
  const save = async () => {
    if (!doc || readOnly) return;
    setSaving(true);
    try {
      const checked = await checkPreparation(doc, record?.observation);
      const saved = await storage.save(checked, record?.revision ?? 0);
      setRecord(saved); setHistory([saved.document]); setCursor(0);
      await onRefresh?.();
      toast({ title: `Preparación r${saved.revision} guardada`, description: localTest ? 'Guardada en memoria. Cerrá el editor y descargá el armado para la prueba en Aspire.' : simulation ? 'Guardada en memoria para la simulación.' : issues.length ? 'Borrador con observaciones pendientes.' : 'Lista para sincronizar con el gadget actualizado.' });
    } catch (error) { toast({ title: 'No se pudo guardar', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const close = (next: boolean) => {
    if (!next && dirty && !window.confirm('Hay cambios de preparación sin guardar. ¿Descartarlos y cerrar?')) return;
    onOpenChange(next);
  };
  const openCheck = async () => {
    if (!selected) return;
    setChecking(true);
    try {
      const observedSvg = observedSvgForStamp(selected, record?.observation);
      setCheckMachined(selected.vectorSvg ? !!selected.vectorAlreadyMachined : !!observedSvg);
      setCheckSvg(selected.vectorSvg ?? observedSvg ?? await fetchSvgText(selected.sourceUrl)); setCheckId(selected.instanceId);
    } catch (error) { toast({ title: 'No se pudo abrir el vector', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
    finally { setChecking(false); }
  };
  const discard = async () => {
    if (!record || !storage.discard || readOnly) return;
    if (!window.confirm('¿Descartar la preparación? El programa vuelve al armado anterior (gadget sin preparación). El historial se conserva.')) return;
    setSaving(true);
    try {
      await storage.discard(program.id, record.revision);
      await onRefresh?.();
      toast({ title: 'Preparación descartada', description: 'El programa vuelve al armado anterior.' });
      onOpenChange(false);
    } catch (error) { toast({ title: 'No se pudo descartar', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const downloadPlan = () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ revision: record?.revision ?? 0, document: doc }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${program.name}-preparacion.json`; a.click(); URL.revokeObjectURL(url);
  };
  return <>
    <Dialog open={open} onOpenChange={close}><DialogContent className="flex h-[94vh] w-[min(1400px,98vw)] max-w-none flex-col gap-3 sm:max-w-none">
      <DialogHeader className="shrink-0 pr-8"><DialogTitle>Preparar programa — {program.name}</DialogTitle></DialogHeader>
      {localTest ? <p className="shrink-0 rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-950">Prueba local con Aspire real. El informe cargado aporta el dibujo corregido para editar y chequear. Guardar no ejecuta Aspire: descargá el nuevo armado, sincronizalo en la copia C y cargá su informe. No habilita fabricación.</p> : null}
      {simulation ? <section className="shrink-0 space-y-2 rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-950">
        <p><strong>SIMULACIÓN · sin Aspire ni CAM.</strong> {simulation.description}</p>
        <div className="flex flex-wrap gap-2">{simulation.actions.map((action) => <Button key={action.label} size="sm" variant="outline" className="bg-white text-slate-950 hover:bg-slate-100 hover:text-slate-950" disabled={!record || dirty || saving || loading} onClick={async () => {
          if (!record || dirty) return; setSaving(true);
          try { const next = await action.run(record); setRecord(next); setNotice('Resultado simulado actualizado. Cerrá el editor para ver la comparación y el registro de pasos.'); }
          catch (error) { toast({ title: 'Simulación pendiente', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
          finally { setSaving(false); }
        }}>{action.label}</Button>)}</div>
        {dirty ? <p>Guardá la preparación para probar estos cambios.</p> : null}
      </section> : null}
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
        <span>{record ? `Revisión ${record.revision}` : 'Preparación nueva'}{dirty ? ' · cambios sin guardar' : ''}</span>
        <span className="text-muted-foreground">{simulation || localTest ? 'Prueba en memoria · no habilita fabricación' : record?.syncedRevision === record?.revision && record ? 'Aplicada en Aspire; revisá su informe' : 'Pendiente de sincronizar'}</span>
        <Button size="sm" variant="outline" disabled={cursor === 0 || readOnly} onClick={() => setCursor((c) => c - 1)}><Undo2 className="mr-1 size-4" />Deshacer</Button>
        <Button size="sm" variant="outline" disabled={cursor >= history.length - 1 || readOnly} onClick={() => setCursor((c) => c + 1)}><Redo2 className="mr-1 size-4" />Rehacer</Button>
        <Button size="sm" variant="outline" disabled={!doc || readOnly} onClick={() => doc && edit(arrangePreparation(doc))}>Reacomodar libres</Button>
        <Button size="sm" variant="outline" onClick={downloadPlan} disabled={!doc}><Download className="mr-1 size-4" />Exportar preparación</Button>
        <Button size="sm" variant="outline" disabled={loading || saving || !storageReady} onClick={() => void storage.load(program.id).then((next) => {
          if (next && next.revision !== record?.revision) { setNotice('Hay otra revisión guardada. Cerrá y volvé a abrir antes de guardar cambios.'); return; }
          setRecord(next);
        }).catch((error) => setNotice(error.message))}>Actualizar informe de Aspire</Button>
        <Button size="sm" disabled={!doc || readOnly || loading || saving || !storageReady || !dirty} onClick={() => void save()}>{saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}Guardar preparación</Button>
        {record && storage.discard && !simulation && !localTest ? <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={readOnly || loading || saving} onClick={() => void discard()}>Descartar preparación</Button> : null}
      </div>
      {notice ? <p role="alert" className="shrink-0 rounded border border-amber-300 p-2 text-sm">{notice}</p> : null}
      {readOnly ? <p className="text-sm">El programa está bloqueado o en fabricación. La preparación es de solo lectura.</p> : null}
      {loading ? <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Cargando preparación…</p> : doc ? <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:grid lg:grid-cols-[180px_minmax(0,1fr)_300px]">
        <aside className="max-h-48 shrink-0 space-y-2 overflow-y-auto lg:max-h-none">
          <p className="text-sm font-medium">Sellos del programa</p>
          {doc.stamps.map((s) => <button type="button" key={s.instanceId} className={`w-full rounded border p-2 text-left text-xs ${selectedId === s.instanceId ? 'border-primary bg-muted' : ''}`} onClick={() => setSelectedId(s.instanceId)}>
            <strong className="block">{s.name}</strong><span>{s.heightMm.toFixed(1)} × {s.widthMm.toFixed(1)} mm · {s.recipe}</span><span className="block text-muted-foreground">{s.excluded ? `Fuera: ${s.exclusionReason ?? ''}` : s.pinned ? 'Posición fija' : 'Posición libre'}</span>
          </button>)}
          <Button size="sm" variant="outline" className="h-auto w-full whitespace-normal py-2" disabled={readOnly} onClick={() => {
            const fresh = createPreparation(program.id, doc.machine, program.stamps);
            edit({ ...doc, stamps: fresh.stamps.map((s) => doc.stamps.find((old) => old.selloId === s.selloId) ?? s) });
          }}>Actualizar sellos del programa</Button>
        </aside>
        <div className="flex min-h-[450px] min-w-0 shrink-0 flex-col lg:shrink"><PreparationBoard document={doc} selectedId={selectedId} onSelect={setSelectedId} onMove={move} readOnly={readOnly || loading || saving} showOperations={!!simulation || localTest} observed={Object.fromEntries(doc.stamps.map((s) => [s.instanceId, observedSvgForStamp(s, record?.observation)]).filter((entry): entry is [string, string] => !!entry[1]))} />
          <p className="pt-1 text-xs text-muted-foreground">Arrastrá para mover entre planchuelas. Los valores del soporte parten del gadget actual y requieren verificación física.</p>
        </div>
        <aside className="shrink-0 space-y-3 pb-4 lg:overflow-y-auto">
          {selected ? <fieldset disabled={readOnly || saving} className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{selected.name}</legend>
            <p className="text-xs text-muted-foreground">Vendido: {program.stamps.find((s) => s.id === selected.selloId)?.anchoRealCm != null && program.stamps.find((s) => s.id === selected.selloId)?.largoRealCm != null ? `${(program.stamps.find((s) => s.id === selected.selloId)!.anchoRealCm! * 10).toFixed(1)} × ${(program.stamps.find((s) => s.id === selected.selloId)!.largoRealCm! * 10).toFixed(1)} mm` : 'Ver pedido'} · los ajustes se guardan para esta ejecución.</p>
            {record?.observation?.stamps.filter((s) => s.instanceId === selected.instanceId).map((s) => <p key={s.instanceId} className="text-xs">Último Aspire: {s.heightMm.toFixed(1)} × {s.widthMm.toFixed(1)} mm · {s.recipe}</p>)}
            <label className="block text-xs">Planchuela<select className="mt-1 h-8 w-full rounded border bg-background" value={selected.columnId} onChange={(e) => move(selected.instanceId, e.target.value, selected.topY)}>{doc.columns.map((c) => <option key={c.id} value={c.id}>{c.nominalMm} mm{c.available ? '' : ' · sin material'}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Ancho sobre planchuela (mm)" value={selected.widthMm} onChange={(n) => changeStamp(selected.instanceId, { widthMm: n, heightMm: n * selected.heightMm / selected.widthMm })} />
              <NumberField label="Largo (mm)" value={selected.heightMm} onChange={(n) => changeStamp(selected.instanceId, { heightMm: n, widthMm: n * selected.widthMm / selected.heightMm })} />
              <NumberField label="Centro X (mm)" value={selected.centerX} onChange={(centerX) => changeStamp(selected.instanceId, { centerX })} />
              <NumberField label="Inicio Y (mm)" value={selected.topY} onChange={(topY) => changeStamp(selected.instanceId, { topY })} />
            </div>
            <label className="block text-xs">Mecanizado<select className="mt-1 h-8 w-full rounded border bg-background" value={selected.recipe} onChange={(e) => changeStamp(selected.instanceId, { recipe: e.target.value as Recipe })}><option value="CLASICO">Clásico · 1,7 mm</option><option value="3MM">3 mm</option><option value="ALIMENTO">Alimento · 3 mm + corte 6 mm</option></select></label>
            <label className="block text-xs">Repaso de 0,1 mm<select className="mt-1 h-8 w-full rounded border bg-background" value={selected.fine?.mode ?? 'auto'} onChange={(e) => changeStamp(selected.instanceId, { fine: { mode: e.target.value as 'auto' | 'whole' | 'none' | 'aspire', needsFine: true, inputHash: '', widthMm: selected.widthMm, heightMm: selected.heightMm, recipe: selected.recipe, outcome: 'sin_analisis' } })}>
              <option value="auto">Automático · sin repaso o sello completo</option><option value="whole">Sello completo</option><option value="none">Sin repaso · decisión del operario</option><option value="aspire">Conservar selección parcial de Aspire</option>
            </select></label>
            {selected.fine?.mode === 'aspire' ? <label className="block text-xs">Operación de la selección conservada<select className="mt-1 h-8 w-full rounded border bg-background" value={selected.fine.scope ?? 'full'} onChange={(e) => changeStamp(selected.instanceId, { fine: { ...selected.fine!, scope: e.target.value as 'full' | 'internal' } })}><option value="full">Perfilado fino habitual</option><option value="internal">Solo detalle interior</option></select></label> : null}
            <p className="text-xs text-muted-foreground">{selected.fine ? PASS_OUTCOME_LABEL[selected.fine.outcome as PassOutcome] ?? 'Sin análisis disponible: repaso completo como respaldo.' : 'Al guardar se chequean todos los sellos.'} La selección parcial requiere revisar contactos en Aspire.</p>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.pinned} onChange={(e) => changeStamp(selected.instanceId, { pinned: e.target.checked })} />Fijar posición</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.excluded} onChange={(e) => changeStamp(selected.instanceId, { excluded: e.target.checked, exclusionReason: e.target.checked ? 'Sin material' : undefined })} />Dejar fuera de esta corrida</label>
            {selected.excluded ? <label className="block text-xs">Motivo<input className="mt-1 h-8 w-full rounded border bg-background px-2" value={selected.exclusionReason ?? ''} onChange={(e) => changeStamp(selected.instanceId, { exclusionReason: e.target.value })} /></label> : null}
            {selected.excluded ? <Button size="sm" variant="outline" onClick={async () => {
              setSaving(true);
              try {
                await storage.remove(program.id, selected.selloId, { restoreMode: 'PREVIOUS' });
                setSaving(false); edit({ ...doc, stamps: doc.stamps.filter((s) => s.instanceId !== selected.instanceId) });
                await onRefresh?.(); setSelectedId(null);
                toast({ title: 'Sello devuelto a pendientes', description: 'Guardá la preparación actualizada y sincronizá para retirarlo de Aspire.' });
              } catch (error) { toast({ title: 'No se pudo devolver a pendientes', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
              finally { setSaving(false); }
            }}>Sacar del programa y devolver a pendientes</Button> : null}
            <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => {
              const c = doc.columns.find((col) => col.id === selected.columnId);
              const others = doc.stamps.filter((s) => s.instanceId !== selected.instanceId && !s.excluded && s.columnId === selected.columnId);
              if (c) move(selected.instanceId, c.id, Math.min(c.topY, ...others.map((s) => s.topY - s.heightMm - doc.gapMm)));
            }}>Llevar al final</Button><Button size="sm" variant="outline" disabled={checking} onClick={() => void openCheck()}>Chequear / editar vector</Button></div>
            {record?.observation?.stamps.some((s) => s.instanceId === selected.instanceId) ? <Button size="sm" variant="outline" onClick={() => {
              const actual = record.observation!.stamps.find((s) => s.instanceId === selected.instanceId)!;
              try { edit(adoptObservedStamp(doc, actual)); }
              catch (error) { toast({ title: 'No se pudo adoptar la posición', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
            }}>Tomar medidas y posición de Aspire</Button> : null}
            {issues.some((i) => i.instanceId === selected.instanceId && i.code === 'SOURCE_CHANGED') ? <Button size="sm" variant="outline" onClick={() => {
              const source = program.stamps.find((s) => s.id === selected.selloId);
              if (source) changeStamp(selected.instanceId, { sourceUrl: source.vectorPreviewUrl ?? '', sourceWidthMm: source.widthMm, sourceHeightMm: source.heightMm, vectorSvg: undefined, vectorAlreadyMachined: false });
            }}>Revisar con el vector fuente actualizado</Button> : null}
          </fieldset> : null}
          <details className="rounded border p-2 text-xs"><summary className="cursor-pointer font-medium">Soporte y material</summary>
            <fieldset disabled={readOnly || saving} className="mt-2 space-y-3">
              <NumberField label="Separación de corte (mm)" value={doc.gapMm} onChange={(gapMm) => edit({ ...doc, gapMm, supportVerified: false })} />
              {doc.columns.map((c) => <div key={c.id} className="space-y-1 border-t pt-2"><label className="flex gap-2"><input type="checkbox" checked={c.available} onChange={(e) => edit({ ...doc, columns: doc.columns.map((col) => col.id === c.id ? { ...col, available: e.target.checked } : col) })} />Planchuela {c.nominalMm} mm disponible</label>
                <div className="grid grid-cols-2 gap-2">{(['centerX', 'usableMm', 'topY', 'bottomY', 'toolEnvelopeMm'] as const).map((key) => <NumberField key={key} label={{ centerX: 'Centro X', usableMm: 'Ancho útil', topY: 'Inicio Y', bottomY: 'Final Y', toolEnvelopeMm: 'Envolvente de herramienta' }[key] + ' (mm)'} value={c[key]} onChange={(value) => edit({ ...doc, supportVerified: false, columns: doc.columns.map((col) => col.id === c.id ? { ...col, [key]: value } : col) })} />)}</div>
              </div>)}
              <label className="flex items-start gap-2"><input type="checkbox" checked={doc.supportVerified} onChange={(e) => edit({ ...doc, supportVerified: e.target.checked })} />Verifiqué posiciones, áreas útiles y envolventes contra el soporte físico.</label>
            </fieldset>
          </details>
          <details className="rounded border p-2 text-xs"><summary className="cursor-pointer font-medium">Plantillas por mecanizado</summary><fieldset disabled={readOnly || saving} className="mt-2 space-y-3">{(['CLASICO', '3MM', 'ALIMENTO'] as const).map((recipe) => <div key={recipe} className="space-y-1">
            <strong>{recipe}</strong><p className="text-muted-foreground">{doc.recipes[recipe].templates.join(', ')}</p>
            <label className="block">Subir plantillas de Aspire<input type="file" accept=".ToolpathTemplate" multiple className="mt-1 block w-full text-xs" onChange={async (e) => {
              const files = Array.from(e.target.files ?? []); e.target.value = ''; if (!files.length) return;
              setSaving(true);
              try { const uploaded = await storage.upload(program.id, recipe, files); const next = { ...doc, recipes: { ...doc.recipes, [recipe]: { ...doc.recipes[recipe], templates: files.map((f) => f.name), templatePaths: uploaded, verified: false } } }; setSaving(false); edit(next); }
              catch (error) { setSaving(false); toast({ title: 'No se pudieron subir las plantillas', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
            }} /></label>
            {(['full', 'internal'] as const).map((kind) => <label key={kind} className="block">{kind === 'full' ? 'Plantilla de repaso habitual · sello completo' : 'Plantilla de repaso interior · detalle puntual (opcional)'}
              <span className="block text-muted-foreground">{doc.recipes[recipe].fineTemplates?.[kind]?.name ?? 'Sin cargar'}</span>
              <input type="file" accept=".ToolpathTemplate" className="mt-1 block w-full text-xs" onChange={async (e) => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setSaving(true);
                try {
                  const [path] = await storage.upload(program.id, recipe, [file], kind === 'full' ? 'fine_full' : 'fine_internal');
                  const next = { ...doc, recipes: { ...doc.recipes, [recipe]: { ...doc.recipes[recipe], verified: false, fineTemplates: { ...doc.recipes[recipe].fineTemplates, [kind]: { name: file.name, path } } } } };
                  setSaving(false); edit(next);
                } catch (error) { setSaving(false); toast({ title: 'No se pudo cargar el repaso', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
              }} /></label>)}
            {recipe === 'ALIMENTO' ? <label className="block">Corte perimetral · Corte Forma de la base C
              <span className="block text-muted-foreground">{doc.recipes.ALIMENTO.perimeterTemplate?.name ?? 'Sin cargar'}</span>
              <input type="file" accept=".ToolpathTemplate" className="mt-1 block w-full text-xs" onChange={async (e) => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setSaving(true);
                try {
                  const [path] = await storage.upload(program.id, recipe, [file], 'food_perimeter');
                  const next = { ...doc, recipes: { ...doc.recipes, ALIMENTO: { ...doc.recipes.ALIMENTO, verified: false, perimeterTemplate: { name: file.name, path } } } };
                  setSaving(false); edit(next);
                } catch (error) { setSaving(false); toast({ title: 'No se pudo cargar el corte perimetral', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
              }} /></label> : null}
            <p className="text-muted-foreground">Las pasadas principales usan sus capas automáticas. El repaso y el perímetro reciben sus dibujos antes de cada recálculo.{recipe === 'ALIMENTO' ? ' Usá las plantillas principales de 3 mm; la app adapta sus capas para Alimento.' : ''}</p>
            <label className="flex gap-2"><input type="checkbox" checked={doc.recipes[recipe].verified} onChange={(e) => edit({ ...doc, recipes: { ...doc.recipes, [recipe]: { ...doc.recipes[recipe], verified: e.target.checked } } })} />Verifiqué herramientas, profundidades y selección de esta receta.</label>
          </div>)}</fieldset></details>
          <section aria-label="Controles de preparación" className="space-y-1 text-xs"><strong>{issues.length ? `${issues.length} observaciones` : 'Controles geométricos de la preparación OK'}</strong>{issues.map((i, index) => <button type="button" key={`${i.code}-${index}`} className="block w-full rounded border border-amber-300 p-2 text-left" onClick={() => i.instanceId && setSelectedId(i.instanceId)}>{i.message}</button>)}<p className="text-muted-foreground">Estos controles no reemplazan el recálculo ni la revisión del resultado de Aspire.</p></section>
          {record?.observation ? <section className="space-y-1 rounded border p-2 text-xs"><strong>{simulation ? 'Resultado simulado' : 'Último informe'} · r{record.observation.revision}</strong><p>{simulation ? 'Compara propiedades y geometría del armado. No calcula trayectorias.' : record.observation.recalculated ? 'Trayectorias recalculadas' : 'Recálculo pendiente o fallido'}</p>{record.observation.issues.map((issue, i) => <p key={i}>{issue.message}</p>)}</section> : null}
        </aside>
      </div> : null}
    </DialogContent></Dialog>
    <FresaCheckDialog open={!!checkId} onOpenChange={(next) => { if (!next) setCheckId(null); }} title={checkStamp?.name ?? ''} svgText={checkSvg}
      target={checkStamp ? { mode: 'fabricacion', longSideMm: Math.max(checkStamp.widthMm, checkStamp.heightMm), stampType: checkStamp.recipe, alimento: checkStamp.recipe === 'ALIMENTO' } : null}
      applyLabel="Usar en esta ejecución" applyHint="Conserva los datos vendidos; el vector corregido queda en esta preparación."
      onApply={(svgText, _fix, opts) => { if (checkStamp) changeStamp(checkStamp.instanceId, { vectorSvg: svgText, vectorAlreadyMachined: checkMachined, widthMm: checkMachined ? opts.fabricationMm.widthMm : Math.min(opts.fabricationMm.widthMm, opts.fabricationMm.heightMm), heightMm: checkMachined ? opts.fabricationMm.heightMm : Math.max(opts.fabricationMm.widthMm, opts.fabricationMm.heightMm), sourceWidthMm: opts.fabricationMm.widthMm, sourceHeightMm: opts.fabricationMm.heightMm }); }} />
  </>;
}
