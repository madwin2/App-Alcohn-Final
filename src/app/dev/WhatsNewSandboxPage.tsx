import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { WhatsNewDialog } from '@/components/global/WhatsNewDialog';
import { getLatestChangelogEntry } from '@/lib/changelog/entries';
import { changelogToTourContent } from '@/lib/changelog/toTourContent';

/**
 * Preview local del cartel publicado. Usa la misma entrada que la app
 * (CHANGELOG_ENTRIES). Abrí /dev/whats-new para ver el modal y las tarjetas.
 */
export default function WhatsNewSandboxPage() {
  const [open, setOpen] = useState(true);
  const entry = getLatestChangelogEntry();
  const content = entry ? changelogToTourContent(entry) : null;

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Sandbox · /dev/whats-new</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Novedades {entry ? `· v${entry.version}` : ''}
          </h1>
          <p className="max-w-xl text-sm text-zinc-400">
            Misma entrada que va a ver el equipo. El modal se abre solo; abajo están las tarjetas
            sueltas para revisar texto e íconos.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            {open ? 'Modal abierto' : 'Abrir modal'}
          </button>
        </header>

        {entry ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {entry.slides.map((slide) => {
              const Icon = slide.icon ?? Sparkles;
              return (
                <article
                  key={slide.heading}
                  className="overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/80 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]"
                >
                  <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-zinc-950">
                    {entry.coverImage ? (
                      <img
                        src={entry.coverImage}
                        alt=""
                        className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px] brightness-75"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-zinc-950/35" />
                    <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.25rem] border border-white/30 bg-white/15 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md">
                      <Icon className="h-8 w-8 text-white" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div className="space-y-1.5 px-5 pb-5 pt-4">
                    <h2 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-white text-balance">
                      {slide.heading}
                    </h2>
                    <p className="text-[0.8125rem] leading-relaxed text-zinc-400">{slide.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No hay entradas en CHANGELOG_ENTRIES.</p>
        )}
      </div>

      <WhatsNewDialog content={content} open={open && !!content} onClose={() => setOpen(false)} />
    </div>
  );
}
