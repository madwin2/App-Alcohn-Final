import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  X,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Plus,
  Download,
  AlertTriangle,
  History,
  Upload,
  FileCheck2,
  Loader2,
} from 'lucide-react';
import { Program, ProgramLifecycleState, ProgramStamp, FabricationState } from '@/lib/types/index';
import { StampsSelectionDialog } from '../StampsSelection/StampsSelectionDialog';
import { RemoveStampDialog, RemoveStampChoice } from '../RemoveStamp/RemoveStampDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { DoneReviewDialog } from '../DoneReview/DoneReviewDialog';
import { formatLengthByPlanchuela } from '@/lib/programas/material';
import { StampThumb } from '../StampThumb';
import {
  canDownloadPackage,
  ProgramServiceError,
  getProgramEvents,
  ProgramEvent,
} from '@/lib/supabase/services/programs.service';
import { toast } from '@/components/ui/use-toast';
import { getFabricationLabel, formatDateTime, parseOrderDateLocal } from '@/lib/utils/format';
import { DatePicker } from '@/components/ui/date-picker';

interface ProgramCardProps {
  program: Program;
  onRefresh: () => Promise<void> | void;
  onAddStamps: (programId: string, stampIds: string[]) => Promise<void>;
  onRemoveStamp: (
    programId: string,
    stampId: string,
    choice: RemoveStampChoice,
  ) => Promise<void>;
  onDelete: (programId: string, choice: RemoveStampChoice) => Promise<void>;
  onLock: (programId: string) => Promise<void>;
  onUnlock: (programId: string) => Promise<void>;
  onDownload: (programId: string) => Promise<void>;
  onUpdateProgram: (programId: string, updates: Partial<Program>) => Promise<void>;
  onUploadVerifiedAspire: (programId: string, file: File) => Promise<void>;
  onSetFabricationState: (programId: string, state: FabricationState) => Promise<void>;
  onSetStampFabricationStates: (
    programId: string,
    assignments: { stampId: string; state: FabricationState }[],
  ) => Promise<void>;
}

const lifecycleLabel = (estado: ProgramLifecycleState, dirty: boolean): string => {
  if (estado === 'LISTO' && dirty) return 'Editado, falta regenerar';
  const map: Record<ProgramLifecycleState, string> = {
    BORRADOR: 'Borrador',
    LISTO: 'Listo',
    BLOQUEADO: 'Bloqueado',
    EN_FABRICACION: 'En fabricación',
    FINALIZADO: 'Finalizado',
  };
  return map[estado] || estado;
};

