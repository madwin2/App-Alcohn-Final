/**
 * Genera el artefacto de conocimiento para Centro Alcohn.
 * Fuente: knowledge/catalog.json + Markdown listado ahí (nunca un barrido de docs/).
 *
 * Uso: node scripts/build-knowledge.mjs
 * Salida: knowledge/server/bundle.json y api/_knowledge/bundle.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CATALOG_PATH = path.join(ROOT, 'knowledge', 'catalog.json');
const OUT_SERVER = path.join(ROOT, 'knowledge', 'server', 'bundle.json');
const OUT_API = path.join(ROOT, 'api', '_knowledge', 'bundle.json');

/** @typedef {{ id: string, slug: string, title: string, summary: string, type: string, areas: string[], tags: string[], sourcePath: string, sectionSelector?: { fromHeading?: string, untilHeading?: string }, status: string, contentOwner: string | null, lastReviewedAt: string | null, reviewBasis: string | null, relatedArticleIds: string[], appRoute: string | null }} CatalogArticle */

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeSearch(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte bloques mermaid a una representación legible (sin ejecutar código).
 * @param {string} md
 */
function rewriteMermaid(md) {
  return md.replace(/```mermaid\n([\s\S]*?)```/g, (_m, body) => {
    const lines = String(body)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)/i.test(l));

    const steps = [];
    for (const line of lines) {
      const arrow = line.match(/^(\w+)\s*(-->|---|==>|-.->)\s*(\w+)(?:\s*\[["']?(.+?)["']?\])?/);
      if (arrow) {
        const labelMatch = line.match(/\[["']([^"'\]]+)["']\]/g);
        if (labelMatch) {
          for (const lm of labelMatch) {
            const clean = lm.replace(/^\[["']|["']\]$/g, '').replace(/<br\s*\/?>/gi, ' · ');
            if (clean && !steps.includes(clean)) steps.push(clean);
          }
        }
        continue;
      }
      const node = line.match(/^(\w+)\s*\[["'](.+?)["']\]/);
      if (node) {
        const clean = node[2].replace(/<br\s*\/?>/gi, ' · ');
        if (clean && !steps.includes(clean)) steps.push(clean);
      }
    }

    if (steps.length === 0) {
      return [
        '> **Diagrama del proceso**',
        '>',
        ...String(body)
          .trim()
          .split('\n')
          .map((l) => `> ${l.replace(/<br\s*\/?>/gi, ' · ')}`),
        '',
      ].join('\n');
    }

    return [
      '**Diagrama del proceso (pasos):**',
      '',
      ...steps.map((s, i) => `${i + 1}. ${s}`),
      '',
    ].join('\n');
  });
}

/**
 * Extrae sección entre encabezados (inclusive from, exclusive until).
 * @param {string} md
 * @param {{ fromHeading?: string, untilHeading?: string } | undefined} selector
 */
function applySectionSelector(md, selector) {
  if (!selector?.fromHeading) return md;
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let start = -1;
  let end = lines.length;
  const fromNorm = normalizeSearch(selector.fromHeading);
  const untilNorm = selector.untilHeading ? normalizeSearch(selector.untilHeading) : null;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{1,6}\s+(.+)$/);
    if (!h) continue;
    const titleNorm = normalizeSearch(h[1]);
    if (start < 0 && titleNorm === fromNorm) {
      start = i;
      continue;
    }
    if (start >= 0 && untilNorm && titleNorm === untilNorm) {
      end = i;
      break;
    }
  }
  if (start < 0) {
    throw new Error(`No se encontró el encabezado "${selector.fromHeading}"`);
  }
  return lines.slice(start, end).join('\n').trim() + '\n';
}

/**
 * @param {string} markdown
 * @param {string} articleId
 * @param {string} articleTitle
 */
function splitSections(markdown, articleId, articleTitle) {
  const lines = markdown.split('\n');
  /** @type {{ id: string, articleId: string, heading: string, level: number, anchor: string, markdown: string, text: string }[]} */
  const sections = [];
  const usedAnchors = new Map();

  let current = {
    heading: articleTitle,
    level: 1,
    lines: /** @type {string[]} */ ([]),
  };

  const flush = () => {
    const md = current.lines.join('\n').trim();
    if (!md && sections.length > 0) return;
    let anchor = slugify(current.heading) || 'inicio';
    const count = usedAnchors.get(anchor) || 0;
    usedAnchors.set(anchor, count + 1);
    if (count > 0) anchor = `${anchor}-${count + 1}`;
    const text = md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_`|-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    sections.push({
      id: `${articleId}#${anchor}`,
      articleId,
      heading: current.heading,
      level: current.level,
      anchor,
      markdown: md,
      text,
    });
  };

  for (const line of lines) {
    const h = line.match(/^(#{2,4})\s+(.+)$/);
    if (h) {
      flush();
      current = { heading: h[2].trim(), level: h[1].length, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    const text = markdown.replace(/\s+/g, ' ').trim();
    sections.push({
      id: `${articleId}#inicio`,
      articleId,
      heading: articleTitle,
      level: 1,
      anchor: 'inicio',
      markdown,
      text,
    });
  }

  return sections;
}

/**
 * Reescribe enlaces relativos a docs publicados como rutas del centro.
 * @param {string} md
 * @param {Map<string, { slug: string, id: string }>} pathToArticle
 * @param {Map<string, string>} idToSlug
 */
function rewriteLinks(md, pathToArticle, idToSlug) {
  return md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, href) => {
    const trimmed = href.trim();
    if (/^(https?:|mailto:|#)/i.test(trimmed)) return full;

    const [rawPath, hash] = trimmed.split('#');
    const cleaned = rawPath.replace(/^\.\//, '').replace(/^\.\.\//, '');

    // curated linking to other curated by basename
    for (const [srcPath, art] of pathToArticle.entries()) {
      const base = path.basename(srcPath);
      if (
        cleaned === base ||
        cleaned.endsWith('/' + base) ||
        cleaned.replace(/\\/g, '/').endsWith(srcPath.replace(/\\/g, '/')) ||
        srcPath.endsWith(cleaned) ||
        srcPath.endsWith(cleaned.replace(/^docs\//, 'docs/'))
      ) {
        const anchor = hash ? `#${hash}` : '';
        return `[${label}](/centro/articulos/${art.slug}${anchor})`;
      }
    }

    // known slug-ish links like estoy-empezando.md
    const maybeSlug = cleaned.replace(/\.md$/i, '');
    if (idToSlug.has(maybeSlug)) {
      const slug = idToSlug.get(maybeSlug);
      const anchor = hash ? `#${hash}` : '';
      return `[${label}](/centro/articulos/${slug}${anchor})`;
    }

    // unpublished / external doc — no filesystem path; plain text with note
    return `**${label}** _(referencia no publicada en el Centro)_`;
  });
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  /** @type {CatalogArticle[]} */
  const entries = catalog.articles.filter((a) => a.status === 'published');

  if (entries.some((a) => a.type === 'activity')) {
    throw new Error('No deben publicarse actividades en esta versión.');
  }

  const ids = new Set();
  const slugs = new Set();
  for (const a of entries) {
    if (ids.has(a.id)) throw new Error(`ID duplicado: ${a.id}`);
    if (slugs.has(a.slug)) throw new Error(`Slug duplicado: ${a.slug}`);
    ids.add(a.id);
    slugs.add(a.slug);
  }

  /** @type {Map<string, { slug: string, id: string }>} */
  const pathToArticle = new Map();
  /** @type {Map<string, string>} */
  const idToSlug = new Map();
  for (const a of entries) {
    pathToArticle.set(a.sourcePath.replace(/\\/g, '/'), { slug: a.slug, id: a.id });
    idToSlug.set(a.id, a.slug);
    idToSlug.set(a.slug, a.slug);
  }

  const articles = [];
  const fragments = [];
  const searchDocs = [];

  for (const meta of entries) {
    const abs = path.join(ROOT, meta.sourcePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Fuente inexistente: ${meta.sourcePath}`);
    }
    // Guardrail: never pull SOPs
    if (meta.sourcePath.includes('11-operations-sops')) {
      throw new Error(`Fuente excluida: ${meta.sourcePath}`);
    }
    if (meta.sourcePath.includes('13-economia')) {
      throw new Error(`Fuente excluida: ${meta.sourcePath}`);
    }

    let raw = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    raw = applySectionSelector(raw, meta.sectionSelector);
    raw = rewriteMermaid(raw);
    // Drop first H1 if it duplicates title
    raw = raw.replace(/^#\s+.+\n+/, '');
    raw = rewriteLinks(raw, pathToArticle, idToSlug);

    const sections = splitSections(raw, meta.id, meta.title);
    for (const sec of sections) {
      fragments.push({
        id: sec.id,
        articleId: meta.id,
        slug: meta.slug,
        title: meta.title,
        heading: sec.heading,
        anchor: sec.anchor,
        text: sec.text,
        markdown: sec.markdown.slice(0, 4000),
      });
    }

    const fullText = sections.map((s) => s.text).join(' ');
    articles.push({
      id: meta.id,
      slug: meta.slug,
      title: meta.title,
      summary: meta.summary,
      type: meta.type,
      areas: meta.areas,
      tags: meta.tags,
      status: meta.status,
      contentOwner: meta.contentOwner,
      lastReviewedAt: meta.lastReviewedAt,
      reviewBasis: meta.reviewBasis,
      relatedArticleIds: meta.relatedArticleIds.filter((id) => ids.has(id)),
      appRoute: meta.appRoute,
      sourcePath: meta.sourcePath,
      markdown: raw,
      sections: sections.map((s) => ({
        id: s.id,
        heading: s.heading,
        level: s.level,
        anchor: s.anchor,
      })),
    });

    searchDocs.push({
      articleId: meta.id,
      slug: meta.slug,
      title: meta.title,
      summary: meta.summary,
      type: meta.type,
      areas: meta.areas,
      tags: meta.tags,
      titleNorm: normalizeSearch(meta.title),
      summaryNorm: normalizeSearch(meta.summary),
      tagsNorm: normalizeSearch(meta.tags.join(' ')),
      sections: sections.map((s) => ({
        fragmentId: s.id,
        heading: s.heading,
        anchor: s.anchor,
        headingNorm: normalizeSearch(s.heading),
        textNorm: normalizeSearch(s.text),
        snippet: s.text.slice(0, 220),
      })),
    });
  }

  const payload = JSON.stringify({
    version: catalog.revision,
    builtAt: new Date().toISOString(),
    articleCount: articles.length,
    articles: articles.map(({ markdown, sections, ...rest }) => rest),
  });
  // Keep markdown only in full articles map
  // Keep exclusions metadata only in catalog.json / docs — not in the runtime bundle
  const bundle = {
    version: catalog.revision,
    builtAt: new Date().toISOString(),
    contentHash: crypto.createHash('sha256').update(payload + articles.map((a) => a.markdown).join('\n')).digest('hex').slice(0, 16),
    articles,
    fragments,
    searchIndex: searchDocs,
  };

  fs.mkdirSync(path.dirname(OUT_SERVER), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_API), { recursive: true });
  const json = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(OUT_SERVER, json, 'utf8');
  fs.writeFileSync(OUT_API, json, 'utf8');

  console.log(
    `Knowledge bundle OK: ${articles.length} artículos, ${fragments.length} fragmentos, version=${bundle.version}, hash=${bundle.contentHash}`,
  );
}

main();
