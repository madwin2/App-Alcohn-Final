import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Info, Loader2, PencilRuler, Wand2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import {
  corregirYSimplificar,
  resultadoManual,
  zonasCorregibles,
  type FresaFixResult,
  type FresaReport,
  type FresaTarget,
} from '@/lib/fresa/chequeoFresa';
import { FresaEditor } from './FresaEditor';
import { useFresaReport } from '@/lib/fresa/useFresaReport';
import type { ZoneSeverity } from '@/lib/fresa/analyze';
import {
  KIND_HELP,
  DEPTH_BAND_FILL,
  SEVERITY_DOT,
  depthBandLabel,
  SEVERITY_LABEL,
  SIZE_SOURCE_LABEL,
  criterioTexto,
  groupDetail,
  groupTitle,
  mm,
  resumenOperaciones,
} from '@/lib/fresa/textos';
import { downloadSvg } from '@/lib/vectorizacion/zipResults';
import { FresaViewer, type FresaViewMode } from './FresaViewer';
import { FresaPassesPanel } from './FresaPassesPanel';
import { reportForPass, type PassView } from '@/lib/fresa/passReport';

/** Cómo se aplica la corrección. */
export interface FresaApplyOptions {
  /**
   * Medida de fabricación del resultado (mm). Es la del dibujo corregido
   * (nunca más grande que la original), o la agrandada si se eligió agrandar.
   */
  fabricationMm: { widthMm: number; heightMm: number };
  /** true = se eligió agrandar el sello (cambia la medida de fabricación). */
  scaledUp: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** SVG a revisar (texto). */
  svgText: string | null;
  /** Medida a la que se fabrica (define el ancho real de cada hueco). */
  target: FresaTarget | null;
  /**
   * Qué hacer con el SVG corregido. Si no se pasa, el diálogo solo permite
   * descargarlo.
   */
  onApply?: (svg: string, fix: FresaFixResult, opts: FresaApplyOptions) => Promise<void> | void;
  /** Texto del botón de aplicar (por defecto "Usar el corregido"). */
  applyLabel?: string;
  /** Aclaración debajo del botón de aplicar. */
  applyHint?: string;
  /** Nombre base para descargar. */
  downloadName?: string;
  /**
   * Corrección automática ya hecha (por ejemplo, al vectorizar): el diálogo
   * abre mostrándola, sin tener que apretar «Corregir».
   */
  initialFix?: FresaFixResult | null;
  /** Si se pasa, aparece «Usar el original» (descarta la corrección). */
  onUseOriginal?: () => void;
}

const DEFAULT_VISIBLE: ZoneSeverity[] = ['alta', 'media'];

function StatusSummary({ report, resolvedByRepaso = false }: { report: FresaReport | null; resolvedByRepaso?: boolean }) {
  if (!report) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Analizando el diseño…
      </div>
    );
  }
  if (report.status === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
        <XCircle className="mt-0.5 size-4 shrink-0" />
        <span>No se pudo analizar: {report.error}</span>
      </div>
    );
  }
  const g = report.groupCounts;
  if (report.status === 'ok') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <span>
          Todo se separa: entre letras y en los ojos la fresa baja al menos {mm(report.profile.minDepthMm, 1)} mm.
          {g.baja ? ` Hay ${g.baja} ángulo${g.baja === 1 ? '' : 's'} o rincón${g.baja === 1 ? '' : 'es'} donde la fresa sube y marca menos hondo (normal).` : ''}
        </span>
      </div>
    );
  }
  const n = g.alta + g.media;
  if (resolvedByRepaso) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span><strong>{n} lugar{n === 1 ? '' : 'es'} que la 0,6 sola no saca</strong> · los resuelve el repaso 0,2</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong>
          {n} lugar{n === 1 ? '' : 'es'} donde se pierde el diseño
        </strong>
        {g.alta ? ` · ${g.alta} para corregir` : ''}
        {g.media ? ` · ${g.media} detalle que se pierde` : ''}
      </span>
    </div>
  );
}

/**
 * Chequeo de fresa de un vector: dónde no llega la fresa más fina, por qué, y
 * corrección automática con comparación antes/después.
 */
