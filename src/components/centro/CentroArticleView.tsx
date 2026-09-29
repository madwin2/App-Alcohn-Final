import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Flag, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderCentroMarkdown } from '@/lib/centro/markdown';
import { reviewBasisLabel } from '@/lib/centro/helpers';
import type { CentroArticle, CentroArticleMeta } from '@/lib/centro/types';
import { cn } from '@/lib/utils/cn';

interface CentroArticleViewProps {
  article: CentroArticle;
  related: CentroArticleMeta[];
  onAskAssistant: () => void;
  onReport: () => void;
}

export function CentroArticleView({
  article,
  related,
  onAskAssistant,
  onReport,
}: CentroArticleViewProps) {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderCentroMarkdown(article.markdown), [article.markdown]);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

  const tocSections = useMemo(
    () => article.sections.filter((s) => s.level <= 3 && s.heading !== article.title),
    [article.sections, article.title],
  );

  const hasCallouts = useMemo(
    () => /⚠️|🤖/.test(article.markdown),
    [article.markdown],
  );

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const used = new Map<string, number>();
    root.querySelectorAll('h2, h3, h4').forEach((el) => {
      const text = el.textContent || '';
      let anchor = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      if (!anchor) return;
      const n = used.get(anchor) || 0;
      used.set(anchor, n + 1);
      if (n > 0) anchor = `${anchor}-${n + 1}`;
      el.id = anchor;
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchorEl = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchorEl) return;
      const href = anchorEl.getAttribute('href') || '';
      if (href.startsWith('/centro')) {
        event.preventDefault();
        navigate(href);
        return;
      }
      if (href.startsWith('#')) {
        event.preventDefault();
        const id = href.slice(1);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveAnchor(id);
        navigate({ hash: href }, { replace: true });
      }
    };
    root.addEventListener('click', onClick);

    const headings = Array.from(root.querySelectorAll('h2, h3, h4')).filter((el) => el.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target instanceof HTMLElement && visible[0].target.id) {
          setActiveAnchor(visible[0].target.id);
        }
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 1] },
    );
    headings.forEach((h) => observer.observe(h));

    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveAnchor(hash);
      }, 50);
    }

    return () => {
      root.removeEventListener('click', onClick);
      observer.disconnect();
    };
  }, [html, navigate]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <article className="min-w-0 flex-1">
        <header className="mb-8 max-w-3xl space-y-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem] sm:leading-snug">
              {article.title}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{article.summary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {article.appRoute ? (
              <Button asChild size="sm">
                <Link to={article.appRoute}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Abrir pantalla
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onAskAssistant}>
              <MessageCircle className="mr-2 h-3.5 w-3.5" />
              Preguntar sobre esto
            </Button>
          </div>

          {hasCallouts ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              En el texto vas a ver bloques de{' '}
              <span className="font-medium text-amber-500/90">Atención</span> (cuidado) y{' '}
              <span className="font-medium text-sky-400/90">Automático</span> (lo hace la app sola).
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {article.lastReviewedAt ? <span>Revisado {article.lastReviewedAt}</span> : null}
            {article.lastReviewedAt && article.reviewBasis ? (
              <span className="text-border" aria-hidden>
                ·
              </span>
            ) : null}
            {article.reviewBasis ? <span>{reviewBasisLabel(article.reviewBasis)}</span> : null}
            <button
              type="button"
              onClick={onReport}
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Flag className="h-3 w-3" />
              Informar un problema
            </button>
          </div>
        </header>

        <div
          ref={contentRef}
          className="centro-md"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>

      {(tocSections.length > 1 || related.length > 0) && (
        <aside className="order-first w-full shrink-0 lg:order-last lg:w-52 xl:w-56">
          <div className="space-y-6 lg:sticky lg:top-6">
            {tocSections.length > 1 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">En esta página</p>
                <nav
                  className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0"
                  aria-label="Índice"
                >
                  {tocSections.map((sec) => (
                    <a
                      key={sec.id}
                      href={`#${sec.anchor}`}
                      className={cn(
                        'shrink-0 rounded-md px-2.5 py-1.5 text-sm transition lg:shrink',
                        activeAnchor === sec.anchor
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                      style={
                        sec.level > 2
                          ? { paddingLeft: `${0.65 + (sec.level - 2) * 0.55}rem` }
                          : undefined
                      }
                      onClick={() => setActiveAnchor(sec.anchor)}
                    >
                      {sec.heading}
                    </a>
                  ))}
                </nav>
              </div>
            ) : null}

            {related.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">También te puede servir</p>
                <ul className="space-y-1">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/centro/articulos/${r.slug}`}
                        className="block rounded-md px-2.5 py-1.5 text-sm text-foreground/90 transition hover:bg-muted/60"
                      >
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </aside>
      )}
    </div>
  );
}
