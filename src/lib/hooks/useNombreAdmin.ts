import { useEffect, useState } from 'react';
import { FALLBACK_NOMBRE_ADMIN, nombreAdminEquipo } from '@/lib/equipo/admin';
import { getMiembrosEquipo } from '@/lib/supabase/services/equipo.service';

const TTL_MS = 5 * 60_000;
let cache: { nombre: string; at: number } | null = null;
let inflight: Promise<string> | null = null;

async function cargarNombreAdmin(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.nombre;
  if (!inflight) {
    inflight = getMiembrosEquipo()
      .then((m) => {
        const nombre = nombreAdminEquipo(m);
        cache = { nombre, at: Date.now() };
        return nombre;
      })
      .catch(() => FALLBACK_NOMBRE_ADMIN)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Nombre del/los admin activos para textos ("Pedile a …"). Fallback "el admin" (EQ-R27). */
export function useNombreAdmin(): string {
  const [nombre, setNombre] = useState(cache?.nombre ?? FALLBACK_NOMBRE_ADMIN);
  useEffect(() => {
    let vivo = true;
    void cargarNombreAdmin().then((n) => {
      if (vivo) setNombre(n);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return nombre;
}
