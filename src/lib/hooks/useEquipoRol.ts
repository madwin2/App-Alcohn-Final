import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  getMiPerfil,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service';

type CacheEntry = {
  userId: string;
  perfil: PerfilEquipo | null;
  loadedAt: number;
};

let memoryCache: CacheEntry | null = null;

/** Invalida el cache del hook (llamar tras upsert/desactivar del propio perfil). */
export function invalidateEquipoRolCache(userId?: string): void {
  if (!userId || memoryCache?.userId === userId) {
    memoryCache = null;
  }
}

/**
 * Rol y perfil del usuario logueado. El control real es la RLS;
 * este hook solo decide qué se muestra en la UI.
 */
export function useEquipoRol(): {
  perfil: PerfilEquipo | null;
  esAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [perfil, setPerfil] = useState<PerfilEquipo | null>(() =>
    userId && memoryCache?.userId === userId ? memoryCache.perfil : null,
  );
  const [loading, setLoading] = useState(!memoryCache || memoryCache.userId !== userId);

  const load = useCallback(async () => {
    if (!userId) {
      setPerfil(null);
      setLoading(false);
      memoryCache = null;
      return;
    }
    if (memoryCache?.userId === userId) {
      setPerfil(memoryCache.perfil);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = await getMiPerfil(userId);
      memoryCache = { userId, perfil: p, loadedAt: Date.now() };
      setPerfil(p);
    } catch (err) {
      console.error('useEquipoRol:', err);
      setPerfil(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    if (userId) invalidateEquipoRolCache(userId);
    await load();
  }, [load, userId]);

  return {
    perfil,
    esAdmin: Boolean(perfil?.esAdmin && perfil?.activo),
    loading,
    refresh,
  };
}
