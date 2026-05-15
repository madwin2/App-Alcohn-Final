import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

interface InnovacionPageLayoutProps {
  children: ReactNode;
}

/**
 * Fondo y capas visuales solo para la ruta /innovacion (no afecta el resto de la app).
 */
export function InnovacionPageLayout({ children }: InnovacionPageLayoutProps) {
  return (
    <TooltipProvider delayDuration={280}>
      <div className="relative min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,rgba(251,191,36,0.14),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.08),transparent_45%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-18%] h-[min(52vh,520px)] w-[min(96vw,880px)] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.11),transparent_68%)] motion-safe:animate-innovacion-ambient motion-reduce:animate-none"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_35%,black,transparent)]"
        />
        <div className="relative z-10">{children}</div>
      </div>
    </TooltipProvider>
  );
}
