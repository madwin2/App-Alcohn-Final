import { useLocation } from 'react-router-dom';
import { AppUpdateDialog } from '@/components/global/AppUpdateDialog';
import { WhatsNewDialog } from '@/components/global/WhatsNewDialog';
import { getLatestChangelogEntry } from '@/lib/changelog/entries';
import { useAppVersionCheck } from '@/lib/hooks/useAppVersionCheck';
import { useWhatsNew } from '@/lib/hooks/useWhatsNew';

/**
 * Coordina los dos avisos globales para que nunca se muestren a la vez: mientras
 * la pestaña corra un build viejo se prioriza "Actualizar ahora", porque el usuario
 * todavía no está corriendo la versión que trae las novedades.
 */
export function AppUpdatesHost() {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';

  const { updateAvailable, isOutdated, dismiss, applyUpdate } = useAppVersionCheck();
  const whatsNew = useWhatsNew({ enabled: !isOutdated && !isLoginRoute });
  const displayVersion = getLatestChangelogEntry()?.version ?? null;

  return (
    <>
      <AppUpdateDialog
        open={updateAvailable && !isLoginRoute}
        version={displayVersion}
        onSnooze={dismiss}
        onUpdate={applyUpdate}
      />
      <WhatsNewDialog
        entry={whatsNew.entry}
        open={whatsNew.open && !isOutdated && !isLoginRoute}
        onClose={whatsNew.close}
      />
    </>
  );
}
