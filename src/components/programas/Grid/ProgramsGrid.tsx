import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import gsap from 'gsap';
import { format } from 'date-fns';
import { ProgramCard } from './ProgramCard';
import {
  ProgramCardDesign,
  ProgramSheetDragLayer,
  measureDockMagnetTarget,
  measureProgramSheetDragOrigin,
  type DockMagnetTarget,
  type ProgramSheetDragOrigin,
  ProgramSlotEmpty,
} from './ProgramCardDesign';
import {
  EmptySlotDropTarget,
  ProgramDropTarget,
  ProgramsSidePanel,
  type EligibleEntry,
  type ProgramDragData,
  type StampDragData,
} from './ProgramsSidePanel';
import { FinishedProgramsBrowse } from './FinishedProgramsBrowse';
import { Program, FabricationState, ProgramMachineType, ProgramStamp } from '@/lib/types/index';
import { useProgramsStore } from '@/lib/state/programs.store';
import { RemoveStampChoice, RemoveStampDialog } from '../RemoveStamp/RemoveStampDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { StampThumb } from '@/components/programas/StampThumb';
import { generateProgramName } from '@/lib/programas/programName';
import { toast } from '@/components/ui/use-toast';
import type {
  SoloEnAppDecision,
  SoloEnArchivoDecision,
  SyncProgramFromFileResult,
} from '@/lib/supabase/services/programs.service';
import { cn } from '@/lib/utils';

interface ProgramsGridProps {
  programs: Program[];
  onRefresh: () => Promise<void> | void;
  onCreateProgram: (program: Partial<Program>) => Promise<Program>;
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
  onSyncAspireFile: (programId: string, file: File) => Promise<SyncProgramFromFileResult>;
  onApplyReconciliation: (
    programId: string,
    decisions: {
      soloEnApp: SoloEnAppDecision[];
      soloEnArchivo: SoloEnArchivoDecision[];
    },
  ) => Promise<void>;
  onSetFabricationState: (programId: string, state: FabricationState) => Promise<void>;
  onSetStampFabricationStates: (
    programId: string,
    assignments: { stampId: string; state: FabricationState }[],
  ) => Promise<void>;
  /** Sandbox: no pega a Supabase para la columna de vectores. */
  loadEligibleEntries?: () => Promise<EligibleEntry[]>;
}

const MACHINE_COLUMNS: {
  machine: Exclude<ProgramMachineType, 'ABC'>;
  label: string;
  accent: string;
}[] = [
  { machine: 'C', label: 'Chica', accent: 'bg-violet-500' },
  { machine: 'G', label: 'Grande', accent: 'bg-sky-500' },
  { machine: 'XL', label: 'XL', accent: 'bg-emerald-500' },
];

