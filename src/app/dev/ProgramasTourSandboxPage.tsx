import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProgramasTourDialog } from '@/components/programas/ProgramasTourDialog';
import { ProgramasTourVisual } from '@/components/programas/tour/ProgramasTourVisuals';
import { PROGRAMAS_ONBOARDING } from '@/lib/programas/onboarding';

/**
 * Guía de uso del tarjetero de Programas.
 * Abrí /dev/programas-tour — no marca nada como visto.
 */
export default function ProgramasTourSandboxPage() {
  const [open, setOpen] = useState(true);
  const tour = PROGRAMAS_ONBOARDING;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Sandbox · /dev/programas-tour
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Guía · Programas</h1>
          <p className="max-w-xl text-sm text-zinc-400">
            Explicación completa del tarjetero: bolsillos, estados, vectores, drag y Terminados.
            Mocks con assets reales de la app. Acá no marca “ya lo vi”.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              {open ? 'Modal abierto' : 'Abrir guía'}
            </button>
            <Link
              to="/dev/whats-new"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Ver novedades v1.32
            </Link>
            <Link
              to="/programas"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Ir a Programas
            </Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {tour.slides.map((slide) => (
            <article
              key={slide.heading}
              className="overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/80 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]"
            >
              <div className="relative aspect-[16/11] overflow-hidden border-b border-white/5">
                <ProgramasTourVisual id={slide.visual} />
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

      <ProgramasTourDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
