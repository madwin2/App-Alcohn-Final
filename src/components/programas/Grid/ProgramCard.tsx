import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, ChevronDown, ChevronUp, Lock, Unlock, Trash2, Plus, Download, AlertTriangle } from 'lucide-react';
import { Program, ProgramLifecycleState, ProgramStamp } from '@/lib/types/index';
import { StampsSelectionDialog } from '../StampsSelection/StampsSelectionDialog';
import { RemoveStampDialog, RemoveStampChoice } from '../RemoveStamp/RemoveStampDialog';
import { formatLengthByPlanchuela } from '@/lib/programas/material';
import { canDownloadPackage, ProgramServiceError } from '@/lib/supabase/services/programs.service';
import { toast } from '@/components/ui/use-toast';

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
  onToggleVerified: (programId: string, verified: boolean) => Promise<void>;
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

const isLockedState = (program: Program) =>
  program.bloqueado
  || program.estadoPrograma === 'BLOQUEADO'
  || program.estadoPrograma === 'EN_FABRICACION';

export function ProgramCard({
  program,
  onRefresh,
  onAddStamps,
  onRemoveStamp,
  onDelete,
  onLock,
  onUnlock,
  onDownload,
  onToggleVerified,
}: ProgramCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showStampsDialog, setShowStampsDialog] = useState(false);
  const [stampToRemove, setStampToRemove] = useState<ProgramStamp | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const locked = isLockedState(program);
  const lengthLines = formatLengthByPlanchuela(program.lengthByPlanchuela);
  const showStaleZip = Boolean(program.archivoZipUrl) && program.dirty;

  const run = async (fn: () => Promise<void>, successMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast({ title: successMsg });
      await onRefresh();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof ProgramServiceError || e instanceof Error ? e.message : 'Operación fallida',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked && program.bloqueado) {
      if (!window.confirm('¿Desbloquear el programa? Podrá editarse de nuevo.')) return;
      void run(() => onUnlock(program.id), 'Programa desbloqueado');
    } else if (!locked) {
      void run(() => onLock(program.id), 'Programa bloqueado');
    }
  };

  const handleVerificationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked) return;
    void run(() => onToggleVerified(program.id, !program.isVerified));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(true);
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

  useEffect(() => {
    const handleClickOutside = () => {
      if (showContextMenu) setShowContextMenu(false);
    };
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <Card
      id={`program-card-${program.id}`}
      className={`hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer relative overflow-hidden ${
        isExpanded ? 'shadow-lg' : 'shadow-md'
      } ${locked ? 'opacity-90 bg-muted/20' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded((v) => !v);
      }}
      onContextMenu={handleContextMenu}
    >
      {program.isVerified && (
        <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-gradient-to-br from-green-400/20 to-green-600/40 rounded-full blur-2xl" />
      )}

      <CardHeader className="pb-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className={`px-3 py-1 rounded text-xs font-medium w-fit ${getMachineInfo(program.machine).color}`}>
              {getMachineInfo(program.machine).text}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={handleLockClick}
                disabled={busy || (locked && !program.bloqueado)}
                title={
                  locked && !program.bloqueado
                    ? 'Bloqueado por fabricación en curso'
                    : locked
                      ? 'Desbloquear programa'
                      : 'Bloquear programa'
                }
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
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-foreground truncate flex-1 min-w-0">
                {program.name}
              </h3>
              <Badge
                variant="outline"
                className={`text-[10px] ${lifecycleBadgeClass(program.estadoPrograma, program.dirty)}`}
              >
                {lifecycleLabel(program.estadoPrograma, program.dirty)}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span>{program.productionDate}</span>
              <span>{program.stampCount} Sellos</span>
            </div>

            {showStaleZip && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 mt-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Desactualizado desde la última descarga
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
            isExpanded ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-4 pt-3 border-t border-border/50">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Sellos:</h4>
              <div className="flex gap-2 flex-wrap">
                {program.stamps.map((stamp) => (
                  <button
                    key={stamp.id}
                    type="button"
                    className="w-9 h-9 bg-white rounded border border-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-700 hover:border-destructive hover:text-destructive"
                    title={`${stamp.designName} — click para quitar`}
                    disabled={locked || busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (locked) return;
                      setStampToRemove(stamp);
                    }}
                  >
                    {Math.round(stamp.widthMm)}×{Math.round(stamp.heightMm)}
                  </button>
                ))}
                {program.stamps.length === 0 && (
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
          </div>
        </div>

        <div className="flex justify-between items-end mt-3">
          <Badge variant="outline" className="text-xs font-normal">
            {lifecycleLabel(program.estadoPrograma, program.dirty)}
          </Badge>

          <Button
            size="sm"
            className={`h-8 w-8 p-0 rounded-full transition-all duration-200 hover:scale-105 border ${
              program.isVerified
                ? 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/25'
                : 'bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50'
            } ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleVerificationClick}
            disabled={locked || busy}
          >
            {program.isVerified ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>

      {showContextMenu && (
        <div
          className="absolute top-2 right-2 z-50 bg-background border border-border rounded-md shadow-lg p-1 w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
            disabled={locked || busy}
            onClick={() => {
              setShowContextMenu(false);
              setShowDeleteDialog(true);
            }}
          >
            <Trash2 className="h-3 w-3" />
            Eliminar programa
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-primary hover:text-primary hover:bg-primary/10 h-8 text-xs"
            disabled={locked || busy}
            onClick={() => {
              setShowContextMenu(false);
              setShowStampsDialog(true);
            }}
          >
            <Plus className="h-3 w-3" />
            Agregar sellos
          </Button>

          {canDownloadPackage(program.machine) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 h-8 text-xs"
              disabled={busy || program.stamps.length === 0}
              onClick={() => {
                setShowContextMenu(false);
                void run(() => onDownload(program.id), 'Paquete descargado');
              }}
            >
              <Download className="h-3 w-3" />
              Descargar programa
            </Button>
          )}
        </div>
      )}

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
        confirmLabel="Eliminar"
        onConfirm={handleDeleteConfirm}
      />
    </Card>
  );
}