export function FresaCheckDialog({
  open,
  onOpenChange,
  title,
  svgText,
  target,
  onApply,
  applyLabel = 'Usar el corregido',
  applyHint,
  downloadName = 'vector',
  initialFix = null,
  onUseOriginal,
}: Props) {
  const { toast } = useToast();
  const report = useFresaReport(open ? svgText : null, open ? target : null);
  const [visible, setVisible] = useState<Set<ZoneSeverity>>(new Set(DEFAULT_VISIBLE));
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [fix, setFix] = useState<FresaFixResult | null>(null);
  const [fixing, setFixing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [mode, setMode] = useState<FresaViewMode>('original');
  /** Editor abierto, y sobre qué versión. */
  const [editing, setEditing] = useState<false | 'original' | 'corregido'>(false);
  const [showDepth, setShowDepth] = useState(true);
  const [passView, setPassView] = useState<PassView>('fine');

  // Al abrir otro diseño, empezar de cero (o de la corrección ya hecha).
  useEffect(() => {
    setFix(open ? initialFix : null);
    // Si solo se simplificó, «Qué cambia» no muestra nada: se abre en «Corregido».
    setMode(
      open && initialFix
        ? initialFix.operations.some((o) => o.kind !== 'simplificar')
          ? 'diferencias'
          : 'corregido'
        : 'original',
    );
    setSelected(null);
    setVisible(new Set(DEFAULT_VISIBLE));
    setEditing(false);
    setPassView('fine');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cambiar de diseño
  }, [svgText, open]);

  // Con repaso, lo útil es ver qué deja la 0,6 y qué saca la 0,2: se abre ahí.
  useEffect(() => {
    const p = report?.passes;
    if (p?.primary && p.outcome !== 'sin_repaso' && p.outcome !== 'sin_receta') setPassView('primary');
  }, [report?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSource = mode !== 'original' && fix ? fix.after : report;
  const passes = activeSource?.passes;
  /** Zonas de la 0,6 que saca el repaso (se tocan con un lugar de repaso y la 0,2 no falla ahí). */
  const resolvedZones = useMemo(() => {
    const out = new Set<string>();
    if (!passes?.primary) return out;
    const overlap = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: typeof a, pad = 0.05) =>
      a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
    const fineBad = passes.fine.zones.filter((z) => z.severity !== 'baja');
    for (const z of passes.primary.zones) {
      if (passes.repaso.zones.some((r) => overlap(z.bounds, r.bounds)) && !fineBad.some((f) => overlap(z.bounds, f.bounds, 0))) out.add(z.id);
    }
    return out;
  }, [passes]);
  const allResolved = passView === 'primary' && !!passes && (passes.outcome === 'repaso_sugerido');
  const active = useMemo(() => activeSource ? reportForPass(activeSource, passView) : null, [activeSource, passView]);
  const groups = useMemo(
    () => (active?.check?.groups ?? []).filter((g) => visible.has(g.severity)),
    [active, visible],
  );
  const allGroups = active?.check?.groups ?? [];
  const lowCount = allGroups.filter((g) => g.severity === 'baja').length;
  const fixableZoneIds = useMemo(() => (report ? zonasCorregibles(report) : []), [report]);
  const selectedGroup = allGroups.find((g) => g.id === selected) ?? null;

  const select = (id: string | null) => {
    setSelected(id);
    if (id) setFocusNonce((n) => n + 1);
  };

  /** Termina la edición manual: el resultado queda como una corrección más. */
  const finishEdit = async (edited: string, cambios: number) => {
    if (!report) return;
    setEditing(false);
    setFixing(true);
    try {
      const res = await resultadoManual(edited, report, cambios);
      setFix(res);
      setMode('corregido');
      setSelected(null);
    } finally {
      setFixing(false);
    }
  };

  const runFix = async () => {
    if (!report || !svgText) return;
    setFixing(true);
    try {
      const res = await corregirYSimplificar(svgText, report, fixableZoneIds);
      if (!res) {
        toast({ title: 'No hay nada para corregir ni simplificar sin cambiar el diseño.' });
        return;
      }
      setFix(res);
      setMode('diferencias');
      setSelected(null);
    } catch (error) {
      toast({
        title: 'No se pudo corregir',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setFixing(false);
    }
  };

  const apply = async (scaledUp = false) => {
    if (!fix || !onApply) return;
    const fabricationMm = scaledUp && fix.scaleUp
      ? { widthMm: fix.scaleUp.widthMm, heightMm: fix.scaleUp.heightMm }
      : fix.fabricationMm;
    setApplying(true);
    try {
      await onApply(fix.svg, fix, { fabricationMm, scaledUp });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'No se pudo aplicar la corrección',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const remaining = fix ? fix.after.groupCounts.alta + fix.after.groupCounts.media : 0;
  const before = report ? report.groupCounts.alta + report.groupCounts.media : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => editing && e.preventDefault()}
        className="flex h-[92vh] w-[min(1280px,97vw)] max-w-none flex-col gap-3 overflow-y-auto p-4 sm:max-w-none md:overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1 pr-8">
          <DialogTitle className="text-base">Chequeo de fresa — {title}</DialogTitle>
          {report && report.status !== 'error' ? (
            <p className="text-xs text-muted-foreground">
              {criterioTexto(report)} · analizado a {mm(report.widthMm, 1)} × {mm(report.heightMm, 1)} mm (
              {SIZE_SOURCE_LABEL[report.sizeSource]})
            </p>
          ) : null}
        </DialogHeader>

        {editing && svgText && report && report.status !== 'error' ? (
          <FresaEditor
            svgText={editing === 'corregido' && fix ? fix.svg : svgText}
            report={report}
            onDone={(edited, cambios) => void finishEdit(edited, cambios)}
            onCancel={() => setEditing(false)}
          />
        ) : (
        <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:flex-row">
          <div className="flex h-[55vh] min-w-0 flex-col gap-2 md:h-auto md:min-h-[300px] md:flex-1">
            {activeSource && activeSource.status !== 'error' ? <FresaPassesPanel report={activeSource} view={passView} onView={(view) => { setPassView(view); setSelected(null); }} /> : null}
            {fix ? (
              <div className="flex shrink-0 items-center gap-1 self-start rounded-md border bg-muted/40 p-0.5 text-xs">
                {(
                  [
                    ['original', 'Original'],
                    ['corregido', 'Corregido'],
                    ['diferencias', 'Qué cambia'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      'rounded px-2.5 py-1 transition-colors',
                      mode === m ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => {
                      setMode(m);
                      setSelected(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
                {mode === 'diferencias' ? (
                  <span className="px-2 text-muted-foreground">
                    <span className="mr-1 inline-block size-2.5 rounded-sm bg-cyan-400 align-middle" />
                    negro que se saca
                  </span>
                ) : null}
              </div>
            ) : null}
            {svgText && report && report.status !== 'error' && active ? (
              <FresaViewer
                svgText={svgText}
                report={active}
                correctedSvg={fix?.svg ?? null}
                fitKey={report.key}
                mode={mode}
                visibleSeverities={visible}
                showDepth={showDepth}
                selectedGroupId={selected}
                hoveredGroupId={hovered}
                onSelectGroup={select}
                focusNonce={focusNonce}
                className="flex-1"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
                {report?.status === 'error' ? 'Sin vista: el archivo no se pudo leer.' : 'Analizando…'}
              </div>
            )}
            <p className="shrink-0 text-[11px] text-muted-foreground">
              Rueda del mouse para acercar · arrastrá para mover · clic en un número para ver el detalle
            </p>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-3 md:w-[340px] md:overflow-y-auto md:pr-1">
            <StatusSummary report={active ?? null} resolvedByRepaso={allResolved} />

            {active?.warnings.length ? (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {active.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            {active?.check?.depthBands?.length ? (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-muted-foreground" title="Pinta en azul dónde la fresa talla menos hondo que la mínima (más oscuro = menos hondo)">
                  <Checkbox checked={showDepth} onCheckedChange={(v) => setShowDepth(v === true)} />
                  Profundidad (menos de {mm(active.profile.minDepthMm, 1)} mm)
                </label>
                {showDepth ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[10px] text-muted-foreground">
                    {active.check.depthBands.map((b, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block size-2.5 rounded-sm"
                          style={{ background: DEPTH_BAND_FILL[i] ?? DEPTH_BAND_FILL[DEPTH_BAND_FILL.length - 1] }}
                        />
                        {depthBandLabel(b.fromMm, b.toMm)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {lowCount ? (
              <label
                className="flex items-center gap-2 text-xs text-muted-foreground"
                title="Lugares donde la fresa sube y los marca menos hondo. Están bien así: la corrección no los toca."
              >
                <Checkbox
                  checked={visible.has('baja')}
                  onCheckedChange={(v) => {
                    setVisible((prev) => {
                      const next = new Set(prev);
                      if (v) next.add('baja');
                      else next.delete('baja');
                      return next;
                    });
                  }}
                />
                Mostrar ángulos y rincones ({lowCount}, están bien así)
              </label>
            ) : null}

            <div className="max-h-[40vh] min-h-[132px] overflow-y-auto rounded-md border md:max-h-none md:flex-1">
              {groups.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  {active ? 'Nada para revisar con este filtro.' : '…'}
                </p>
              ) : (
                <ol className="divide-y">
                  {groups.map((g) => {
                    const idx = allGroups.indexOf(g);
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                            selected === g.id && 'bg-muted',
                          )}
                          onClick={() => select(g.id)}
                          onMouseEnter={() => setHovered(g.id)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                              SEVERITY_DOT[g.severity],
                            )}
                          >
                            {idx + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium">
                              {groupTitle(g)}
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {SEVERITY_LABEL[g.severity]}
                                {g.zoneIds.length > 1 ? ` · ${g.zoneIds.length} zonas` : ''}
                              </span>
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {groupDetail(g, active?.profile.minDepthMm ?? 0.4)}
                            </span>
                            {passView === 'primary' && passes?.repaso.zones.length && g.severity !== 'baja' ? (
                              g.zoneIds.every((id) => resolvedZones.has(id))
                                ? <span className="block text-xs text-teal-600 dark:text-teal-300">La saca el repaso 0,2</span>
                                : <span className="block text-xs text-rose-600 dark:text-rose-300">El repaso 0,2 no la resuelve</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {selectedGroup ? (
              <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                {selectedGroup.kinds.map((k) => KIND_HELP[k]).join(' ')}
              </p>
            ) : null}

            {report && report.status !== 'error' ? (
              <div className="shrink-0 space-y-1">
                {fix ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditing('corregido')} title="Editar a mano partiendo de la corrección: mover, escalar, afinar, nodos. La fresa se re-chequea con cada cambio.">
                      <PencilRuler className="mr-1.5 size-4" />
                      Editar el corregido
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditing('original')} title="Editar a mano partiendo del vector original, sin la corrección automática.">
                      Editar el original
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setEditing('original')} title="Mover, escalar, afinar o engordar letras, editar nodos y simplificar. La fresa se re-chequea con cada cambio.">
                    <PencilRuler className="mr-1.5 size-4" />
                    Editar a mano
                  </Button>
                )}
              </div>
            ) : null}
            <div className="shrink-0 space-y-2 border-t pt-3">
              {!fix ? (
                <>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!report || report.status === 'error' || fixing}
                    onClick={() => void runFix()}
                  >
                    {fixing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
                    {fixing ? 'Corrigiendo…' : report?.status === 'ok' ? 'Simplificar nodos' : 'Corregir automáticamente'}
                  </Button>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Separa las letras que están muy juntas moviéndolas enteras (respeta la alineación), y agranda en
                    paralelo los ojos y ranuras chicas sin dejar trazos de menos de 0,4 mm. Los ángulos en punta no
                    se tocan. Después saca los nodos de más sin cambiar el diseño. Lo que no se puede resolver así
                    queda para editar a mano. Antes de usarlo vas a poder comparar.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs">
                    {before === 0 ? null : remaining === 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-300">
                        Listo: se resolvieron los {before} lugares.
                      </span>
                    ) : (
                      <span>
                        Se resolvieron {Math.max(0, before - remaining)} de {before} lugares.{' '}
                        <strong>
                          Queda{remaining === 1 ? '' : 'n'} {remaining} para editar a mano
                        </strong>{' '}
                        (se ven en «Corregido»).
                      </span>
                    )}{' '}
                    <span className="text-muted-foreground">{resumenOperaciones(fix.operations)}</span>
                    {fix.fitScale < 0.999 ? (
                      <span className="block text-muted-foreground">
                        Para no cambiar la medida, todo el diseño se achicó {mm((1 - fix.fitScale) * 100, 1)} % dentro
                        de la misma caja ({mm(fix.fabricationMm.widthMm, 1)} × {mm(fix.fabricationMm.heightMm, 1)} mm).
                      </span>
                    ) : null}
                  </p>
                  {fix.scaleUp && remaining > 0 ? (
                    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      <p>
                        <strong>Último recurso:</strong> agrandar el sello un {mm((fix.scaleUp.factor - 1) * 100, 0)} % (
                        {mm(fix.fabricationMm.widthMm, 1)} × {mm(fix.fabricationMm.heightMm, 1)} →{' '}
                        {mm(fix.scaleUp.widthMm, 1)} × {mm(fix.scaleUp.heightMm, 1)} mm) resuelve lo que queda. Cambia
                        la medida de fabricación: usalo solo si es imprescindible.
                      </p>
                      {onApply ? (
                        <Button type="button" size="sm" variant="outline" disabled={applying} onClick={() => void apply(true)}>
                          Agrandar a {mm(fix.scaleUp.widthMm, 1)} × {mm(fix.scaleUp.heightMm, 1)} mm y usar
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {onApply && fix.operations.length ? (
                      <Button type="button" disabled={applying} onClick={() => void apply()}>
                        {applying ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {applyLabel}
                      </Button>
                    ) : null}
                    {onUseOriginal ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onUseOriginal();
                          onOpenChange(false);
                        }}
                      >
                        Usar el original
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={() => downloadSvg(fix.svg, `${downloadName}-corregido`)}>
                      <Download className="mr-1.5 size-4" />
                      Descargar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFix(null);
                        setMode('original');
                        setSelected(null);
                      }}
                    >
                      Descartar
                    </Button>
                  </div>
                  {applyHint && onApply ? <p className="text-[11px] text-muted-foreground">{applyHint}</p> : null}
                </>
              )}
            </div>
          </aside>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
