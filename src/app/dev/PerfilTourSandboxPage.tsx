import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PerfilTourDialog } from '@/components/perfil/PerfilTourDialog';
import { PerfilTourVisual } from '@/components/perfil/tour/PerfilTourVisuals';
import { PERFIL_ONBOARDING } from '@/lib/equipo/perfilOnboarding';

/**
 * Preview de la guía profunda de Mi perfil (mocks de UI + callouts).
 * Abrí /dev/perfil-tour — no marca localStorage.
 * El cartel corto de novedades está en /dev/whats-new?id=51.
 */
export default function PerfilTourSandboxPage() {
  const [open, setOpen] = useState(true);
  const tour = PERFIL_ONBOARDING;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Sandbox · /dev/perfil-tour
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Guía · Mi perfil</h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            Así se vería la primera vez que alguien entra a Mi perfil: dibujos de las secciones
            reales con números ámbar que coinciden con los pasos del texto (pasá el mouse por un paso
            y se resalta su número). El cartel de novedades (corto) es otra cosa — abajo el link.
            Acá no marca “ya lo vi”.
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
              to="/dev/whats-new?id=51"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Cartel corto (novedades v1.69)
            </Link>
            <Link
              to="/perfil"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Ir a Mi perfil
            </Link>
            <Link
              to="/dev/corcho"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Sandbox Corcho
            </Link>
          </div>
        </header>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          <p className="font-medium text-amber-200">Flujo propuesto</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-amber-100/70">
            <li>Deploy → cartel de novedades corto (Mi perfil + Corcho + “la guía está al entrar”).</li>
            <li>Primera visita a /perfil → esta guía con mocks y callouts.</li>
            <li>Corcho: se entiende desde la última slide + el cartel; tour propio después si hace falta.</li>
          </ol>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {tour.slides.map((slide, i) => (
            <article
              key={slide.heading}
              className="overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/80 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]"
            >
              <div className="relative aspect-[640/460] overflow-hidden border-b border-white/5">
                <PerfilTourVisual id={slide.visual} />
              </div>
              <div className="space-y-2.5 px-5 pb-5 pt-4">
                <p className="text-xs text-zinc-500">
                  {i + 1} · {slide.donde}
                </p>
                <h2 className="text-[1.2rem] font-semibold leading-tight tracking-tight text-white text-balance">
                  {slide.heading}
                </h2>
                <p className="text-[0.875rem] leading-relaxed text-zinc-300">{slide.lead}</p>
                <ol className="space-y-1.5">
                  {slide.pasos.map((paso, n) => (
                    <li key={paso} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-zinc-400">
                      <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-zinc-950">
                        {n + 1}
                      </span>
                      {paso}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      </div>

      <PerfilTourDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