const lifecycleBadgeClass = (estado: ProgramLifecycleState, dirty: boolean): string => {
  if (dirty && (estado === 'LISTO' || estado === 'BORRADOR')) {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  switch (estado) {
    case 'LISTO':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'BLOQUEADO':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'EN_FABRICACION':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'FINALIZADO':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getMachineInfo = (machine: string) => {
  switch (machine) {
    case 'C':
      return { text: 'Máquina Chica', color: 'bg-purple-600 text-white' };
    case 'G':
      return { text: 'Máquina Grande', color: 'bg-blue-600 text-white' };
    case 'XL':
      return { text: 'Máquina XL', color: 'bg-green-600 text-white' };
    case 'ABC':
      return { text: 'Máquina ABC', color: 'bg-orange-600 text-white' };
    default:
      return { text: 'Máquina', color: 'bg-gray-600 text-white' };
  }
};

const isLockedState = (program: Program) => Boolean(program.bloqueado);

const PROGRAM_FAB_OPTIONS: FabricationState[] = [
  'SIN_HACER',
  'HACIENDO',
  'REHACER',
  'RETOCAR',
  'VERIFICAR',
  'HECHO',
];

const eventLabel = (ev: ProgramEvent): string => {
  switch (ev.tipo) {
    case 'CREADO':
      return 'Programa creado';
    case 'BLOQUEADO':
      return 'Bloqueado';
    case 'DESBLOQUEADO':
      return 'Desbloqueado';
    case 'VERIFICADO':
      return 'Marcado como verificado';
    case 'DESVERIFICADO':
      return 'Verificación quitada';
    case 'DESCARGADO':
      return 'Paquete descargado';
    case 'ESTADO_CAMBIADO':
      return ev.detalle?.estado
        ? `Estado de fabricación: ${getFabricationLabel(String(ev.detalle.estado))}`
        : 'Estado de fabricación cambiado';
    case 'SELLO_AGREGADO':
      return `Se agregaron ${ev.detalle?.count ?? ''} sello(s)`;
    case 'SELLO_QUITADO':
      return 'Sello quitado';
    case 'ASPIRE_SUBIDO':
      return ev.detalle?.nombre
        ? `Aspire verificado subido: ${String(ev.detalle.nombre)}`
        : 'Aspire verificado subido';
    default:
      return ev.tipo;
  }
};

export function ProgramCard({
  program,
  onRefresh,
  onAddStamps,
  onRemoveStamp,
  onDelete,
  onLock,
  onUnlock,
  onDownload,
  onUpdateProgram,
  onUploadVerifiedAspire,
  onSetFabricationState,
  onSetStampFabricationStates,
}: ProgramCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showStampsDialog, setShowStampsDialog] = useState(false);
  const [stampToRemove, setStampToRemove] = useState<ProgramStamp | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteEmptyDialog, setShowDeleteEmptyDialog] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [pendingFabState, setPendingFabState] = useState<FabricationState | null>(null);
  const [showDoneAskDialog, setShowDoneAskDialog] = useState(false);
  const [showDoneReviewDialog, setShowDoneReviewDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [events, setEvents] = useState<ProgramEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingAspire, setUploadingAspire] = useState(false);
  const aspireInputRef = useRef<HTMLInputElement | null>(null);

  const locked = isLockedState(program);
  const lengthLines = formatLengthByPlanchuela(program.lengthByPlanchuela);
  const showStaleZip = Boolean(program.archivoZipUrl) && program.dirty;
  const canDownload = canDownloadPackage(program.machine) && program.stamps.length > 0;
  const productionDateObj = parseOrderDateLocal(program.productionDate);

  const run = async (fn: () => Promise<void>, successMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast({ title: successMsg });
    } catch (e) {
      toast({
        title: 'Error',
        description:
          e instanceof ProgramServiceError || e instanceof Error ? e.message : 'Operación fallida',
        variant: 'destructive',
      });
      try {
        await onRefresh();
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (program.bloqueado) {
      setShowUnlockDialog(true);
    } else {
      void run(() => onLock(program.id), 'Programa bloqueado');
    }
  };

  const openDeleteDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked || busy) return;
    if (program.stamps.length === 0) setShowDeleteEmptyDialog(true);
    else setShowDeleteDialog(true);
  };

  const handleSetFabricationState = (state: FabricationState) => {
    if (busy || program.stamps.length === 0) return;
    setShowFabMenu(false);
    if (state === 'HECHO') {
      setShowDoneAskDialog(true);
      return;
    }
    setPendingFabState(state);
  };

  const handleAddStampsToProgram = (selected: ProgramStamp[]) => {
    void run(
      () => onAddStamps(program.id, selected.map((s) => s.id)),
      `${selected.length} sello(s) agregados`,
    );
    setShowStampsDialog(false);
  };

  const handleRemoveConfirm = (choice: RemoveStampChoice) => {
    if (!stampToRemove) return;
    void run(
      () => onRemoveStamp(program.id, stampToRemove.id, choice),
      'Sello quitado del programa',
    );
    setStampToRemove(null);
  };

  const handleDeleteConfirm = (choice: RemoveStampChoice) => {
    void run(() => onDelete(program.id, choice), 'Programa eliminado');
    setShowDeleteDialog(false);
  };

  const handleDeleteEmptyConfirm = () => {
    void run(() => onDelete(program.id, { mode: 'PREVIOUS' }), 'Programa eliminado');
    setShowDeleteEmptyDialog(false);
  };

  const handleDateChange = (date: Date | undefined) => {
    if (!date || locked || busy) return;
    const next = format(date, 'yyyy-MM-dd');
    if (next === program.productionDate) return;
    void run(
      () => onUpdateProgram(program.id, { productionDate: next }),
      'Fecha actualizada',
    );
  };

  const handleAspireFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploadingAspire(true);
    try {
      await run(
        () => onUploadVerifiedAspire(program.id, file),
        'Aspire verificado subido — programa bloqueado',
      );
    } finally {
      setUploadingAspire(false);
      if (aspireInputRef.current) aspireInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (showFabMenu) setShowFabMenu(false);
    };
    if (showFabMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFabMenu]);

  useEffect(() => {
    if (!showHistory) return;
    let cancelled = false;
    setEventsLoading(true);
    void getProgramEvents(program.id)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showHistory, program.id, program.lastUpdated]);

  return (
    <Card
      id={`program-card-${program.id}`}
      className={`group hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer relative ${
        showFabMenu ? 'overflow-visible z-20' : 'overflow-hidden'
      } ${isExpanded ? 'shadow-lg' : 'shadow-md'} ${locked ? 'opacity-90 bg-muted/20' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded((v) => !v);
      }}
    >
      <CardHeader className="pb-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div
              className={`px-3 py-1 rounded text-xs font-medium w-fit ${getMachineInfo(program.machine).color}`}
            >
              {getMachineInfo(program.machine).text}
            </div>

            <div className="flex items-center gap-1">
              {!locked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={openDeleteDialog}
                  disabled={busy}
                  title="Eliminar programa"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={handleLockClick}
                disabled={busy}
                title={program.bloqueado ? 'Desbloquear programa' : 'Bloquear programa'}
              >
                {locked ? (
                  <Lock className="h-4 w-4 text-red-500" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded((v) => !v);
                }}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-foreground truncate">{program.name}</h3>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <div
                onClick={(e) => e.stopPropagation()}
                title={locked ? 'Desbloqueá para cambiar la fecha' : 'Cambiar fecha de fabricación'}
              >
                <DatePicker
                  date={Number.isNaN(productionDateObj.getTime()) ? undefined : productionDateObj}
                  onDateChange={handleDateChange}
                  disabled={locked || busy}
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                />
              </div>
              <span>
                {program.stampCount} Sello{program.stampCount === 1 ? '' : 's'}
              </span>
            </div>

            {showStaleZip && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 mt-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Desactualizado desde la última descarga
              </div>
            )}

            {program.archivoAspireUrl && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-2">
                <FileCheck2 className="h-3.5 w-3.5 flex-shrink-0" />
                <a
                  href={program.archivoAspireUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  title={program.archivoAspireNombre || 'Aspire verificado'}
                >
                  Aspire verificado
                  {program.archivoAspireNombre ? `: ${program.archivoAspireNombre}` : ''}
                </a>
              </div>
            )}

            {program.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{program.description}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div
          className={`overflow-hidden transition-all duration-500 ${
            isExpanded ? 'max-h-[40rem] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-4 pt-3 border-t border-border/50">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Sellos:</h4>
              <div className="flex gap-2 flex-wrap items-center">
                {program.stamps.map((stamp) => (
                  <div
                    key={stamp.id}
                    className="group/stamp relative"
                    title={
                      stamp.notes?.trim()
                        ? `${stamp.designName} — ${stamp.notes.trim()}`
                        : stamp.designName
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    <StampThumb stamp={stamp} className="w-14 h-14" />
                    {!locked && (
                      <button
                        type="button"
                        aria-label={`Quitar ${stamp.designName}`}
                        className="absolute -top-1.5 -left-1.5 hidden group-hover/stamp:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm disabled:hidden"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setStampToRemove(stamp);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}

                {!locked && (
                  <button
                    type="button"
                    title="Agregar sellos"
                    disabled={busy}
                    className="w-14 h-14 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/60 hover:bg-muted/40 transition-colors disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowStampsDialog(true);
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}

                {program.stamps.length === 0 && locked && (
                  <span className="text-xs text-muted-foreground">Sin sellos</span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Largo utilizado:</span>
              <div className="text-sm text-foreground">
                {lengthLines.length > 0 ? (
                  lengthLines.map((line) => <div key={line}>{line}</div>)
                ) : (
                  <div className="text-muted-foreground">—</div>
                )}
              </div>
            </div>

            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <div className="text-sm font-medium text-foreground">Aspire verificado</div>
              {program.archivoAspireUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    <FileCheck2 className="h-3 w-3 mr-1" />
                    Subido
                  </Badge>
                  <a
                    href={program.archivoAspireUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-600 underline truncate max-w-[220px]"
                    title={program.archivoAspireNombre || undefined}
                  >
                    {program.archivoAspireNombre || 'Descargar Aspire'}
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={busy || uploadingAspire}
                    onClick={() => aspireInputRef.current?.click()}
                  >
                    {uploadingAspire ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Reemplazar
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={busy || uploadingAspire}
                  onClick={() => aspireInputRef.current?.click()}
                >
                  {uploadingAspire ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Subir Aspire chequeado
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Al subir el .crv3d el programa queda verificado y bloqueado.
              </p>
              <input
                ref={aspireInputRef}
                type="file"
                accept=".crv3d,.crv,.zip,application/octet-stream"
                className="hidden"
                onChange={(e) => handleAspireFile(e.target.files)}
              />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory((v) => !v);
                }}
              >
                <History className="h-3.5 w-3.5" />
                {showHistory ? 'Ocultar historial' : 'Ver historial'}
              </button>
              {showHistory && (
                <div
                  className="max-h-36 overflow-y-auto space-y-1.5 pr-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {eventsLoading ? (
                    <p className="text-xs text-muted-foreground">Cargando…</p>
                  ) : events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Todavía no hay eventos.</p>
                  ) : (
                    events.map((ev) => (
                      <div key={ev.id} className="text-xs leading-snug">
                        <div className="text-foreground">{eventLabel(ev)}</div>
                        <div className="text-muted-foreground">
                          {formatDateTime(ev.createdAt)}
                          {ev.usuarioEmail ? ` · ${ev.usuarioEmail}` : ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-end mt-3 relative">
          {program.stamps.length > 0 ? (
            <button
              type="button"
              className="shrink-0"
              disabled={busy}
              title="Cambiar estado de fabricación de todos los sellos"
              onClick={(e) => {
                e.stopPropagation();
                if (busy) return;
                setShowFabMenu((v) => !v);
              }}
            >
              <Badge
                variant="outline"
                className={`text-[10px] cursor-pointer ${lifecycleBadgeClass(program.estadoPrograma, program.dirty)}`}
              >
                {lifecycleLabel(program.estadoPrograma, program.dirty)}
                <ChevronDown className="h-3 w-3 ml-0.5 inline-block align-middle" />
              </Badge>
            </button>
          ) : (
            <Badge
              variant="outline"
              className={`text-[10px] ${lifecycleBadgeClass(program.estadoPrograma, program.dirty)}`}
            >
              {lifecycleLabel(program.estadoPrograma, program.dirty)}
            </Badge>
          )}

          {showFabMenu && (
            <div
              className="absolute bottom-full left-0 z-50 mb-1 bg-background border border-border rounded-md shadow-lg p-1 w-[180px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
                Cambiar estado de fabricación
              </div>
              {PROGRAM_FAB_OPTIONS.map((state) => (
                <Button
                  key={state}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-xs"
                  disabled={busy}
                  onClick={() => handleSetFabricationState(state)}
                >
                  {getFabricationLabel(state)}
                </Button>
              ))}
            </div>
          )}

          <Button
            size="sm"
            className="h-8 w-8 p-0 rounded-full transition-all duration-200 hover:scale-105 border bg-muted/30 text-muted-foreground border-border/40 hover:bg-green-50 hover:text-green-700 hover:border-green-500/50 dark:hover:bg-green-950"
            onClick={(e) => {
              e.stopPropagation();
              if (!canDownload) return;
              void run(() => onDownload(program.id), 'Paquete descargado');
            }}
            disabled={!canDownload || busy}
            title={
              !canDownloadPackage(program.machine)
                ? 'ABC no genera paquete ZIP'
                : program.stamps.length === 0
                  ? 'Agregá sellos para descargar'
                  : 'Descargar programa'
            }
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      <StampsSelectionDialog
        isOpen={showStampsDialog}
        onClose={() => setShowStampsDialog(false)}
        onAddStamps={handleAddStampsToProgram}
        programId={program.id}
        machine={program.machine}
        excludeStampIds={program.stamps.map((s) => s.id)}
        initialLengthByPlanchuela={program.lengthByPlanchuela}
      />

      <RemoveStampDialog
        open={Boolean(stampToRemove)}
        onOpenChange={(open) => {
          if (!open) setStampToRemove(null);
        }}
        stamp={stampToRemove}
        onConfirm={handleRemoveConfirm}
      />

      <RemoveStampDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        bulkCount={program.stamps.length || 1}
        title="Eliminar programa"
        description={`¿Eliminar «${program.name}»? Se liberarán ${program.stamps.length} sello${program.stamps.length === 1 ? '' : 's'} y se quitará la máquina asignada. Elegí qué estado de fabricación dejar en cada uno.`}
        confirmLabel="Eliminar"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
      />

      <ConfirmDialog
        open={showDeleteEmptyDialog}
        onOpenChange={setShowDeleteEmptyDialog}
        title="Eliminar programa"
        description={`¿Eliminar «${program.name}»? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={handleDeleteEmptyConfirm}
      />

      <ConfirmDialog
        open={showUnlockDialog}
        onOpenChange={setShowUnlockDialog}
        title="Desbloquear programa"
        description="¿Desbloquear el programa? Podrá editarse de nuevo."
        confirmLabel="Desbloquear"
        onConfirm={() => void run(() => onUnlock(program.id), 'Programa desbloqueado')}
      />

      <ConfirmDialog
        open={showDoneAskDialog}
        onOpenChange={setShowDoneAskDialog}
        title="¿Algún sello salió mal?"
        description="¿Hay que rehacer o retocar alguno de este programa?"
        confirmLabel="Sí"
        cancelLabel="No"
        onConfirm={() => {
          setShowDoneAskDialog(false);
          setShowDoneReviewDialog(true);
        }}
        onCancel={() => {
          setShowDoneAskDialog(false);
          void run(
            () => onSetFabricationState(program.id, 'HECHO'),
            'Sellos marcados como Hecho',
          );
        }}
      />

      <DoneReviewDialog
        open={showDoneReviewDialog}
        onOpenChange={setShowDoneReviewDialog}
        stamps={program.stamps}
        programName={program.name}
        onConfirm={(assignments) => {
          void run(
            () => onSetStampFabricationStates(program.id, assignments),
            'Estados de fabricación actualizados',
          );
        }}
      />

      <ConfirmDialog
        open={pendingFabState != null}
        onOpenChange={(open) => {
          if (!open) setPendingFabState(null);
        }}
        title="Cambiar estado de fabricación"
        description={
          pendingFabState
            ? `¿Cambiar el estado de ${program.stamps.length} sello${program.stamps.length === 1 ? '' : 's'} de «${program.name}» a "${getFabricationLabel(pendingFabState)}"?`
            : ''
        }
        confirmLabel="Cambiar"
        onConfirm={() => {
          if (!pendingFabState) return;
          const state = pendingFabState;
          const label = getFabricationLabel(state);
          setPendingFabState(null);
          void run(() => onSetFabricationState(program.id, state), `Sellos marcados como ${label}`);
        }}
      />
    </Card>
  );
}
