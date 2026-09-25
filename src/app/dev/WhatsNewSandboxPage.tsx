import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { WhatsNewDialog } from '@/components/global/WhatsNewDialog';
import {
  CHANGELOG_ENTRIES,
  getLatestChangelogEntry,
  type ChangelogEntry,
} from '@/lib/changelog/entries';
import { changelogToTourContent } from '@/lib/changelog/toTourContent';

/**
 * Preview del cartel de novedades (CHANGELOG_ENTRIES).
 * Abrí /dev/whats-new — no marca visto en Supabase.
 * `?slide=1` abre en una novedad (0 = intro). `?id=14` elige entrada.
 */
export default function WhatsNewSandboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const startAt = useMemo(() => {
    const raw = Number(searchParams.get('slide') ?? 0);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  }, [searchParams]);

  const selectedId = useMemo(() => {
    const raw = Number(searchParams.get('id'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
  }, [searchParams]);

  const entry: ChangelogEntry | null = useMemo(() => {
    if (selectedId != null) {
      return CHANGELOG_ENTRIES.find((e) => e.id === selectedId) ?? getLatestChangelogEntry();
    }
    return getLatestChangelogEntry();
  }, [selectedId]);

  const [open, setOpen] = useState(true);
  const content = entry ? changelogToTourContent(entry) : null;
  const latest = getLatestChangelogEntry();

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Sandbox · /dev/whats-new</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Novedades {entry ? `· v${entry.version}` : ''}
            </h1>
            {latest && entry?.id === latest.id ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                Pendiente de publicar
              </span>
            ) : null}
          </div>
          <p className="max-w-xl text-sm text-zinc-400">
            Así lo va a ver el equipo la próxima vez que entre después del deploy. El modal se abre
            solo; abajo las tarjetas sueltas. No marca “ya lo vi” en la base.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              {open ? 'Modal abierto' : 'Abrir modal'}
            </button>
            <Link
              to="/dev/programas-tour"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Guía Programas
            </Link>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {[...CHANGELOG_ENTRIES].reverse().slice(0, 8).map((e) => {
            const active = entry?.id === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setSearchParams({ id: String(e.id) });
                  setOpen(true);
                }}
                className={
                  active
                    ? 'rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black'
                    : 'rounded-full border border-white/15 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/30 hover:text-white'
                }
              >
                v{e.version}
                <span className="ml-1.5 text-[10px] opacity-60">{e.date}</span>
              </button>
            );
          })}
        </div>

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

      <WhatsNewDialog
        content={content}
        open={open && !!content}
        onClose={() => setOpen(false)}
        startAt={startAt}
      />
    </div>
  );
}