function MachineColumnHeader({
  label,
  accent,
  count,
  eyebrow = 'Máquina',
}: {
  label: string;
  accent: string;
  count: number;
  eyebrow?: string;
}) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3 border-b border-border/60 pb-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn('h-9 w-[3px] shrink-0 rounded-full', accent)}
        />
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {label}
          </h2>
        </div>
      </div>
      <span className="pb-0.5 text-[13px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </header>
  );
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function ProgramsGrid({
  programs,
  onRefresh,
  onCreateProgram,
  onAddStamps,
  onRemoveStamp,
  onDelete,
  onLock,
  onUnlock,
  onDownload,
  onUpdateProgram,
  onSyncAspireFile,
  onApplyReconciliation,
  onSetFabricationState,
  onSetStampFabricationStates,
  loadEligibleEntries,
}: ProgramsGridProps) {
  const { getFilteredPrograms, viewMode } = useProgramsStore();
  const filteredPrograms = getFilteredPrograms(programs);

  const [creating, setCreating] = useState(false);
  const [poolKey, setPoolKey] = useState(0);
  const [showFinished, setShowFinished] = useState(false);
  const [activeStamp, setActiveStamp] = useState<ProgramStamp | null>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const returningFromFinishedRef = useRef(false);

  const openFinished = useCallback(() => {
    const el = boardWrapRef.current;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduced) {
      setShowFinished(true);
      return;
    }
    gsap.to(el, {
      autoAlpha: 0,
      y: 14,
      duration: 0.34,
      ease: 'power2.inOut',
      onComplete: () => setShowFinished(true),
    });
  }, []);

  useLayoutEffect(() => {
    if (showFinished) return;
    if (!returningFromFinishedRef.current) return;
    returningFromFinishedRef.current = false;
    const el = boardWrapRef.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      gsap.set(el, { autoAlpha: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' },
    );
  }, [showFinished]);

  const [programDragOrigin, setProgramDragOrigin] = useState<ProgramSheetDragOrigin | null>(
    null,
  );
  const [programDragDelta, setProgramDragDelta] = useState({ x: 0, y: 0 });
  const [dockMagnet, setDockMagnet] = useState<DockMagnetTarget | null>(null);
  const [dockCommit, setDockCommit] = useState<DockMagnetTarget | null>(null);
  const pendingDockActionRef = useRef<null | (() => void | Promise<void>)>(null);
  const [pendingDelete, setPendingDelete] = useState<Program | null>(null);
  const [deleteEmptyOpen, setDeleteEmptyOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 14 } }),
  );

  const cardProps = {
    onRefresh: async () => {
      await onRefresh();
      setPoolKey((k) => k + 1);
    },
    onAddStamps: async (programId: string, stampIds: string[]) => {
      await onAddStamps(programId, stampIds);
      setPoolKey((k) => k + 1);
    },
    onRemoveStamp,
    onDelete,
    onLock,
    onUnlock,
    onDownload,
    onUpdateProgram,
    onSyncAspireFile,
    onApplyReconciliation,
    onSetFabricationState,
    onSetStampFabricationStates,
  };

  const { activePrograms, finishedPrograms, otherPrograms } = useMemo(() => {
    const finished: Program[] = [];
    const active: Program[] = [];
    const other: Program[] = [];
    for (const p of filteredPrograms) {
      if (p.estadoPrograma === 'FINALIZADO') {
        finished.push(p);
        continue;
      }
      if (p.machine === 'C' || p.machine === 'G' || p.machine === 'XL') {
        active.push(p);
      } else {
        other.push(p);
      }
    }
    return {
      activePrograms: active,
      finishedPrograms: finished,
      otherPrograms: other,
    };
  }, [filteredPrograms]);

  const byMachine = MACHINE_COLUMNS.map((col) => ({
    ...col,
    items: activePrograms.filter((p) => p.machine === col.machine),
  }));

  const createEmpty = useCallback(
    async (machine: ProgramMachineType, stamps?: ProgramStamp[]) => {
      if (creating) return;
      setCreating(true);
      try {
        const date = todayIso();
        const stampCount = stamps?.length ?? 0;
        await onCreateProgram({
          machine,
          productionDate: date,
          name: generateProgramName({ date, machine, stampCount }),
          stamps: stamps?.length ? stamps : undefined,
          stampCount,
        });
        toast({
          title: stampCount
            ? 'Programa creado con el diseño'
            : 'Programa creado',
        });
        setPoolKey((k) => k + 1);
      } catch (e) {
        toast({
          title: 'No se pudo crear',
          description: e instanceof Error ? e.message : 'Error al crear programa',
          variant: 'destructive',
        });
      } finally {
        setCreating(false);
      }
    },
    [creating, onCreateProgram],
  );

  const requestDelete = useCallback((program: Program) => {
    setPendingDelete(program);
    if (program.stamps.length === 0) setDeleteEmptyOpen(true);
  }, []);

  const clearProgramDrag = () => {
    setProgramDragOrigin(null);
    setProgramDragDelta({ x: 0, y: 0 });
    setDockMagnet(null);
    setDockCommit(null);
  };

  const finishDockCommit = useCallback(() => {
    const action = pendingDockActionRef.current;
    pendingDockActionRef.current = null;
    clearProgramDrag();
    if (!action) return;
    void (async () => {
      try {
        await action();
      } catch (e) {
        toast({
          title: 'Error',
          description: e instanceof Error ? e.message : 'Operación fallida',
          variant: 'destructive',
        });
        try {
          await onRefresh();
        } catch {
          /* ignore */
        }
      }
    })();
  }, [onRefresh]);

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as StampDragData | ProgramDragData | undefined;
    if (data?.type === 'stamp') {
      setActiveStamp(data.stamp);
      clearProgramDrag();
      pendingDockActionRef.current = null;
    } else if (data?.type === 'program') {
      setActiveStamp(null);
      pendingDockActionRef.current = null;
      setDockCommit(null);
      setDockMagnet(null);
      setProgramDragDelta({ x: 0, y: 0 });
      const fromCard =
        typeof data.getDragOrigin === 'function' ? data.getDragOrigin() : null;
      setProgramDragOrigin(fromCard ?? measureProgramSheetDragOrigin(data.programId));
    }
  };

  const onDragMove = (event: DragMoveEvent) => {
    const data = event.active.data.current as StampDragData | ProgramDragData | undefined;
    if (data?.type !== 'program') return;
    setProgramDragDelta({ x: event.delta.x, y: event.delta.y });
    const overId = event.over ? String(event.over.id) : '';
    if (overId === 'folder-finished' || overId === 'trash-program') {
      setDockMagnet(measureDockMagnetTarget(overId));
    } else {
      setDockMagnet(null);
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveStamp(null);
    const { active, over } = event;
    const drag = active.data.current as StampDragData | ProgramDragData | undefined;
    const overId = over ? String(over.id) : '';

    // Programa → carpeta/tacho: primero suck-in, después la acción
    if (drag?.type === 'program' && (overId === 'trash-program' || overId === 'folder-finished')) {
      const program = filteredPrograms.find((p) => p.id === drag.programId);
      if (!program) {
        clearProgramDrag();
        return;
      }

      if (overId === 'trash-program') {
        if (program.bloqueado) {
          clearProgramDrag();
          toast({
            title: 'No se puede borrar',
            description: 'Desbloqueá el programa primero.',
            variant: 'destructive',
          });
          return;
        }
        const target = measureDockMagnetTarget(overId) ?? dockMagnet;
        if (!target) {
          clearProgramDrag();
          requestDelete(program);
          return;
        }
        pendingDockActionRef.current = () => {
          requestDelete(program);
        };
        setDockMagnet(null);
        setDockCommit(target);
        return;
      }

      if (overId === 'folder-finished') {
        if (program.estadoPrograma === 'FINALIZADO') {
          clearProgramDrag();
          toast({ title: 'Ya está en Terminados' });
          return;
        }
        const target = measureDockMagnetTarget(overId) ?? dockMagnet;
        if (!target) {
          clearProgramDrag();
          try {
            await onSetFabricationState(program.id, 'HECHO');
            toast({ title: 'Movido a Terminados' });
          } catch (e) {
            toast({
              title: 'Error',
              description: e instanceof Error ? e.message : 'Operación fallida',
              variant: 'destructive',
            });
          }
          return;
        }
        pendingDockActionRef.current = async () => {
          await onSetFabricationState(program.id, 'HECHO');
          toast({ title: 'Movido a Terminados' });
          setPoolKey((k) => k + 1);
        };
        setDockMagnet(null);
        setDockCommit(target);
        return;
      }
    }

    clearProgramDrag();
    if (!over) return;

    try {
      if (drag?.type === 'stamp') {
        if (overId.startsWith('program:')) {
          const programId = overId.slice('program:'.length);
          const target = filteredPrograms.find((p) => p.id === programId);
          if (!target) return;
          if (target.bloqueado) {
            toast({
              title: 'Programa bloqueado',
              description: 'Desbloquealo para agregar sellos.',
              variant: 'destructive',
            });
            return;
          }
          if (!drag.machines.includes(target.machine)) {
            toast({
              title: 'No entra en esta máquina',
              description: `Este vector no es elegible para ${target.machine}.`,
              variant: 'destructive',
            });
            return;
          }
          await onAddStamps(programId, [drag.stamp.id]);
          toast({ title: 'Diseño agregado al programa' });
          setPoolKey((k) => k + 1);
          return;
        }
        if (overId.startsWith('empty:')) {
          const machine = overId.slice('empty:'.length) as ProgramMachineType;
          if (!drag.machines.includes(machine)) {
            toast({
              title: 'No entra en esta máquina',
              description: `Este vector no es elegible para ${machine}.`,
              variant: 'destructive',
            });
            return;
          }
          await createEmpty(machine, [drag.stamp]);
          return;
        }
      }
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Operación fallida',
        variant: 'destructive',
      });
      try {
        await onRefresh();
      } catch {
        /* ignore */
      }
    }
  };

  if (filteredPrograms.length === 0 && viewMode === 'list') {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center">
        <p className="text-sm text-muted-foreground">No hay programas para mostrar.</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        {filteredPrograms.map((program) => (
          <div key={program.id} className="w-full">
            <ProgramCard program={program} {...cardProps} />
          </div>
        ))}
      </div>
    );
  }

  if (showFinished) {
    return (
      <FinishedProgramsBrowse
        programs={finishedPrograms}
        cardProps={cardProps}
        onBack={() => {
          returningFromFinishedRef.current = true;
          setShowFinished(false);
        }}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveStamp(null);
        pendingDockActionRef.current = null;
        clearProgramDrag();
      }}
    >
      <div ref={boardWrapRef}>
      <div className="grid grid-cols-1 items-start gap-6 pt-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,18rem)]">
        {byMachine.map((col) => (
          <section key={col.machine} className="min-w-0">
            <MachineColumnHeader
              label={col.label}
              accent={col.accent}
              count={col.items.length}
            />

            <div className="relative isolate flex flex-col">
              {col.items.map((program, idx) => (
                <div
                  key={program.id}
                  className={cn(
                    'relative w-full overflow-visible',
                    idx > 0 && '-mt-4',
                  )}
                  style={{ zIndex: idx + 1 }}
                >
                  <ProgramDropTarget programId={program.id}>
                    <ProgramCardDesign
                      program={program}
                      enableBoardDrag
                      forceHideSheet={
                        Boolean(dockCommit) &&
                        programDragOrigin?.programId === program.id
                      }
                      {...cardProps}
                    />
                  </ProgramDropTarget>
                </div>
              ))}

              <div
                className={cn(
                  'relative w-full overflow-visible',
                  col.items.length > 0 && '-mt-4',
                )}
                style={{ zIndex: col.items.length + 1 }}
              >
                <EmptySlotDropTarget machine={col.machine}>
                  <ProgramSlotEmpty
                    onCreate={() => void createEmpty(col.machine)}
                    disabled={creating}
                  />
                </EmptySlotDropTarget>
              </div>
            </div>
          </section>
        ))}

        <ProgramsSidePanel
          finishedPrograms={finishedPrograms}
          refreshKey={poolKey}
          loadEligibleEntries={loadEligibleEntries}
          onOpenFinished={openFinished}
        />
      </div>

      {otherPrograms.length > 0 && (
        <section className="mt-8 min-w-0">
          <MachineColumnHeader
            label="Otras"
            eyebrow="Programas"
            accent="bg-zinc-400"
            count={otherPrograms.length}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherPrograms.map((program) => (
              <div key={program.id} className="relative">
                <ProgramDropTarget programId={program.id}>
                  <ProgramCardDesign
                    program={program}
                    enableBoardDrag
                    forceHideSheet={
                      Boolean(dockCommit) &&
                      programDragOrigin?.programId === program.id
                    }
                    {...cardProps}
                  />
                </ProgramDropTarget>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>

      <DragOverlay dropAnimation={null} style={{ opacity: 1 }}>
        {activeStamp ? (
          <div className="relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-md bg-white shadow-2xl ring-1 ring-black/10">
            <StampThumb
              stamp={activeStamp}
              prefer="photo"
              className="h-full w-full rounded-md border-0 bg-white"
            />
          </div>
        ) : null}
      </DragOverlay>

      {programDragOrigin &&
        (() => {
          const p = filteredPrograms.find((x) => x.id === programDragOrigin.programId);
          if (!p) return null;
          return (
            <ProgramSheetDragLayer
              program={p}
              origin={programDragOrigin}
              delta={programDragDelta}
              magnetTarget={dockCommit ? null : dockMagnet}
              commitTarget={dockCommit}
              onCommitComplete={finishDockCommit}
            />
          );
        })()}

      <RemoveStampDialog
        open={Boolean(pendingDelete) && (pendingDelete?.stamps.length ?? 0) > 0}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        bulkCount={pendingDelete?.stamps.length || 1}
        title="Eliminar programa"
        description={
          pendingDelete
            ? `¿Eliminar «${pendingDelete.name}»? Se liberarán ${pendingDelete.stamps.length} sello${pendingDelete.stamps.length === 1 ? '' : 's'}.`
            : ''
        }
        confirmLabel="Eliminar"
        confirmVariant="destructive"
        onConfirm={(choice) => {
          const program = pendingDelete;
          setPendingDelete(null);
          if (!program) return;
          void (async () => {
            try {
              await onDelete(program.id, choice);
              toast({ title: 'Programa eliminado' });
              setPoolKey((k) => k + 1);
            } catch (e) {
              toast({
                title: 'Error',
                description: e instanceof Error ? e.message : 'No se pudo eliminar',
                variant: 'destructive',
              });
            }
          })();
        }}
      />

      <ConfirmDialog
        open={deleteEmptyOpen}
        onOpenChange={(open) => {
          setDeleteEmptyOpen(open);
          if (!open) setPendingDelete(null);
        }}
        title="Eliminar programa"
        description={
          pendingDelete
            ? `¿Eliminar «${pendingDelete.name}»? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => {
          const program = pendingDelete;
          setPendingDelete(null);
          setDeleteEmptyOpen(false);
          if (!program) return;
          void (async () => {
            try {
              await onDelete(program.id, { mode: 'PREVIOUS' });
              toast({ title: 'Programa eliminado' });
            } catch (e) {
              toast({
                title: 'Error',
                description: e instanceof Error ? e.message : 'No se pudo eliminar',
                variant: 'destructive',
              });
            }
          })();
        }}
      />
    </DndContext>
  );
}
