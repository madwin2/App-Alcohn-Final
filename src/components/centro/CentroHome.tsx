import { Link } from 'react-router-dom';
import {
  BookOpen,
  Building2,
  ChevronRight,
  ClipboardList,
  HelpCircle,
  MessageCircle,
  Rocket,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { areaLabel, typeLabel } from '@/lib/centro/helpers';
import type { CentroArticleMeta, CentroSearchResult } from '@/lib/centro/types';

interface CentroHomeProps {
  articles: CentroArticleMeta[];
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onOpenChat: (seed?: string) => void;
  searchResults: CentroSearchResult[] | null;
  searching: boolean;
}

export function CentroHome({
  articles,
  query,
  onQueryChange,
  onSearch,
  onClearSearch,
  onOpenChat,
  searchResults,
  searching,
}: CentroHomeProps) {
  const manualCount = articles.filter(
    (a) => a.type === 'manual' && a.id !== 'estoy-empezando' && a.id !== 'centro-alcohn',
  ).length;
  const faq = articles.find((a) => a.id === 'problemas-frecuentes');
  const starting = articles.find((a) => a.id === 'estoy-empezando');
  const company = articles.find((a) => a.id === 'sobre-alcohn');

  const cards = [
    {
      title: 'Manual de la app',
      body: 'Cómo usar cada pantalla, con los nombres de botones y estados tal cual aparecen.',
      meta: manualCount > 0 ? `${manualCount} capítulos` : undefined,
      to: '/centro?seccion=manual',
      icon: BookOpen,
    },
    {
      title: 'Estoy empezando',
      body: 'Un recorrido corto si recién llegás al equipo.',
      to: starting ? `/centro/articulos/${starting.slug}` : '/centro?seccion=empezando',
      icon: Rocket,
    },
    {
      title: 'Problemas frecuentes',
      body: 'Cuando algo no sale: pedidos, fotos, etiquetas, vectorización…',
      to: faq ? `/centro/articulos/${faq.slug}` : '/centro?seccion=faq',
      icon: HelpCircle,
    },
    {
      title: 'Sobre Alcohn',
      body: 'Qué fabricamos, cómo trabajamos y quién hace qué.',
      to: company ? `/centro/articulos/${company.slug}` : '/centro?seccion=empresa',
      icon: Building2,
    },
    {
      title: 'Actividades',
      body: 'Guías paso a paso del trabajo presencial.',
      meta: 'Próximamente',
      to: '/centro?seccion=actividades',
      icon: ClipboardList,
      muted: true,
    },
  ];

  const showingSearch = searchResults !== null;

  return (
    <div className="space-y-10">
      <header className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Centro Alcohn</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Acá está el manual de la app y un asistente que responde con fuentes. Las guías del taller
          se van a sumar más adelante.
        </p>
      </header>

      <section className="max-w-2xl space-y-3" aria-label="Búsqueda">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch();
              }}
              placeholder="Pedidos, Transferido, etiqueta…"
              className="h-11 pl-9 pr-9"
              aria-label="Buscar en el Centro Alcohn"
            />
            {query ? (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  onQueryChange('');
                  if (showingSearch) onClearSearch();
                }}
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button type="button" className="h-11 px-5" onClick={onSearch} disabled={searching}>
            {searching ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          ¿No encontrás lo que buscás?{' '}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => onOpenChat(query || undefined)}
          >
            Preguntale al asistente
          </button>
        </p>
      </section>

      {showingSearch ? (
        <section aria-live="polite" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">
              {searchResults.length === 0
                ? 'Sin resultados'
                : `${searchResults.length} resultado${searchResults.length === 1 ? '' : 's'}`}
            </h2>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={onClearSearch}
            >
              Volver al inicio
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay nada publicado con “{query.trim() || '…'}”.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() => onOpenChat(query)}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Preguntar igual
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/40">
              {searchResults.map((r) => (
                <li key={`${r.fragmentId}-${r.score}`}>
                  <Link
                    to={`/centro/articulos/${r.slug}#${r.anchor}`}
                    className="block px-4 py-3.5 transition hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {r.title}
                          {r.heading !== r.title ? (
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              · {r.heading}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {r.snippet}
                        </p>
                        <p className="mt-1.5 text-xs text-muted-foreground/80">
                          {typeLabel(r.type)}
                          {r.areas?.length
                            ? ` · ${r.areas.map((a) => areaLabel(a)).join(', ')}`
                            : ''}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Secciones" className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                to={card.to}
                className={cn(
                  'group flex gap-4 rounded-xl border border-border/70 bg-card/50 p-4 transition',
                  'hover:border-border hover:bg-card',
                  card.muted && 'opacity-80',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    card.muted ? 'bg-muted/50 text-muted-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-foreground group-hover:underline group-hover:underline-offset-4">
                      {card.title}
                    </h2>
                    {card.meta ? (
                      <span className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {card.meta}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
