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
import type { EditorLogEntry, FixOperation } from '@/lib/fresa/fix';
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
import { resumenDiferencias } from '@/lib/vectorizacion/comparacionOriginal';
import { useComparacionOriginal, type OriginalSource } from '@/lib/vectorizacion/originalOverlay';
import { FresaViewer, type FresaViewMode } from './FresaViewer';
import { FresaPassesPanel } from './FresaPassesPanel';
import { reportForPass, type PassView } from '@/lib/fresa/passReport';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';

/** Cómo se aplica la corrección. */
export interface FresaApplyOptions {
  /**
   * Medida de fabricación del resultado (mm). Es la del dibujo corregido
   * (nunca más grande que la original), o la agrandada si se eligió agrandar.
   */
  fabricationMm: { widthMm: number; heightMm: number };
  /** true = se eligió agrandar el sello (cambia la medida de fabricación). */
  scaledUp: boolean;
  /**
   * true = la medida se cambió a mano en el editor (agrandar, achicar o girar
   * el diseño): `fabricationMm` es la medida elegida y hay que respetarla.
   */
  customSize: boolean;
}

/** Las versiones que se pueden elegir: cada una por separado, ninguna pisa a otra. */
export type FresaVersion = 'original' | 'auto' | 'manual';

const VERSION_LABEL: Record<FresaVersion, string> = {
  original: 'Original',
  auto: 'Automático',
  manual: 'Editado a mano',
};

const VERSION_USE: Record<FresaVersion, string> = {
  original: 'Usar el original',
  auto: 'Usar el automático',
  manual: 'Usar el editado a mano',
};

const EDIT_LABEL: Record<FresaVersion, string> = {
  original: 'Editar el original',
  auto: 'Editar el automático',
  manual: 'Seguir editando a mano',
};

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
  /** Texto del botón de aplicar (por defecto, «Usar el automático» / «Usar el editado a mano»). */
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
  /** Abrir directo en el editor del vector (por ejemplo, desde «Editar vector»). */
  startEditing?: boolean;
  /**
   * Imagen que se vectorizó: se compara con el vector (avisa si falta algo,
   * como el punto de una i) y el editor la puede mostrar debajo.
   */
  original?: OriginalSource | null;
  /**
   * Edición a mano hecha antes (por ejemplo, la que quedó en Revisión): aparece
   * como «Editado a mano» para verla, seguir editándola o volver a elegirla.
   */
  initialManual?: { svg: string; ops?: FixOperation[] } | null;
  /** Qué versión está elegida ahora para guardar (se marca en las pestañas). */
  chosen?: FresaVersion | null;
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

