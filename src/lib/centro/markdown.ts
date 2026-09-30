import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: false,
});

const ALLOWED_TAGS = [
  'a',
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'span',
  'div',
];

const ALLOWED_ATTR = ['href', 'title', 'class', 'id', 'target', 'rel', 'role'];

function stripManualBackLink(markdown: string): string {
  return markdown.replace(/^\[←[^\]]*\]\([^)]+\)\s*\n+/u, '');
}

function enhanceCallouts(html: string): string {
  // Párrafos que empiezan con ⚠️ / 🤖 → bloque con etiqueta clara
  return html.replace(
    /<p>(?:<strong>)?(⚠️|🤖)(?:<\/strong>)?\s*([\s\S]*?)<\/p>/g,
    (_m, icon: string, rest: string) => {
      const isWarn = icon === '⚠️';
      const label = isWarn ? 'Atención' : 'Automático';
      const kind = isWarn ? 'warn' : 'auto';
      return `<div class="centro-callout centro-callout--${kind}" role="note"><p class="centro-callout__label">${label}</p><p class="centro-callout__body">${rest.trim()}</p></div>`;
    },
  );
}

function wrapTables(html: string): string {
  return html.replace(/<table>/g, '<div class="centro-table-wrap"><table>').replace(
    /<\/table>/g,
    '</table></div>',
  );
}

/**
 * Renderiza Markdown del Centro de forma segura (sin HTML arbitrario ni scripts).
 * Resalta tablas, avisos y automatizaciones para lectura en la app.
 */
export function renderCentroMarkdown(markdown: string): string {
  const cleaned = stripManualBackLink(markdown.trim());

  const renderer = new marked.Renderer();
  renderer.link = function link(token) {
    const href = token.href || '';
    const titleAttr = token.title ? ` title="${token.title}"` : '';
    const text = token.text || '';
    const extra = href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${titleAttr}${extra}>${text}</a>`;
  };

  let dirty = marked.parse(cleaned, { async: false, renderer }) as string;
  dirty = wrapTables(dirty);
  dirty = enhanceCallouts(dirty);

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Markdown liviano para respuestas del asistente (negrita, listas, saltos de línea).
 */
export function renderCentroChatMarkdown(markdown: string): string {
  const cleaned = String(markdown || '').trim();
  if (!cleaned) return '';

  const renderer = new marked.Renderer();
  renderer.link = function link(token) {
    const href = token.href || '';
    const titleAttr = token.title ? ` title="${token.title}"` : '';
    const text = token.text || '';
    const extra = href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${titleAttr}${extra}>${text}</a>`;
  };

  const dirty = marked.parse(cleaned, {
    async: false,
    breaks: true,
    gfm: true,
    renderer,
  }) as string;

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'a',
      'p',
      'br',
      'strong',
      'em',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}

/** Ancla estable alineada con el build del catálogo. */
export function slugifyHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
