import { useCallback, useEffect, useState } from 'react';
import { VectorizarTourDialog } from '@/components/vectorizacion/VectorizarTourDialog';
import {
  markVectorizarOnboardingSeen,
  wasVectorizarOnboardingSeen,
} from '@/lib/vectorizacion/onboarding';

const SHOW_DELAY_MS = 600;

/** Primera visita a Vectorizar: abre el tour y lo marca al cerrar. */
export function VectorizarOnboardingHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (wasVectorizarOnboardingSeen()) return;
    const timeout = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markVectorizarOnboardingSeen();
  }, []);

  return <VectorizarTourDialog open={open} onClose={close} />;
}
