import { useState, useEffect } from 'react';
import { Program } from '../types/index';
import * as programsService from '../supabase/services/programs.service';

export const usePrograms = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPrograms = async () => {
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
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const createProgram = async (program: Partial<Program>): Promise<Program> => {
    try {
      const newProgram = await programsService.createProgram(program);
      await fetchPrograms(); // Refrescar lista
      return newProgram;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al crear programa');
      setError(error);
      throw error;
    }
  };

  const updateProgram = async (programId: string, updates: Partial<Program>): Promise<Program> => {
    try {
      const updatedProgram = await programsService.updateProgram(programId, updates);
      await fetchPrograms(); // Refrescar lista
      return updatedProgram;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al actualizar programa');
      setError(error);
      throw error;
    }
  };

  const deleteProgram = async (programId: string): Promise<void> => {
    try {
      await programsService.deleteProgram(programId);
      await fetchPrograms(); // Refrescar lista
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al eliminar programa');
      setError(error);
      throw error;
    }
  };

  return {
    programs,
    loading,
    error,
    fetchPrograms,
    createProgram,
    updateProgram,
    deleteProgram,
  };
};









