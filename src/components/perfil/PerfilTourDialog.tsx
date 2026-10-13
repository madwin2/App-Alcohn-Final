import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, MapPin } from 'lucide-react';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { PERFIL_ONBOARDING, type PerfilOnboardingSlide } from '@/lib/equipo/perfilOnboarding';
import { PerfilTourVisual } from './tour/PerfilTourVisuals';

interface PerfilTourDialogProps {
  open: boolean;
  onClose: () => void;
  slides?: PerfilOnboardingSlide[];
}

export function PerfilTourDialog({ open, onClose, slides = [...PERFIL_ONBOARDING.slides] }: PerfilTourDialogProps) {
  const [index, setIndex] = useState(0);
  const [pasoActivo, setPasoActivo] = useState<number | null>(null);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    setPasoActivo(null);
  }, [index]);

  const total = slides.length;
  const safeIndex = Math.min(index, Math.max(total - 1, 0));
  const isLast = safeIndex >= total - 1;

  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    setIndex(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, total]);

  if (total === 0) return null;
  const slide = slides[safeIndex];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'flex h-[min(100dvh-1.5rem,40rem)] w-[min(100vw-1.5rem,68rem)] flex-col',
            'overflow-hidden rounded-[22px] border border-white/10 bg-zinc-950',
            'shadow-[0_28px_70px_-16px_rgba(0,0,0,0.9)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none focus:outline-none',
          )}
        >
          <DialogTitle className="sr-only">{slide.heading}</DialogTitle>
          <DialogDescription className="sr-only">{slide.lead}</DialogDescription>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(12rem,42%)_1fr] md:grid-cols-[1.45fr_1fr] md:grid-rows-none">
            {/* Dibujo de la pantalla */}
            <div className="relative flex min-h-0 flex-col border-b border-white/5 bg-[#0c0c0e] md:border-b-0 md:border-r">
              <div className="flex shrink-0 items-center gap-1.5 px-4 pt-3.5 text-[12px] text-zinc-400 sm:px-5">
                <MapPin className="size-3.5 text-amber-400/90" />
                <span key={slide.donde} className="vt-copy-in truncate">
                  {slide.donde}
                </span>
              </div>
              <div className="min-h-0 flex-1 p-2 sm:p-3">
                <PerfilTourVisual id={slide.visual} pasoActivo={pasoActivo} />
              </div>
            </div>

            {/* Texto */}
            <div className="flex min-h-0 flex-col gap-4 p-5 sm:p-7">
              <div key={slide.heading} className="vt-copy-in min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-2 -mx-2">
                <div className="space-y-2">
                  <p className="text-[12px] tabular-nums text-zinc-500">
                    {safeIndex + 1} de {total}
                  </p>
                  <h2 className="text-[1.4rem] font-semibold leading-[1.15] tracking-tight text-white text-balance sm:text-[1.6rem]">
                    {slide.heading}
                  </h2>
                  <p className="text-[0.875rem] leading-relaxed text-zinc-300 sm:text-[0.9375rem]">{slide.lead}</p>
                </div>

                <ol className="space-y-1" onMouseLeave={() => setPasoActivo(null)}>
                  {slide.pasos.map((paso, i) => {
                    const n = i + 1;
                    return (
                      <li
                        key={paso}
                        onMouseEnter={() => setPasoActivo(n)}
                        className={cn(
                          '-mx-2 flex cursor-default gap-3 rounded-xl px-2 py-1.5 transition-colors',
                          pasoActivo === n && 'bg-white/[0.04]',
                        )}
                      >
                        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-zinc-950">
                          {n}
                        </span>
                        <span className="text-[0.8125rem] leading-relaxed text-zinc-400 sm:text-[0.875rem]">
                          {paso}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {slides.map((s, i) => (
                    <button
                      key={s.heading}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`Ir a «${s.heading}»`}
                      aria-current={i === safeIndex ? 'step' : undefined}
                      className={cn(
                        'rounded-full transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                        i === safeIndex ? 'h-2 w-5 bg-white' : 'h-1.5 w-1.5 bg-white/25 hover:bg-white/60',
                      )}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  {safeIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => goTo(safeIndex - 1)}
                      aria-label="Anterior"
                      className="inline-flex size-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  ) : null}
                  {!isLast ? (
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    >
                      Saltar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => (isLast ? onClose() : goTo(safeIndex + 1))}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    {isLast ? 'Entendido' : 'Siguiente'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <style>{`
            @keyframes vt-copy-in {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .vt-copy-in { animation: vt-copy-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
            @media (prefers-reduced-motion: reduce) {
              .vt-copy-in { animation: none !important; }
            }
          `}</style>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
