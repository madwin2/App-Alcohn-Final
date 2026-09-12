import { useLocation } from 'react-router-dom';
import { AppUpdateDialog } from '@/components/global/AppUpdateDialog';
import { WhatsNewDialog } from '@/components/global/WhatsNewDialog';
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

  const { updateAvailable, isOutdated, builtAt, dismiss, applyUpdate } = useAppVersionCheck();
  const whatsNew = useWhatsNew({ enabled: !isOutdated && !isLoginRoute });

  return (
    <>
      <AppUpdateDialog
        open={updateAvailable && !isLoginRoute}
        builtAt={builtAt}
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
