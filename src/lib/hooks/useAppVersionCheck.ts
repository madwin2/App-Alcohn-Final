import { useCallback, useEffect, useRef, useState } from 'react';

const VERSION_URL = '/version.json';
const POLL_INTERVAL_MS = 10 * 60 * 1000;
/** Al volver a la pestaña, no se repite el fetch si ya se hizo hace menos de esto. */
const VISIBILITY_THROTTLE_MS = 60 * 1000;
const SNOOZE_MS = 30 * 60 * 1000;
const SNOOZE_KEY = 'app_update_snooze_until';

interface BuildInfo {
  version: string;
  builtAt: string | null;
}

/**
 * `fresh` fuerza saltear cualquier caché (navegador o CDN) para leer la versión
 * que hay ahora mismo en el servidor; sin él se lee la del build de esta pestaña.
 */
async function fetchBuildInfo(fresh: boolean): Promise<BuildInfo | null> {
  try {
    const res = fresh
      ? await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
      : await fetch(VERSION_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<BuildInfo> | null;
    if (!data || typeof data.version !== 'string' || !data.version) return null;
    return {
      version: data.version,
      builtAt: typeof data.builtAt === 'string' ? data.builtAt : null,
    };
  } catch {
    return null;
  }
}

function readSnoozedUntil(): number {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return 0;
    const until = Number(raw);
    return Number.isFinite(until) && until > Date.now() ? until : 0;
  } catch {
    return 0;
  }
}

export interface AppVersionCheck {
  /** Hay un build nuevo y el aviso no está posponido: corresponde mostrar el diálogo. */
  updateAvailable: boolean;
  /** Hay un build nuevo, incluso si el aviso está posponido. */
  isOutdated: boolean;
  /** Fecha ISO del build nuevo. */
  builtAt: string | null;
  dismiss: () => void;
  applyUpdate: () => void;
}

/**
 * Detecta que la pestaña quedó corriendo un build viejo comparando /version.json
 * (el que se cargó al abrir la app vs. el que hay ahora en el servidor).
 * Se monta una sola vez por pestaña.
 */
export function useAppVersionCheck(): AppVersionCheck {
  const loadedVersionRef = useRef<string | null>(null);
  const lastCheckRef = useRef(0);
  const [newBuild, setNewBuild] = useState<BuildInfo | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState(readSnoozedUntil);

  const check = useCallback(async () => {
    const loaded = loadedVersionRef.current;
    if (!loaded) return;
    lastCheckRef.current = Date.now();
    const current = await fetchBuildInfo(true);
    if (!current) return;
    setNewBuild((prev) => {
      if (current.version === loaded) return null;
      return prev?.version === current.version ? prev : current;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBuildInfo(false).then((info) => {
      if (cancelled || !info) return;
      loadedVersionRef.current = info.version;
      lastCheckRef.current = Date.now();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckRef.current < VISIBILITY_THROTTLE_MS) return;
      check();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [check]);

  // Al vencer el "recordar más tarde" el aviso vuelve solo, sin esperar el próximo poll.
  useEffect(() => {
    if (!snoozedUntil) return;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) {
      setSnoozedUntil(0);
      return;
    }
    const timeout = window.setTimeout(() => setSnoozedUntil(0), remaining);
    return () => window.clearTimeout(timeout);
  }, [snoozedUntil]);

  const dismiss = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    try {
      localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      // Sin localStorage el snooze dura lo que dure la pestaña.
    }
    setSnoozedUntil(until);
  }, []);

  const applyUpdate = useCallback(() => {
    try {
      localStorage.removeItem(SNOOZE_KEY);
    } catch {
      // Ignorado: la recarga descarta el estado igual.
    }
    window.location.assign('/');
  }, []);

  return {
    updateAvailable: !!newBuild && !snoozedUntil,
    isOutdated: !!newBuild,
    builtAt: newBuild?.builtAt ?? null,
    dismiss,
    applyUpdate,
  };
}
