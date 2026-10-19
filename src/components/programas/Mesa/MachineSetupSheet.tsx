import { useMemo, useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { PreparationDocument, PreparationMachine } from '@/lib/programas/preparation';
import { MESA_GAP_MM } from '@/lib/programas/mesa';
import { buildFixture } from '@/lib/programas/fixture';
import { cn } from '@/lib/utils/cn';
import { Dot, FOCUS, Label } from './mesaUi';

export type MachineSetup = Pick<PreparationDocument, 'columns' | 'gapMm' | 'supportVerified' | 'recipes'>;
const RECIPE_LABEL = { CLASICO: 'Clásico', '3MM': '3 mm', ALIMENTO: 'Alimento' } as const;
const FIELD_LABEL = { centerX: 'Centro X', usableMm: 'Ancho útil', bottomY: 'Final Y' } as const;

function Field({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-zinc-400">{label}
      <input type="number" step="0.1" value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        className="h-8 rounded-full bg-white/[0.06] px-3 text-[13px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-white/50" />
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn(FOCUS, 'flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.04]')}>
      <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border text-[11px]', checked ? 'border-white bg-white text-zinc-950' : 'border-white/30')}>{checked ? '✓' : ''}</span>
      <span className={checked ? 'text-foreground' : 'text-zinc-300'}>{children}</span>
    </button>
  );
}

