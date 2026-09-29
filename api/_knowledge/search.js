/**
 * Búsqueda textual sobre el índice publicado (sin IA).
 */

function normalizeSearch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} bundle
 * @param {{ query: string, area?: string | null, type?: string | null, limit?: number }} opts
 */
export function searchKnowledge(bundle, opts) {
  const query = normalizeSearch(opts.query || '');
  const area = opts.area && opts.area !== 'todos' ? String(opts.area).toLowerCase() : null;
  const type = opts.type ? String(opts.type).toLowerCase() : null;
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);

  const tokens = query ? query.split(' ').filter((t) => t.length >= 2) : [];

  /** @type {{ articleId: string, slug: string, title: string, type: string, areas: string[], heading: string, anchor: string, fragmentId: string, snippet: string, score: number }[]} */
  const results = [];

  for (const doc of bundle.searchIndex || []) {
    if (type && doc.type !== type) continue;
    if (area && !(doc.areas || []).includes(area)) continue;

    if (tokens.length === 0) {
      results.push({
        articleId: doc.articleId,
        slug: doc.slug,
        title: doc.title,
        type: doc.type,
        areas: doc.areas,
        heading: doc.title,
        anchor: doc.sections?.[0]?.anchor || 'inicio',
        fragmentId: doc.sections?.[0]?.fragmentId || `${doc.articleId}#inicio`,
        snippet: doc.summary || '',
        score: 1,
      });
      continue;
    }

    let best = null;
    const titleHits = tokens.filter((t) => doc.titleNorm.includes(t)).length;
    const tagHits = tokens.filter((t) => doc.tagsNorm.includes(t)).length;
    const summaryHits = tokens.filter((t) => doc.summaryNorm.includes(t)).length;

    for (const sec of doc.sections || []) {
      const headingHits = tokens.filter((t) => sec.headingNorm.includes(t)).length;
      const textHits = tokens.filter((t) => sec.textNorm.includes(t)).length;
      if (titleHits + tagHits + summaryHits + headingHits + textHits === 0) continue;

      const score =
        titleHits * 12 +
        headingHits * 8 +
        tagHits * 5 +
        summaryHits * 3 +
        textHits * 1 +
        (tokens.every((t) => sec.headingNorm.includes(t) || doc.titleNorm.includes(t)) ? 4 : 0);

      if (!best || score > best.score) {
        best = {
          articleId: doc.articleId,
          slug: doc.slug,
          title: doc.title,
          type: doc.type,
          areas: doc.areas,
          heading: sec.heading,
          anchor: sec.anchor,
          fragmentId: sec.fragmentId,
          snippet: sec.snippet,
          score,
        };
      }
    }

    // También puntuar el artículo completo si solo pegó título/tags
    if (!best && (titleHits || tagHits || summaryHits)) {
      best = {
        articleId: doc.articleId,
        slug: doc.slug,
        title: doc.title,
        type: doc.type,
        areas: doc.areas,
        heading: doc.title,
        anchor: doc.sections?.[0]?.anchor || 'inicio',
        fragmentId: doc.sections?.[0]?.fragmentId || `${doc.articleId}#inicio`,
        snippet: doc.summary || '',
        score: titleHits * 12 + tagHits * 5 + summaryHits * 3,
      };
    }

    if (best) results.push(best);
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'));

  // Evitar duplicar el mismo artículo con el mismo fragmento
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = `${r.articleId}#${r.anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export { normalizeSearch };
