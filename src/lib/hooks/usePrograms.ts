import { useState, useEffect, useCallback, useRef } from 'react';
import { FabricationState, Program, ProgramMachineType, ProgramStamp } from '../types/index';
import * as programsService from '../supabase/services/programs.service';
import { generateAndDownloadProgramPackage } from '../programas/packageZip';
import { supabase } from '../supabase/client';

const REALTIME_DEBOUNCE_MS = 400;

export const usePrograms = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPrograms = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await programsService.getPrograms();
      setPrograms(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error al cargar programas'));
      console.error('Error fetching programs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrograms();
  }, [fetchPrograms]);

  // Realtime: cambios en programas o sellos (asignación / dirty) desde esta u otra PC
  useEffect(() => {
    const scheduleRefresh = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        realtimeTimerRef.current = null;
        void fetchPrograms({ silent: true });
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('programs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'programa' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sellos' },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchPrograms]);

  // Al volver a la pestaña visible, refrescar por si se perdió un evento realtime
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchPrograms({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchPrograms]);

  const createProgram = async (program: Partial<Program>): Promise<Program> => {
    const newProgram = await programsService.createProgram(program);
    await fetchPrograms({ silent: true });
    return newProgram;
  };

  const updateProgram = async (programId: string, updates: Partial<Program>): Promise<Program> => {
    const updatedProgram = await programsService.updateProgram(programId, updates);
    setPrograms((prev) => prev.map((p) => (p.id === programId ? updatedProgram : p)));
    return updatedProgram;
  };

  const setFabricationStateForProgram = async (
    programId: string,
    state: FabricationState,
  ): Promise<Program> => {
    const updated = await programsService.setFabricationStateForProgram(programId, state);
    setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
    return updated;
  };

  const deleteProgram = async (
    programId: string,
    options?: {
      restoreMode?: programsService.RemoveStampRestoreMode;
      newFabricationState?: FabricationState;
    },
  ): Promise<void> => {
    await programsService.deleteProgram(programId, options);
    setPrograms((prev) => prev.filter((p) => p.id !== programId));
  };

  const addStamps = async (
    programId: string,
    stampIds: string[],
  ): Promise<Program> => {
    const updated = await programsService.addStampsToProgram(programId, stampIds);
    setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
    return updated;
  };

  const removeStamp = async (
    programId: string,
    stampId: string,
    options: {
      restoreMode: programsService.RemoveStampRestoreMode;
      newFabricationState?: FabricationState;
    },
  ): Promise<void> => {
    const updated = await programsService.removeStampFromProgram(programId, stampId, options);
    if (updated) {
      setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
    } else {
      await fetchPrograms({ silent: true });
    }
  };

  const lockProgram = async (programId: string): Promise<void> => {
    const updated = await programsService.lockProgram(programId);
    setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
  };

  const unlockProgram = async (programId: string): Promise<void> => {
    const updated = await programsService.unlockProgram(programId);
    setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
  };

  const downloadPackage = async (programId: string): Promise<void> => {
    await generateAndDownloadProgramPackage(programId);
    try {
      const updated = await programsService.lockProgram(programId);
      setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
    } catch (e) {
      console.warn('Paquete descargado pero no se pudo bloquear automáticamente:', e);
      await fetchPrograms({ silent: true });
    }
  };

  const getEligibleStamps = async (
    machine: ProgramMachineType,
    excludeStampIds?: string[],
  ): Promise<ProgramStamp[]> => {
    return programsService.getEligibleStamps({ machine, excludeStampIds });
  };

  return {
    programs,
    loading,
    error,
    fetchPrograms,
    createProgram,
    updateProgram,
    setFabricationStateForProgram,
    deleteProgram,
    addStamps,
    removeStamp,
    lockProgram,
    unlockProgram,
    downloadPackage,
    getEligibleStamps,
  };
};
