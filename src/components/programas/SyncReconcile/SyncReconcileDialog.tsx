import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FabricationState } from '@/lib/types/index';
import { getFabricationLabel } from '@/lib/utils/format';
import {
  ProgramReconciliation,
  SoloEnAppDecision,
  SoloEnArchivoDecision,
} from '@/lib/supabase/services/programs.service';
import { Check, AlertTriangle } from 'lucide-react';

const FAB_OPTIONS: FabricationState[] = [
  'SIN_HACER',
  'HACIENDO',
  'REHACER',
  'RETOCAR',
  'VERIFICAR',
  'HECHO',
  'PROGRAMADO',
];

type AppChoice = {
  action: 'KEEP' | 'REMOVE';
  restoreMode: 'PREVIOUS' | 'NEW';
  newState: FabricationState;
};

type FileChoice = 'ADD' | 'IGNORE';

export type SyncReconcileConfirm = {
  soloEnApp: SoloEnAppDecision[];
  soloEnArchivo: SoloEnArchivoDecision[];
};

interface SyncReconcileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programName: string;
  appStampCount: number;
  fileStampCount: number;
  reconciliation: ProgramReconciliation;
  stampLabels: Record<string, string>;
  parseError?: string | null;
  onConfirm: (decisions: SyncReconcileConfirm) => void;
}

function labelFor(id: string, labels: Record<string, string>): string {
  return labels[id.toLowerCase()] || id.slice(0, 8);
}

export function SyncReconcileDialog({
  open,
  onOpenChange,
  programName,
  appStampCount,
  fileStampCount,
  reconciliation,
  stampLabels,
  parseError,
  onConfirm,
}: SyncReconcileDialogProps) {
  const [appChoices, setAppChoices] = useState<Record<string, AppChoice>>({});
  const [fileChoices, setFileChoices] = useState<Record<string, FileChoice>>({});

  useEffect(() => {
    if (!open) return;
    const nextApp: Record<string, AppChoice> = {};
    for (const id of reconciliation.soloEnApp) {
      nextApp[id] = { action: 'KEEP', restoreMode: 'PREVIOUS', newState: 'SIN_HACER' };
    }
    const nextFile: Record<string, FileChoice> = {};
    for (const id of reconciliation.soloEnArchivo) {
      nextFile[id] = 'ADD';
    }
    setAppChoices(nextApp);
    setFileChoices(nextFile);
  }, [open, reconciliation]);

  const handleConfirm = () => {
    const soloEnApp: SoloEnAppDecision[] = reconciliation.soloEnApp.map((selloId) => {
      const choice = appChoices[selloId] || {
        action: 'KEEP' as const,
        restoreMode: 'PREVIOUS' as const,
        newState: 'SIN_HACER' as FabricationState,
      };
      if (choice.action === 'KEEP') return { selloId, action: 'KEEP' };
      return {
        selloId,
        action: 'REMOVE',
        restoreMode: choice.restoreMode,
        newFabricationState: choice.restoreMode === 'NEW' ? choice.newState : undefined,
      };
    });

    const soloEnArchivo: SoloEnArchivoDecision[] = reconciliation.soloEnArchivo.map((selloId) => ({
      selloId,
      action: fileChoices[selloId] || 'IGNORE',
    }));

    onConfirm({ soloEnApp, soloEnArchivo });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Diferencias con el Aspire</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          {parseError ? (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">No se pudo leer el contenido del Aspire</p>
                <p className="text-xs mt-0.5 opacity-90">{parseError}</p>
                <p className="text-xs mt-1">El archivo se guardó igual. Ajustá la lista a mano si hace falta.</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              El Aspire de «{programName}» tiene {fileStampCount} sello
              {fileStampCount === 1 ? '' : 's'}. La app tiene {appStampCount}.
            </p>
          )}

          {!parseError && (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              <span>{reconciliation.enAmbos.length} coinciden</span>
            </div>
          )}

          {reconciliation.avisos.map((aviso) => (
            <div
              key={aviso}
              className="flex gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {aviso}
            </div>
          ))}

          {reconciliation.soloEnApp.map((id) => {
            const choice = appChoices[id] || {
              action: 'KEEP' as const,
              restoreMode: 'PREVIOUS' as const,
              newState: 'SIN_HACER' as FabricationState,
            };
            return (
              <div key={id} className="space-y-2 rounded-md border border-border p-3">
                <p className="font-medium text-foreground">
                  Falta en el Aspire: «{labelFor(id, stampLabels)}»
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`app-${id}`}
                    checked={choice.action === 'REMOVE'}
                    onChange={() =>
                      setAppChoices((prev) => ({
                        ...prev,
                        [id]: { ...choice, action: 'REMOVE' },
                      }))
                    }
                    className="mt-1"
                  />
                  <span>Sacarlo del programa y devolverlo a pendientes</span>
                </label>
                {choice.action === 'REMOVE' && (
                  <div className="pl-6 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer text-muted-foreground">
                      <input
                        type="radio"
                        name={`restore-${id}`}
                        checked={choice.restoreMode === 'PREVIOUS'}
                        onChange={() =>
                          setAppChoices((prev) => ({
                            ...prev,
                            [id]: { ...choice, restoreMode: 'PREVIOUS' },
                          }))
                        }
                        className="mt-1"
                      />
                      <span>Mantener el estado anterior</span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer text-muted-foreground">
                      <input
                        type="radio"
                        name={`restore-${id}`}
                        checked={choice.restoreMode === 'NEW'}
                        onChange={() =>
                          setAppChoices((prev) => ({
                            ...prev,
                            [id]: { ...choice, restoreMode: 'NEW' },
                          }))
                        }
                        className="mt-1"
                      />
                      <span>Elegir un estado nuevo</span>
                    </label>
                    {choice.restoreMode === 'NEW' && (
                      <div className="space-y-1 pl-1">
                        <Label className="text-xs">Estado de fabricación</Label>
                        <Select
                          value={choice.newState}
                          onValueChange={(v) =>
                            setAppChoices((prev) => ({
                              ...prev,
                              [id]: { ...choice, newState: v as FabricationState },
                            }))
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FAB_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {getFabricationLabel(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`app-${id}`}
                    checked={choice.action === 'KEEP'}
                    onChange={() =>
                      setAppChoices((prev) => ({
                        ...prev,
                        [id]: { ...choice, action: 'KEEP' },
                      }))
                    }
                    className="mt-1"
                  />
                  <span>Dejarlo (lo voy a agregar después)</span>
                </label>
              </div>
            );
          })}

          {reconciliation.soloEnArchivo.map((id) => {
            const choice = fileChoices[id] || 'ADD';
            return (
              <div key={id} className="space-y-2 rounded-md border border-border p-3">
                <p className="font-medium text-foreground">
                  Está en el Aspire y no en la app: «{labelFor(id, stampLabels)}»
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`file-${id}`}
                    checked={choice === 'ADD'}
                    onChange={() => setFileChoices((prev) => ({ ...prev, [id]: 'ADD' }))}
                    className="mt-1"
                  />
                  <span>Agregarlo al programa</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`file-${id}`}
                    checked={choice === 'IGNORE'}
                    onChange={() => setFileChoices((prev) => ({ ...prev, [id]: 'IGNORE' }))}
                    className="mt-1"
                  />
                  <span>Ignorar por ahora</span>
                </label>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {!parseError && (
            <Button onClick={handleConfirm}>Confirmar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
