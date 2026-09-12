import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import type { ChangelogEntry, ChangelogSlide } from '@/lib/changelog/entries';
import { cn } from '@/lib/utils/cn';

const DEFAULT_COVER = '/changelog/1/hero.jpg';

/** Grain SVG (feTurbulence) para el fondo de las slides de novedad. */
const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

interface WhatsNewDialogProps {
  entry: ChangelogEntry | null;
  open: boolean;
  /** Saltar / Entendido: marca la tanda como vista. */
  onClose: () => void;
}

interface CarouselPage {
  key: string;
  kind: 'intro' | 'feature';
  heading: string;
  body: string;
  slide?: ChangelogSlide;
}

function buildPages(entry: ChangelogEntry): CarouselPage[] {
  const intro: CarouselPage = {
    key: 'intro',
    kind: 'intro',
    heading: `Mirá las novedades de la app\nen la versión ${entry.version}`,
    body: 'Te contamos en un minuto qué cambió y para qué te sirve.',
  };
  const features = entry.slides.map((slide, i) => ({
    key: `feature-${i}`,
    kind: 'feature' as const,
    heading: slide.heading,
    body: slide.body,
    slide,
  }));
  return [intro, ...features];
}

/**
 * Carrusel de novedades. Shell de tamaño fijo (horizontal): la cover
 * no se remonta; solo se desliza el contenido y se morphéa blur/glass.
 * Atrás = tocar un puntito anterior (sin botón de volver).
 */
export function WhatsNewDialog({ entry, open, onClose }: WhatsNewDialogProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [entry?.id]);

  const pages = useMemo(() => (entry ? buildPages(entry) : []), [entry]);

  if (!entry || entry.slides.length === 0 || pages.length === 0) return null;

  const safeIndex = Math.min(index, pages.length - 1);
  const isLast = safeIndex >= pages.length - 1;
  const isIntro = safeIndex === 0;
  const cover = entry.coverImage || DEFAULT_COVER;
  const activePage = pages[safeIndex];
  const ActiveIcon = activePage.slide?.icon ?? Sparkles;

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
            'flex w-[min(100vw-1.25rem,34rem)] flex-col',
            'overflow-hidden rounded-[22px] border border-white/10 bg-zinc-950',
            'shadow-[0_28px_70px_-16px_rgba(0,0,0,0.9)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
            'focus:outline-none',
          )}
        >
          {/* Media con un poco más de margen; degradé más largo y suave abajo */}
          <div className="relative px-2 pt-2">
            <div
              className="relative aspect-[16/9] overflow-hidden rounded-t-[18px] bg-zinc-950"
              style={{
                WebkitMaskImage:
                  'linear-gradient(to bottom, #000 0%, #000 58%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.32) 86%, transparent 100%)',
                maskImage:
                  'linear-gradient(to bottom, #000 0%, #000 58%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.32) 86%, transparent 100%)',
              }}
            >
              <img
                src={cover}
                alt=""
                className={cn(
                  'absolute inset-0 h-full w-full object-cover object-center transition-[filter,transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  isIntro ? 'scale-100 blur-0 brightness-100' : 'scale-[1.04] blur-[2.5px] brightness-90',
                )}
              />

              <div
                className={cn(
                  'pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out',
                  isIntro ? 'opacity-0' : 'opacity-100',
                )}
                aria-hidden
              >
                <div className="absolute inset-0 bg-zinc-950/25" />
                <div
                  className="absolute inset-0 opacity-[0.28] mix-blend-overlay"
                  style={{ backgroundImage: NOISE_BG }}
                />
              </div>

              <div
                className={cn(
                  'absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1.4,0.36,1)]',
                  isIntro
                    ? 'pointer-events-none scale-50 opacity-0 rotate-[-12deg]'
                    : 'scale-100 opacity-100 rotate-0',
                )}
              >
                <div
                  key={activePage.key}
                  className={cn(
                    'wn-icon-swap flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.25rem]',
                    'border border-white/30 bg-white/15 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]',
                    'backdrop-blur-md',
                  )}
                  aria-hidden
                >
                  <ActiveIcon className="h-8 w-8 text-white drop-shadow-sm" strokeWidth={1.5} />
                </div>
              </div>
            </div>
          </div>

          <DialogTitle className="sr-only">{activePage.heading}</DialogTitle>
          <DialogDescription className="sr-only">{activePage.body}</DialogDescription>

          <div className="relative -mt-3 h-[8.25rem] overflow-hidden" aria-hidden>
            <div
              className="flex h-full ease-[cubic-bezier(0.22,1.15,0.36,1)] motion-reduce:transition-none"
              style={{
                width: `${pages.length * 100}%`,
                transform: `translateX(-${(safeIndex * 100) / pages.length}%)`,
                transitionProperty: 'transform',
                transitionDuration: '600ms',
              }}
            >
              {pages.map((page) => (
                <div
                  key={page.key}
                  className="flex h-full shrink-0 flex-col justify-start gap-1.5 px-5"
                  style={{ width: `${100 / pages.length}%` }}
                >
                  <p
                    className={cn(
                      'text-left text-[1.7rem] font-semibold leading-[1.12] tracking-tight text-white text-balance',
                      page.kind === 'intro' && 'whitespace-pre-line',
                    )}
                  >
                    {page.heading}
                  </p>
                  <p className="text-left text-[0.8125rem] leading-relaxed text-zinc-400">{page.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-4 pt-2">
            <div className="flex items-center gap-1.5">
              {pages.map((page, i) => {
                const canGoBack = i < safeIndex;
                return (
                  <button
                    key={page.key}
                    type="button"
                    disabled={!canGoBack}
                    onClick={() => goTo(i)}
                    aria-label={canGoBack ? `Volver a la novedad ${i + 1}` : undefined}
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

          <style>{`
            @keyframes wn-icon-swap {
              0% { opacity: 0; transform: scale(0.6) rotate(-10deg); }
              55% { opacity: 1; transform: scale(1.1) rotate(3deg); }
              100% { opacity: 1; transform: scale(1) rotate(0); }
            }
            .wn-icon-swap { animation: wn-icon-swap 0.5s cubic-bezier(0.22, 1.4, 0.36, 1) both; }
            @media (prefers-reduced-motion: reduce) {
              .wn-icon-swap { animation: none !important; }
            }
          `}</style>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
