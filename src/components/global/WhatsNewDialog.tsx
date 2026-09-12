import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ChangelogEntry } from '@/lib/changelog/entries';
import { cn } from '@/lib/utils/cn';

interface WhatsNewDialogProps {
  entry: ChangelogEntry | null;
  open: boolean;
  /** Cualquier forma de cerrar equivale a "ya me enteré": marca la tanda como vista. */
  onClose: () => void;
}

/** Carrusel de novedades de la última tanda publicada. */
export function WhatsNewDialog({ entry, open, onClose }: WhatsNewDialogProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [entry?.id]);

  if (!entry || entry.slides.length === 0) return null;

  const slide = entry.slides[Math.min(index, entry.slides.length - 1)];
  const isLast = index >= entry.slides.length - 1;
  const Icon = slide.icon ?? Sparkles;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn(
          'max-w-md gap-0 p-0',
          'sm:rounded-[20px] border-white/10',
          'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
          'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm',
        )}
      >
        <div className="p-5 pb-0">
          <div
            className={cn(
              'relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl',
              'border border-white/[0.06] bg-white/[0.03]',
            )}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.07),transparent_65%)]"
              aria-hidden
            />
            {slide.image ? (
              <img src={slide.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] shadow-inner"
                aria-hidden
              >
                <Icon className="h-8 w-8 text-white/90" strokeWidth={1.5} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-5 pt-5">
          <DialogTitle className="text-lg font-semibold tracking-tight text-white">{slide.heading}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">{slide.body}</DialogDescription>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-1.5" aria-hidden>
            {entry.slides.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-full transition-all duration-200',
                  i === index ? 'h-2 w-2 bg-white' : 'h-1.5 w-1.5 bg-white/20',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Saltar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : setIndex((prev) => prev + 1))}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {isLast ? 'Entendido' : 'Siguiente'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
