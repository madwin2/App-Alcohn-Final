import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import {
  PROGRAMAS_ONBOARDING,
  type ProgramasOnboardingSlide,
  type ProgramasTourVisualId,
} from '@/lib/programas/onboarding';
import { ProgramasTourVisual } from './tour/ProgramasTourVisuals';

interface ProgramasTourDialogProps {
  open: boolean;
  onClose: () => void;
  slides?: ProgramasOnboardingSlide[];
  introHeading?: string;
  introBody?: string;
  introImage?: string;
}

type Page =
  | { key: string; kind: 'intro'; heading: string; body: string; image: string }
  | { key: string; kind: 'feature'; heading: string; body: string; visual: ProgramasTourVisualId };

export function ProgramasTourDialog({
  open,
  onClose,
  slides = [...PROGRAMAS_ONBOARDING.slides],
  introHeading = PROGRAMAS_ONBOARDING.introHeading,
  introBody = PROGRAMAS_ONBOARDING.introBody,
  introImage = PROGRAMAS_ONBOARDING.introImage,
}: ProgramasTourDialogProps) {
  const [index, setIndex] = useState(0);

  const pages: Page[] = [
    {
      key: 'intro',
      kind: 'intro',
      heading: introHeading,
      body: introBody,
      image: introImage,
    },
    ...slides.map((slide, i) => ({
      key: `feature-${i}`,
      kind: 'feature' as const,
      heading: slide.heading,
      body: slide.body,
      visual: slide.visual,
    })),
  ];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (slides.length === 0) return null;

  const safeIndex = Math.min(index, pages.length - 1);
  const isLast = safeIndex >= pages.length - 1;
  const page = pages[safeIndex];

  const goTo = (next: number) => {
    if (next < 0 || next >= pages.length) return;
    setIndex(next);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'flex h-[min(100dvh-2rem,32rem)] w-[min(100vw-1.5rem,52rem)] flex-col',
            'overflow-hidden rounded-[22px] border border-white/10 bg-zinc-950',
            'shadow-[0_28px_70px_-16px_rgba(0,0,0,0.9)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none focus:outline-none',
          )}
        >
          <DialogTitle className="sr-only">{page.heading}</DialogTitle>
          <DialogDescription className="sr-only">{page.body}</DialogDescription>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(11rem,1fr)_auto] md:grid-cols-[1.15fr_0.85fr] md:grid-rows-none">
            <div className="relative min-h-0 overflow-hidden border-b border-white/5 bg-zinc-950 md:border-b-0 md:border-r">
              {page.kind === 'intro' ? (
                <ProgramasTourVisual key={page.key} id="intro" />
              ) : (
                <ProgramasTourVisual id={page.visual} />
              )}
            </div>

            <div className="flex min-h-0 flex-col justify-between gap-4 p-5 sm:p-6">
              <div key={page.key} className="vt-copy-in space-y-2.5">
                <p className="text-[1.35rem] font-semibold leading-[1.15] tracking-tight text-white text-balance sm:text-[1.5rem]">
                  {page.heading}
                </p>
                <p className="text-[0.8125rem] leading-relaxed text-zinc-400 sm:text-[0.875rem]">
                  {page.body}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  {pages.map((p, i) => {
                    const canGoBack = i < safeIndex;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        disabled={!canGoBack}
                        onClick={() => goTo(i)}
                        aria-label={canGoBack ? `Volver a la slide ${i + 1}` : undefined}
                        aria-current={i === safeIndex ? 'step' : undefined}
                        className={cn(
                          'rounded-full transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                          i === safeIndex
                            ? 'h-2 w-5 bg-white'
                            : canGoBack
                              ? 'h-1.5 w-1.5 bg-white/40 hover:bg-white/70'
                              : 'h-1.5 w-1.5 cursor-default bg-white/20',
                        )}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5">
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
            @keyframes vt-media-in {
              from { opacity: 0; transform: translateY(4px) scale(0.985); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes vt-copy-in {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .vt-media-in { animation: vt-media-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
            .vt-copy-in { animation: vt-copy-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
            @media (prefers-reduced-motion: reduce) {
              .vt-media-in, .vt-copy-in { animation: none !important; }
            }
          `}</style>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
