import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { getLatestChangelogEntry, type ChangelogEntry } from '@/lib/changelog/entries';
import { getUltimoVisto, marcarVisto } from '@/lib/supabase/services/changelog.service';

/** Para que el carrusel no salte antes de que la pantalla termine de pintarse. */
const SHOW_DELAY_MS = 800;

interface UseWhatsNewOptions {
  /** En false no se resuelve nada (ej. hay una actualización pendiente o está en /login). */
  enabled: boolean;
}

export interface WhatsNew {
  entry: ChangelogEntry | null;
  open: boolean;
  /** Cierra el carrusel y marca la tanda como vista. */
  close: () => void;
}

/**
 * Resuelve si al usuario le corresponde ver la última tanda de novedades.
 * Solo se muestra la más reciente sin ver, no todas las acumuladas.
 */
export function useWhatsNew({ enabled }: UseWhatsNewOptions): WhatsNew {
  const { user, loading: authLoading } = useAuth();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);
  const [open, setOpen] = useState(false);
  const resolvedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || authLoading || !user?.id) return;
    if (resolvedForRef.current === user.id) return;

    const latest = getLatestChangelogEntry();
    if (!latest) return;

    resolvedForRef.current = user.id;
    let timeout = 0;
    let cancelled = false;

    getUltimoVisto(user.id)
      .then((ultimoVisto) => {
        if (cancelled || latest.id <= ultimoVisto) return;
        timeout = window.setTimeout(() => {
          setEntry(latest);
          setOpen(true);
        }, SHOW_DELAY_MS);
      })
      .catch(() => {
        // Sin dato de "visto" preferimos no interrumpir con el carrusel.
        resolvedForRef.current = null;
      });

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [enabled, authLoading, user?.id]);

  const close = useCallback(() => {
    setOpen(false);
    const userId = user?.id;
    const entryId = entry?.id;
    if (!userId || !entryId) return;
    marcarVisto(userId, entryId).catch(() => {
      // Si falla, vuelve a aparecer en la próxima sesión: preferible a perder el aviso.
    });
  }, [entry?.id, user?.id]);

  return { entry, open, close };
}
