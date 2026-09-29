/**
 * API del Centro Alcohn / conocimiento publicado.
 *
 * POST JSON:
 *   { op: 'catalog' | 'article' | 'search' | 'chat', ... }
 *
 * Requiere Authorization: Bearer <supabase access token>.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireApprovedUser } from './_knowledge/auth.js';
import { searchKnowledge } from './_knowledge/search.js';
import { runKnowledgeChat } from './_knowledge/chat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadBundle() {
  const candidates = [
    join(__dirname, '_knowledge', 'bundle.json'),
    join(process.cwd(), 'api', '_knowledge', 'bundle.json'),
    join(process.cwd(), 'knowledge', 'server', 'bundle.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      // try next
    }
  }
  return null;
}

function publicArticleMeta(article) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    type: article.type,
    areas: article.areas,
    tags: article.tags,
    lastReviewedAt: article.lastReviewedAt,
    reviewBasis: article.reviewBasis,
    contentOwner: article.contentOwner,
    relatedArticleIds: article.relatedArticleIds,
    appRoute: article.appRoute,
    sections: article.sections,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const authResult = await requireApprovedUser(req);
  if (!authResult.ok) {
    res.status(authResult.status).json({ ok: false, error: authResult.error });
    return;
  }

  const bundle = loadBundle();
  if (!bundle) {
    res.status(503).json({ ok: false, error: 'Catálogo de conocimiento no disponible' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const op = typeof body.op === 'string' ? body.op : '';

  try {
    if (op === 'catalog') {
      res.status(200).json({
        ok: true,
        version: bundle.version,
        contentHash: bundle.contentHash,
        builtAt: bundle.builtAt,
        articles: (bundle.articles || []).map(publicArticleMeta),
      });
      return;
    }

    if (op === 'article') {
      const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
      const article = (bundle.articles || []).find((a) => a.slug === slug);
      if (!article) {
        res.status(404).json({ ok: false, error: 'Artículo no encontrado' });
        return;
      }
      const related = (article.relatedArticleIds || [])
        .map((id) => (bundle.articles || []).find((a) => a.id === id))
        .filter(Boolean)
        .map(publicArticleMeta);

      res.status(200).json({
        ok: true,
        version: bundle.version,
        contentHash: bundle.contentHash,
        article: {
          ...publicArticleMeta(article),
          markdown: article.markdown,
        },
        related,
      });
      return;
    }

    if (op === 'search') {
      const results = searchKnowledge(bundle, {
        query: typeof body.query === 'string' ? body.query : '',
        area: typeof body.area === 'string' ? body.area : null,
        type: typeof body.type === 'string' ? body.type : null,
        limit: body.limit,
      });
      res.status(200).json({
        ok: true,
        version: bundle.version,
        contentHash: bundle.contentHash,
        results,
      });
      return;
    }

    if (op === 'chat') {
      if (body.contentVersion && body.contentVersion !== bundle.version) {
        res.status(409).json({
          ok: false,
          code: 'version_mismatch',
          error: 'El contenido del Centro se actualizó. Recargá la página para continuar.',
          version: bundle.version,
        });
        return;
      }

      const result = await runKnowledgeChat(
        bundle,
        {
          question: body.question,
          history: body.history,
          openArticleId: body.openArticleId,
        },
        { userId: authResult.user.id },
      );

      if (!result.ok) {
        res.status(result.status || 500).json(result);
        return;
      }
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ ok: false, error: 'Operación no reconocida' });
  } catch {
    res.status(500).json({
      ok: false,
      error: 'Error inesperado en el Centro',
    });
  }
}
