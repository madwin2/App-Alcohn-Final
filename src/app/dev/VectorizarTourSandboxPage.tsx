import { useState } from 'react';
import { VectorizarTourDialog } from '@/components/vectorizacion/VectorizarTourDialog';
import { TourVisual } from '@/components/vectorizacion/tour/TourVisuals';
import { VECTORIZAR_ONBOARDING } from '@/lib/vectorizacion/onboarding';

/**
 * Preview del tour de primera visita a Vectorizar.
 * Abrí /dev/vectorizar-tour — no marca localStorage.
 */
export default function VectorizarTourSandboxPage() {
  const [open, setOpen] = useState(true);
  const tour = VECTORIZAR_ONBOARDING;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Sandbox · /dev/vectorizar-tour
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Tour · Vectorizar</h1>
          <p className="max-w-xl text-sm text-zinc-400">
            Mocks de UI (no screenshots). Primera visita a Vectorización. Acá no marca “ya lo vi”.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            {open ? 'Modal abierto' : 'Abrir modal'}
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {tour.slides.map((slide) => (
            <article
              key={slide.heading}
              className="overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/80 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]"
            >
              <div className="relative aspect-[16/11] overflow-hidden border-b border-white/5">
                <TourVisual id={slide.visual} />
              </div>
              <div className="space-y-1.5 px-5 pb-5 pt-4">
                <h2 className="text-[1.2rem] font-semibold leading-tight tracking-tight text-white text-balance">
                  {slide.heading}
                </h2>
                <p className="text-[0.8125rem] leading-relaxed text-zinc-400">{slide.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <VectorizarTourDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
