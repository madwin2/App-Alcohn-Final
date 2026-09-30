import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Loader2, MessageCircle } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/useAuth';
import { fetchArticle, fetchCatalog, searchCentro, CentroApiError } from '@/lib/centro/api';
import {
  bindCentroUser,
  clearCentroSession,
  getCachedCatalog,
  setCachedCatalog,
} from '@/lib/centro/session-cache';
import { filterArticles, areaLabel } from '@/lib/centro/helpers';
import type { CentroArticle, CentroArticleMeta, CentroSearchResult } from '@/lib/centro/types';
import { CentroHome } from '@/components/centro/CentroHome';
import { CentroArticleView } from '@/components/centro/CentroArticleView';
import { CentroChatPanel } from '@/components/centro/CentroChatPanel';
import { CentroReportDialog } from '@/components/centro/CentroReportDialog';
import { cn } from '@/lib/utils/cn';

/** Mientras se arma el Centro, solo visible para el dueño (mismo criterio que Economía). */
const ALLOWED_EMAIL = 'julian.475@hotmail.com';

export default function CentroPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  const seccion = searchParams.get('seccion') || 'home';
  const area = searchParams.get('area') || 'todos';
  const chatOpen = searchParams.get('chat') === '1';
  const seedQ = searchParams.get('q') || '';

  const [articles, setArticles] = useState<CentroArticleMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(seedQ);
  const [searchResults, setSearchResults] = useState<CentroSearchResult[] | null>(
    seccion === 'search' ? [] : null,
  );
  const [searching, setSearching] = useState(false);

  const [article, setArticle] = useState<CentroArticle | null>(null);
  const [related, setRelated] = useState<CentroArticleMeta[]>([]);
  const [articleLoading, setArticleLoading] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportCtx, setReportCtx] = useState<{
    kind: 'article' | 'chat';
    title: string;
    href: string;
    question?: string;
  } | null>(null);

  useEffect(() => {
    if (authLoading || !isAllowed) return;
    if (!user?.id) {
      clearCentroSession();
      return;
    }
    bindCentroUser(user.id);

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cached = getCachedCatalog();
        if (cached && !cancelled) setArticles(cached.articles);
        const data = await fetchCatalog();
        if (cancelled) return;
        setCachedCatalog(data);
        setArticles(data.articles);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof CentroApiError ? err.message : 'No se pudo cargar el Centro Alcohn.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, isAllowed]);

  useEffect(() => {
    if (!isAllowed || !slug) {
      setArticle(null);
      setRelated([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setArticleLoading(true);
      setError(null);
      try {
        const data = await fetchArticle(slug);
        if (cancelled) return;
        setArticle(data.article);
        setRelated(data.related);
      } catch (err) {
        if (cancelled) return;
        setArticle(null);
        setError(
          err instanceof CentroApiError ? err.message : 'No se pudo abrir el artículo.',
        );
      } finally {
        if (!cancelled) setArticleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, isAllowed]);

  const setArea = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'todos') params.delete('area');
    else params.set('area', next);
    setSearchParams(params, { replace: true });
  };

  const openChat = useCallback(
    (seed?: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('chat', '1');
      if (seed) params.set('q', seed);
      else params.delete('q');
      if (slug) {
        navigate(`/centro/articulos/${slug}?${params.toString()}`);
      } else {
        setSearchParams(params);
      }
    },
    [navigate, searchParams, setSearchParams, slug],
  );

  const closeChat = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('chat');
    setSearchParams(params, { replace: true });
  };

  const clearSearch = () => {
    setSearchResults(null);
    const params = new URLSearchParams(searchParams);
    params.delete('seccion');
    params.delete('q');
    setSearchParams(params, { replace: true });
  };

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      const data = await searchCentro({
        query,
        area: area === 'todos' ? null : area,
      });
      setSearchResults(data.results);
      const params = new URLSearchParams(searchParams);
      params.set('seccion', 'search');
      if (query) params.set('q', query);
      else params.delete('q');
      params.delete('chat');
      setSearchParams(params, { replace: true });
    } catch (err) {
      setError(err instanceof CentroApiError ? err.message : 'No se pudo buscar.');
    } finally {
      setSearching(false);
    }
  };

  const filteredManual = useMemo(
    () =>
      filterArticles(articles, {
        type: 'manual',
        area: area === 'todos' ? null : area,
      }).filter((a) => a.id !== 'estoy-empezando' && a.id !== 'centro-alcohn'),
    [articles, area],
  );

  const showChat = chatOpen || seccion === 'chat';
  const isHome = !slug && !showChat && seccion !== 'manual' && seccion !== 'actividades';
  const showBack = Boolean(slug || showChat || seccion === 'manual' || seccion === 'actividades' || seccion === 'search');

  if (!authLoading && !isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  if (authLoading || loading) {
    return (
      <AppMain>
        <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span>Cargando…</span>
        </div>
      </AppMain>
    );
  }

  return (
    <AppMain>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div
          className={cn(
            'mb-6 flex flex-wrap items-center gap-2',
            isHome && !error ? 'justify-end' : 'justify-between',
          )}
        >
          {showBack ? (
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
              <Link to="/centro">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Centro
              </Link>
            </Button>
          ) : (
            <span />
          )}

          {!showChat ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => openChat()}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Asistente
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={closeChat}>
              Cerrar asistente
            </Button>
          )}
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        {showChat ? (
          <div
            className={cn(
              'flex min-h-[calc(100vh-8rem)] flex-col',
              slug && article ? 'gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start lg:gap-10' : '',
            )}
          >
            {slug && articleLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : slug && article ? (
              <div className="min-w-0">
                <CentroArticleView
                  article={article}
                  related={related}
                  onAskAssistant={() => openChat()}
                  onReport={() => {
                    setReportCtx({
                      kind: 'article',
                      title: article.title,
                      href: `${window.location.origin}/centro/articulos/${article.slug}`,
                    });
                    setReportOpen(true);
                  }}
                />
              </div>
            ) : null}
            <CentroChatPanel
              className={cn(
                slug && article
                  ? 'min-h-[32rem] lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]'
                  : 'mx-auto w-full max-w-3xl flex-1',
              )}
              openArticleId={article?.id}
              initialQuestion={seedQ || undefined}
              onReportAnswer={(question) => {
                setReportCtx({
                  kind: 'chat',
                  title: 'Consulta al Asistente Alcohn',
                  href: `${window.location.origin}/centro?chat=1`,
                  question,
                });
                setReportOpen(true);
              }}
            />
          </div>
        ) : slug ? (
          articleLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : article ? (
            <CentroArticleView
              article={article}
              related={related}
              onAskAssistant={() => openChat()}
              onReport={() => {
                setReportCtx({
                  kind: 'article',
                  title: article.title,
                  href: `${window.location.origin}/centro/articulos/${article.slug}`,
                });
                setReportOpen(true);
              }}
            />
          ) : null
        ) : seccion === 'actividades' ? (
          <section className="mx-auto max-w-xl py-6 text-center sm:py-10">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Actividades</h1>
            <p className="mt-3 text-base font-medium text-foreground/90">
              Todavía no hay actividades publicadas
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Acá van a estar las guías paso a paso del trabajo presencial. Mientras tanto, el
              manual de la app ya está disponible.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/centro?seccion=manual">Ver el manual</Link>
              </Button>
              <Button type="button" variant="outline" onClick={() => openChat()}>
                Preguntar al asistente
              </Button>
            </div>
          </section>
        ) : seccion === 'manual' ? (
          <section className="space-y-6">
            <header className="max-w-2xl space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Manual de la app</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Un capítulo por pantalla. Elegí el área si querés achicar la lista.
              </p>
            </header>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por área">
              {(['todos', 'ventas', 'produccion', 'logistica'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setArea(a)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm transition',
                    area === a
                      ? 'bg-foreground text-background'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {a === 'todos' ? 'Todos' : areaLabel(a)}
                </button>
              ))}
            </div>

            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
              {filteredManual.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/centro/articulos/${a.slug}`}
                    className="flex items-start justify-between gap-4 px-4 py-3.5 transition hover:bg-muted/40 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{a.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {a.summary}
                      </p>
                    </div>
                    <span className="mt-1 shrink-0 text-muted-foreground/50" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {filteredManual.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay capítulos para ese filtro.</p>
            ) : null}
          </section>
        ) : (
          <CentroHome
            articles={articles}
            query={query}
            onQueryChange={setQuery}
            onSearch={() => void runSearch()}
            onClearSearch={clearSearch}
            onOpenChat={openChat}
            searchResults={seccion === 'search' ? searchResults : null}
            searching={searching}
          />
        )}

        {reportCtx ? (
          <CentroReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            kind={reportCtx.kind}
            title={reportCtx.title}
            href={reportCtx.href}
            question={reportCtx.question}
          />
        ) : null}
      </div>
    </AppMain>
  );
}