/** Vista chica de la fijación con las planchuelas y su ancho útil (se actualiza al editar). */
function FixturePreview({ machine, columns }: { machine: PreparationMachine; columns: MachineSetup['columns'] }) {
  const f = useMemo(() => buildFixture(machine, columns), [machine, columns]);
  const k = 210 / f.heightMm;
  return (
    <svg viewBox={`-4 -12 ${f.widthMm + 8} ${f.heightMm + 16}`} className="mx-auto block" style={{ width: (f.widthMm + 8) * k, height: (f.heightMm + 16) * k }} aria-label="Vista de la fijación">
      <rect x={0} y={0} width={f.widthMm} height={f.heightMm} rx={2} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      {f.bars.map((b) => {
        const col = columns.find((c) => c.id === b.columnId);
        return (
          <g key={b.columnId}>
            <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.8)" strokeWidth={0.8} />
            <text x={(b.x0 + b.x1) / 2} y={-3} textAnchor="middle" fontSize={9} fill="white">{b.nominalMm}</text>
            {col ? <line x1={(b.x0 + b.x1) / 2} x2={(b.x0 + b.x1) / 2} y1={b.y0} y2={b.y1} stroke="rgba(125,211,252,0.5)" strokeWidth={0.6} strokeDasharray="3 3" /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Lo que es de la máquina y no de cada programa: soporte, separación y
 * plantillas de Aspire. Se carga una vez; cambiar algo pide verificar de nuevo.
 */
export function MachineSetupSheet({ open, onOpenChange, machine, machineLabel, setup, onChange, onUploadAll }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  machine: PreparationMachine;
  machineLabel: string;
  setup: MachineSetup;
  onChange: (s: MachineSetup) => void;
  /** Subir todas las plantillas nativas juntas; la app ubica cada una (en el prototipo no está disponible). */
  onUploadAll?: (files: File[]) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const recipes = (['CLASICO', '3MM', 'ALIMENTO'] as const).map((id) => [id, setup.recipes[id]] as const);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-[440px] overflow-y-auto border-white/10 bg-zinc-950 sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Máquina {machineLabel}</SheetTitle>
          <SheetDescription>Se configura una vez y la usan todos los programas de esta máquina.</SheetDescription>
        </SheetHeader>

        <section className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-[15px] font-medium">Soporte</h3>
            <span className="flex items-center gap-1.5 text-[12px] text-zinc-400"><Dot tone={setup.supportVerified ? 'ok' : 'warning'} />{setup.supportVerified ? 'verificado' : 'sin verificar'}</span>
          </div>
          <div className="rounded-2xl bg-black/40 p-3"><FixturePreview machine={machine} columns={setup.columns} /></div>
          <p className="text-[12px] text-zinc-400">Separación fija entre diseños: {MESA_GAP_MM} mm. La mesa mantiene esta distancia al cambiar medidas u orden.</p>
          {setup.supportVerified ? <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] text-zinc-300">Cambiar un valor quita la verificación hasta que vuelvas a comprobarlo contra el soporte físico.</p> : null}
          {setup.columns.map((c) => (
            <div key={c.id} className="space-y-2 rounded-2xl bg-white/[0.035] p-3">
              <Label className="text-foreground">Planchuela {c.nominalMm} mm</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['centerX', 'usableMm', 'bottomY'] as const).map((k) => (
                  <Field key={k} label={FIELD_LABEL[k]} value={c[k]}
                    onChange={(n) => onChange({ ...setup, supportVerified: false, columns: setup.columns.map((x) => x.id === c.id ? { ...x, [k]: n } : x) })} />
                ))}
              </div>
            </div>
          ))}
          <Check checked={setup.supportVerified} onChange={(v) => onChange({ ...setup, supportVerified: v })}>Verifiqué posiciones y anchos útiles contra el soporte físico.</Check>
        </section>

        <section className="mt-8 space-y-3">
          <h3 className="text-[15px] font-medium">Plantillas de Aspire</h3>
          {onUploadAll ? (
            <div className="space-y-2 rounded-2xl bg-white/[0.035] p-3">
              <p className="text-[12px] text-zinc-300">Elegí <b className="font-medium text-foreground">todas juntas</b> (una trayectoria por archivo, con su nombre de Aspire: «0 Taladrado», «4 Perfilado 0.1MM»…). La app pone cada una en su receta, en el repaso o en el Corte Forma.</p>
              <input type="file" accept=".ToolpathTemplate" multiple disabled={uploading} aria-label="Subir todas las plantillas de Aspire"
                className="block w-full text-[12px] text-zinc-400 file:mr-3 file:rounded-full file:border-0 file:bg-white/[0.12] file:px-3 file:py-1 file:text-foreground disabled:opacity-50"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []); e.target.value = '';
                  if (!files.length) return;
                  setUploading(true);
                  void onUploadAll(files).finally(() => setUploading(false));
                }} />
              {uploading ? <p className="text-[12px] text-zinc-400">Subiendo y revisando…</p> : null}
            </div>
          ) : <p className="text-[12px] text-zinc-500">En el prototipo las plantillas son de ejemplo.</p>}
          {recipes.map(([id, r]) => {
            const complete = !!r.templatePaths?.length && (id !== 'ALIMENTO' || !!r.perimeterTemplate);
            return (
              <div key={id} className="space-y-2 rounded-2xl bg-white/[0.035] p-3">
                <div className="flex items-center gap-2">
                  <Dot tone={complete && r.verified ? 'ok' : 'warning'} />
                  <span className="text-[13px] font-medium">{RECIPE_LABEL[id]}</span>
                  <span className="ml-auto text-[12px] text-zinc-400">{r.templatePaths?.length ?? 0} trayectorias{r.fineTemplates?.full ? ' · repaso' : ''}{r.perimeterTemplate ? ' · corte forma' : ''}</span>
                </div>
                {r.templatePaths?.length || r.fineTemplates?.full || r.fineTemplates?.internal || r.perimeterTemplate ? (
                  <ul className="space-y-0.5 text-[12px] text-zinc-400">
                    {(r.templatePaths?.length ? r.templates : []).map((name) => <li key={name}>{name.replace(/\.ToolpathTemplate$/i, '')}</li>)}
                    {r.fineTemplates?.full ? <li><span className="text-zinc-500">Repaso:</span> {r.fineTemplates.full.name.replace(/\.ToolpathTemplate$/i, '')}</li> : <li className="text-amber-300">Falta el repaso (4 Perfilado 0.1MM)</li>}
                    {r.fineTemplates?.internal ? <li><span className="text-zinc-500">Repaso interior:</span> {r.fineTemplates.internal.name.replace(/\.ToolpathTemplate$/i, '')}</li> : null}
                    {id === 'ALIMENTO' ? (r.perimeterTemplate ? <li><span className="text-zinc-500">Corte forma:</span> {r.perimeterTemplate.name.replace(/\.ToolpathTemplate$/i, '')}</li> : <li className="text-amber-300">Falta el Corte Forma</li>) : null}
                  </ul>
                ) : <p className="text-[12px] text-zinc-500">Sin plantillas.</p>}
                <Check checked={r.verified} onChange={(v) => onChange({ ...setup, recipes: { ...setup.recipes, [id]: { ...r, verified: v } } })}>Verifiqué herramientas, profundidades y selección.</Check>
              </div>
            );
          })}
        </section>
      </SheetContent>
    </Sheet>
  );
}