/** Si al vector le falta algo de la imagen original (o tiene algo de más). */
function OriginalAviso({
  svg,
  original,
  mmPerUnit,
  onOpen,
}: {
  svg: string | null;
  original: OriginalSource;
  mmPerUnit: number;
  onOpen: () => void;
}) {
  const cmp = useComparacionOriginal(svg, original, mmPerUnit);
  if (!cmp || cmp.status !== 'diferencias') return null;
  return (
    <div className="flex shrink-0 items-start gap-2 rounded-md border border-fuchsia-300 bg-fuchsia-50 p-2 text-xs text-fuchsia-950 dark:bg-fuchsia-950/40 dark:text-fuchsia-100">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>Comparado con el original:</strong> {resumenDiferencias(cmp.diferencias).toLowerCase()}. Revisalo con el
        original debajo.
      </span>
      <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={onOpen}>
        Ver
      </Button>
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
  applyLabel,
  applyHint,
  downloadName = 'vector',
  initialFix = null,
  onUseOriginal,
  startEditing = false,
  original = null,
  initialManual = null,
  chosen = null,
}: Props) {
  const { toast } = useToast();
  const report = useFresaReport(open ? svgText : null, open ? target : null);
  const [visible, setVisible] = useState<Set<ZoneSeverity>>(new Set(DEFAULT_VISIBLE));
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  /** Corrección automática y edición a mano: cada una en su lugar. */
  const [autoFix, setAutoFix] = useState<FresaFixResult | null>(null);
  const [manualFix, setManualFix] = useState<FresaFixResult | null>(null);
  /** Medida de la versión de la que partió la edición a mano (para saber si se cambió la medida). */
  const [manualBaseMm, setManualBaseMm] = useState<{ widthMm: number; heightMm: number } | null>(null);
  /** La versión que se ve (y la que se usa o se edita con los botones). */
  const [version, setVersion] = useState<FresaVersion>('original');
  /** Ver «Qué cambia» respecto del original. */
  const [diff, setDiff] = useState(false);
  /** Hay una edición a mano terminada que todavía no se eligió. */
  const [manualPending, setManualPending] = useState(false);
  const [closeGuard, setCloseGuard] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [applying, setApplying] = useState(false);
  /** Editor abierto, y sobre qué versión. */
  const [editing, setEditing] = useState<false | FresaVersion>(false);
  const [showDepth, setShowDepth] = useState(true);
  const [passView, setPassView] = useState<PassView>('fine');

  const fix = version === 'auto' ? autoFix : version === 'manual' ? manualFix : null;
  const mode: FresaViewMode = !fix ? 'original' : diff ? 'diferencias' : 'corregido';

  // Al abrir otro diseño, empezar de cero (o de las versiones ya hechas).
  useEffect(() => {
    setAutoFix(open ? initialFix : null);
    setManualFix(null);
    setManualBaseMm(null);
    setManualPending(false);
    const start: FresaVersion =
      chosen === 'manual' && initialManual ? 'manual' : chosen === 'original' || !initialFix ? 'original' : 'auto';
    setVersion(open ? start : 'original');
    // Si solo se simplificó, «Qué cambia» no muestra nada.
    setDiff(start === 'auto' && !!initialFix?.operations.some((o) => o.kind !== 'simplificar'));
    setSelected(null);
    setVisible(new Set(DEFAULT_VISIBLE));
    setEditing(open && startEditing ? start : false);
    setPassView('fine');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cambiar de diseño
  }, [svgText, open]);

  // La edición a mano anterior se vuelve a chequear contra el original.
  useEffect(() => {
    if (!open || !initialManual || !report || report.status === 'error') return;
    let alive = true;
    void resultadoManual(initialManual.svg, report, 0).then((r) => {
      if (alive) setManualFix((prev) => prev ?? { ...r, operations: initialManual.ops ?? r.operations });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- por contenido: el padre arma el objeto en cada render
  }, [open, initialManual?.svg, report]);

  /** Lo que se edita: siempre la versión que se está viendo. */
  const editSvg =
    editing === 'manual' ? (manualFix?.svg ?? initialManual?.svg ?? null) : editing === 'auto' ? (autoFix?.svg ?? null) : svgText;

  const show = (v: FresaVersion) => {
    setVersion(v);
    setDiff(false);
    setSelected(null);
  };

  // Con repaso, lo útil es ver qué deja la 0,6 y qué saca la 0,2: se abre ahí.
  useEffect(() => {
    const p = report?.passes;
    if (p?.primary && p.outcome !== 'sin_repaso' && p.outcome !== 'sin_receta') setPassView('primary');
  }, [report?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSource = fix ? fix.after : report;
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

  /** Termina la edición manual: queda como «Editado a mano» (reemplaza la anterior). */
  const finishEdit = async (edited: string, cambios: number, extra: { registro: EditorLogEntry[]; segundos: number }) => {
    if (!report) return;
    const from = editing;
    setEditing(false);
    setFixing(true);
    try {
      const res = await resultadoManual(edited, report, cambios, undefined, extra);
      // Lo que ya tenía la versión de partida queda en el registro.
      const base = from === 'auto' ? autoFix : from === 'manual' ? manualFix : null;
      setManualFix(base ? { ...res, operations: [...base.operations, ...res.operations] } : res);
      if (from !== 'manual' || !manualBaseMm) {
        setManualBaseMm(
          from === 'auto' && autoFix
            ? { widthMm: autoFix.after.widthMm, heightMm: autoFix.after.heightMm }
            : { widthMm: report.widthMm, heightMm: report.heightMm },
        );
      }
      setVersion('manual');
      setDiff(false);
      setManualPending(true);
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
      setAutoFix(res);
      setVersion('auto');
      setDiff(true);
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

  const apply = async (v: 'auto' | 'manual', scaledUp = false) => {
    const chosenFix = v === 'auto' ? autoFix : manualFix;
    if (!chosenFix || !onApply) return;
    const fabricationMm = scaledUp && chosenFix.scaleUp
      ? { widthMm: chosenFix.scaleUp.widthMm, heightMm: chosenFix.scaleUp.heightMm }
      : chosenFix.fabricationMm;
    const customSize = v === 'manual' && manualSizeChanged;
    setApplying(true);
    try {
      await onApply(chosenFix.svg, chosenFix, { fabricationMm, scaledUp, customSize });
      setManualPending(false);
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

  const chooseOriginal = () => {
    onUseOriginal?.();
    setManualPending(false);
    onOpenChange(false);
  };

  /** Cerrar con una edición a mano sin elegir: se pregunta (si no, se perdía). */
  const requestOpenChange = (next: boolean) => {
    if (!next && manualPending && manualFix && onApply && !editing) {
      setCloseGuard(true);
      return;
    }
    onOpenChange(next);
  };

  /** Sacar una versión (vuelve a mostrar el original). */
  const discard = (v: 'auto' | 'manual') => {
    if (v === 'auto') setAutoFix(null);
    else {
      setManualFix(null);
      setManualPending(false);
    }
    show('original');
  };

  /** La edición a mano cambió la medida (agrandar, achicar o girar el diseño entero). */
  const manualBase = manualBaseMm ?? (report ? { widthMm: report.widthMm, heightMm: report.heightMm } : null);
  const manualSizeChanged =
    !!manualFix &&
    !!manualBase &&
    (Math.abs(manualFix.after.widthMm - manualBase.widthMm) > 0.05 ||
      Math.abs(manualFix.after.heightMm - manualBase.heightMm) > 0.05);

  const versions: FresaVersion[] = [
    'original',
    ...(autoFix ? (['auto'] as const) : []),
    ...(manualFix ? (['manual'] as const) : []),
  ];
  const canUse = version === 'original' ? !!onUseOriginal : !!onApply && !!fix;

  const remaining = fix ? fix.after.groupCounts.alta + fix.after.groupCounts.media : 0;
  const before = report ? report.groupCounts.alta + report.groupCounts.media : 0;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
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

        {editing && editSvg && report && report.status !== 'error' ? (
          <FresaEditor
            svgText={editSvg}
            report={report}
            onDone={(edited, cambios, extra) => void finishEdit(edited, cambios, extra)}
            onCancel={() => setEditing(false)}
            original={original}
          />
        ) : (
        <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:flex-row">
          <div className="flex h-[55vh] min-w-0 flex-col gap-2 md:h-auto md:min-h-[300px] md:flex-1">
            {activeSource && activeSource.status !== 'error' ? <FresaPassesPanel report={activeSource} view={passView} onView={(view) => { setPassView(view); setSelected(null); }} /> : null}
            {versions.length > 1 ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Versión que se ve">
                  {versions.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={version === v}
                      className={cn(
                        'rounded px-2.5 py-1 transition-colors',
                        version === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => show(v)}
                      title={chosen === v ? 'Es la versión elegida ahora para guardar' : undefined}
                    >
                      {VERSION_LABEL[v]}
                      {chosen === v ? <CheckCircle2 className="ml-1 inline size-3 text-emerald-600 dark:text-emerald-400" /> : null}
                      {v === 'manual' && manualPending ? <span className="ml-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle" /> : null}
                    </button>
                  ))}
                </div>
                {fix ? (
                  <label className="flex items-center gap-1.5 text-muted-foreground">
                    <Checkbox checked={diff} onCheckedChange={(v) => { setDiff(v === true); setSelected(null); }} />
                    Qué cambia
                    {diff ? (
                      <span className="ml-1">
                        <span className="mr-1 inline-block size-2.5 rounded-sm bg-cyan-400 align-middle" />
                        negro que se saca
                      </span>
                    ) : null}
                  </label>
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
              Rueda del mouse para acercar · arrastrá para mover · pasá o tocá una marca para ver el hueco
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

            {report && report.status !== 'error' && original ? (
              <OriginalAviso
                svg={fix ? fix.svg : svgText}
                original={original}
                mmPerUnit={(fix ? fix.after : report).mmPerUnit}
                onOpen={() => setEditing(version)}
              />
            ) : null}

            {report && report.status !== 'error' ? (
              <div className="shrink-0 space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setEditing(version)}
                  title={
                    manualFix && version !== 'manual'
                      ? `Editar a mano partiendo de «${VERSION_LABEL[version]}». Reemplaza la edición a mano anterior.`
                      : 'Mover, escalar, girar, afinar o engordar letras, editar nodos y simplificar. La fresa se re-chequea con cada cambio.'
                  }
                >
                  <PencilRuler className="mr-1.5 size-4" />
                  {versions.length > 1 ? EDIT_LABEL[version] : 'Editar a mano'}
                </Button>
                {manualFix && version !== 'manual' ? (
                  <p className="text-[11px] text-muted-foreground">Se edita la versión que estás viendo y reemplaza la edición a mano anterior.</p>
                ) : null}
              </div>
            ) : null}
            <div className="shrink-0 space-y-2 border-t pt-3">
              {!autoFix && !manualFix ? (
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
                  {fix ? (
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
                          </strong>
                          .
                        </span>
                      )}{' '}
                      <span className="text-muted-foreground">{resumenOperaciones(fix.operations)}</span>
                      {fix.fitScale < 0.999 ? (
                        <span className="block text-muted-foreground">
                          Para no cambiar la medida, todo el diseño se achicó {mm((1 - fix.fitScale) * 100, 1)} % dentro
                          de la misma caja ({mm(fix.fabricationMm.widthMm, 1)} × {mm(fix.fabricationMm.heightMm, 1)} mm).
                        </span>
                      ) : null}
                      {version === 'manual' && manualSizeChanged && manualBase ? (
                        <span className="block font-medium text-amber-700 dark:text-amber-300">
                          Medida nueva: {mm(fix.fabricationMm.widthMm, 1)} × {mm(fix.fabricationMm.heightMm, 1)} mm (antes{' '}
                          {mm(manualBase.widthMm, 1)} × {mm(manualBase.heightMm, 1)}). Se guarda con esta medida.
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {fix?.scaleUp && remaining > 0 ? (
                    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      <p>
                        <strong>Último recurso:</strong> agrandar el sello un {mm((fix.scaleUp.factor - 1) * 100, 0)} % (
                        {mm(fix.fabricationMm.widthMm, 1)} × {mm(fix.fabricationMm.heightMm, 1)} →{' '}
                        {mm(fix.scaleUp.widthMm, 1)} × {mm(fix.scaleUp.heightMm, 1)} mm) resuelve lo que queda. Cambia
                        la medida de fabricación: usalo solo si es imprescindible.
                      </p>
                      {onApply && version !== 'original' ? (
                        <Button type="button" size="sm" variant="outline" disabled={applying} onClick={() => void apply(version, true)}>
                          Agrandar a {mm(fix.scaleUp.widthMm, 1)} × {mm(fix.scaleUp.heightMm, 1)} mm y usar
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {manualPending && onApply ? (
                    <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      La edición a mano todavía <strong>no está elegida</strong>
                      {chosen ? <> (sigue elegido «{VERSION_LABEL[chosen]}»)</> : null}. Para guardarla, mirá «Editado a mano» y
                      apretá «{VERSION_USE.manual}».
                    </p>
                  ) : chosen ? (
                    <p className="text-xs text-muted-foreground">
                      Elegido ahora para guardar: <strong className="text-foreground">{VERSION_LABEL[chosen]}</strong>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {canUse ? (
                      <Button
                        type="button"
                        disabled={applying || (version !== 'original' && !fix?.operations.length)}
                        onClick={() => (version === 'original' ? chooseOriginal() : void apply(version))}
                      >
                        {applying ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {version === 'original' ? VERSION_USE.original : (applyLabel ?? VERSION_USE[version])}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => downloadSvg(fix ? fix.svg : (svgText ?? ''), fix ? `${downloadName}-${version === 'auto' ? 'automatico' : 'editado'}` : downloadName)}
                    >
                      <Download className="mr-1.5 size-4" />
                      Descargar
                    </Button>
                    {version !== 'original' ? (
                      <Button type="button" variant="ghost" onClick={() => discard(version)} title={`Saca la versión «${VERSION_LABEL[version]}» de este chequeo`}>
                        Descartar
                      </Button>
                    ) : null}
                  </div>
                  {applyHint && onApply ? <p className="text-[11px] text-muted-foreground">{applyHint}</p> : null}
                </>
              )}
            </div>
          </aside>
        </div>
        )}
        <ConfirmDialog
          open={closeGuard}
          onOpenChange={setCloseGuard}
          title="¿Usar lo editado a mano?"
          description={`Terminaste una edición a mano pero no la elegiste. Si cerrás sin usarla, se pierde${chosen ? ` y queda elegido «${VERSION_LABEL[chosen]}»` : ''}.`}
          cancelLabel="Cerrar sin usarla"
          confirmLabel={VERSION_USE.manual}
          onCancel={() => {
            setManualPending(false);
            onOpenChange(false);
          }}
          onConfirm={() => void apply('manual')}
        />
      </DialogContent>
    </Dialog>
  );
}
