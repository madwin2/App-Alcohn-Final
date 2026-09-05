import { useState, useEffect, useCallback } from 'react';
import { FabricationState, Program, ProgramMachineType, ProgramStamp } from '../types/index';
import * as programsService from '../supabase/services/programs.service';
import { generateAndDownloadProgramPackage } from '../programas/packageZip';

export const usePrograms = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPrograms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await programsService.getPrograms();
      setPrograms(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error al cargar programas'));
      console.error('Error fetching programs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const createProgram = async (program: Partial<Program>): Promise<Program> => {
    const newProgram = await programsService.createProgram(program);
    await fetchPrograms();
    return newProgram;
  };

  const updateProgram = async (programId: string, updates: Partial<Program>): Promise<Program> => {
    const updatedProgram = await programsService.updateProgram(programId, updates);
    await fetchPrograms();
    return updatedProgram;
  };

  const deleteProgram = async (
    programId: string,
    options?: {
      restoreMode?: programsService.RemoveStampRestoreMode;
      newFabricationState?: FabricationState;
    },
  ): Promise<void> => {
    await programsService.deleteProgram(programId, options);
    await fetchPrograms();
  };

  const addStamps = async (
    programId: string,
    stampIds: string[],
    options?: { confirmMachineOverride?: boolean },
  ): Promise<Program> => {
    const updated = await programsService.addStampsToProgram(programId, stampIds, options);
    await fetchPrograms();
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
    await programsService.removeStampFromProgram(programId, stampId, options);
    await fetchPrograms();
  };

  const lockProgram = async (programId: string): Promise<void> => {
    await programsService.lockProgram(programId);
    await fetchPrograms();
  };

  const unlockProgram = async (programId: string): Promise<void> => {
    await programsService.unlockProgram(programId);
    await fetchPrograms();
  };

  const downloadPackage = async (programId: string): Promise<void> => {
    await generateAndDownloadProgramPackage(programId);
    // Al confirmar descarga, bloquear el programa (sección 5 del plan)
    try {
      await programsService.lockProgram(programId);
    } catch (e) {
      console.warn('Paquete descargado pero no se pudo bloquear automáticamente:', e);
    }
    await fetchPrograms();
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
    deleteProgram,
    addStamps,
    removeStamp,
    lockProgram,
    unlockProgram,
    downloadPackage,
    getEligibleStamps,
  };
};
