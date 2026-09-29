import { describe, expect, it } from 'vitest';
import { buildReportText, filterArticles } from './helpers';
import type { CentroArticleMeta } from './types';

const sample: CentroArticleMeta[] = [
  {
    id: 'a',
    slug: 'a',
    title: 'A',
    summary: '',
    type: 'manual',
    areas: ['ventas'],
    tags: [],
    lastReviewedAt: null,
    reviewBasis: null,
    contentOwner: null,
    relatedArticleIds: [],
    appRoute: null,
    sections: [],
  },
  {
    id: 'b',
    slug: 'b',
    title: 'B',
    summary: '',
    type: 'faq',
    areas: ['produccion', 'ventas'],
    tags: [],
    lastReviewedAt: null,
    reviewBasis: null,
    contentOwner: null,
    relatedArticleIds: [],
    appRoute: null,
    sections: [],
  },
];

describe('centro helpers', () => {
  it('filtra por tipo y área', () => {
    expect(filterArticles(sample, { type: 'faq' })).toHaveLength(1);
    expect(filterArticles(sample, { area: 'produccion' }).map((a) => a.id)).toEqual(['b']);
    expect(filterArticles(sample, { area: 'todos' })).toHaveLength(2);
  });

  it('arma reporte copiable sin decir que se envió', () => {
    const text = buildReportText({
      kind: 'article',
      title: 'Pedidos',
      href: 'https://app/centro/articulos/pedidos',
      reason: 'Está desactualizado',
      comment: 'Falta Andreani',
    });
    expect(text).toContain('Reporte Centro Alcohn');
    expect(text).toContain('No se envió automáticamente');
    expect(text.toLowerCase()).not.toContain('reporte enviado');
  });
});
