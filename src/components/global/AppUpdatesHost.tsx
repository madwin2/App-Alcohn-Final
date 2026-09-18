import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AppUpdateDialog } from '@/components/global/AppUpdateDialog';
import { WhatsNewDialog } from '@/components/global/WhatsNewDialog';
import { getLatestChangelogEntry } from '@/lib/changelog/entries';
import { changelogToTourContent } from '@/lib/changelog/toTourContent';
import { useAppVersionCheck } from '@/lib/hooks/useAppVersionCheck';
import { useAuth } from '@/lib/hooks/useAuth';
import { useWhatsNew } from '@/lib/hooks/useWhatsNew';
import { isFbTestUser } from '@/lib/auth/access';

/**
 * Coordina los dos avisos globales para que nunca se muestren a la vez: mientras
 * la pestaña corra un build viejo se prioriza "Actualizar ahora", porque el usuario
 * todavía no está corriendo la versión que trae las novedades.
 */
export function AppUpdatesHost() {
  const location = useLocation();
  const { user } = useAuth();
  const isSandboxRoute = location.pathname === '/login' || location.pathname === '/stock-pendiente';
  const isReviewerAccount = isFbTestUser(user);

  const { updateAvailable, isOutdated, dismiss, applyUpdate } = useAppVersionCheck();
  const whatsNew = useWhatsNew({ enabled: !isOutdated && !isSandboxRoute && !isReviewerAccount });
  const displayVersion = getLatestChangelogEntry()?.version ?? null;
  const tourContent = useMemo(
    () => (whatsNew.entry ? changelogToTourContent(whatsNew.entry) : null),
    [whatsNew.entry],
  );

  return (
    <>
      <AppUpdateDialog
        open={updateAvailable && !isSandboxRoute && !isReviewerAccount}
        version={displayVersion}
        onSnooze={dismiss}
        onUpdate={applyUpdate}
      />
      <WhatsNewDialog
        content={tourContent}
        open={whatsNew.open && !isOutdated && !isSandboxRoute && !isReviewerAccount}
        onClose={whatsNew.close}
      />
    </>
  );
}
