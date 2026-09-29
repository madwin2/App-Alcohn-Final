import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error módulo JS del servidor sin tipado
import { searchKnowledge, normalizeSearch } from '../../../api/_knowledge/search.js';

const bundle = JSON.parse(
  readFileSync(join(process.cwd(), 'api/_knowledge/bundle.json'), 'utf8'),
);

describe('knowledge catalog bundle', () => {
  it('tiene IDs y slugs únicos y solo published', () => {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (const a of bundle.articles) {
      expect(a.status).toBe('published');
      expect(ids.has(a.id)).toBe(false);
      expect(slugs.has(a.slug)).toBe(false);
      ids.add(a.id);
      slugs.add(a.slug);
      expect(a.type).not.toBe('activity');
      expect(a.sourcePath).not.toMatch(/11-operations-sops/);
      expect(a.sourcePath).not.toMatch(/13-economia/);
    }
    expect(bundle.articles.length).toBeGreaterThan(10);
  });

  it('no publica artículos de economía ni fuentes de SOPs', () => {
    for (const a of bundle.articles) {
      expect(String(a.sourcePath)).not.toMatch(/11-operations-sops/);
      expect(String(a.sourcePath)).not.toMatch(/13-economia/);
      expect(a.type).not.toBe('activity');
    }
    expect(bundle.fragments.every((f: { articleId: string }) => !f.articleId.includes('economia'))).toBe(
      true,
    );
  });

  it('relatedArticleIds apuntan a artículos existentes', () => {
    const ids = new Set(bundle.articles.map((a: { id: string }) => a.id));
    for (const a of bundle.articles) {
      for (const rel of a.relatedArticleIds || []) {
        expect(ids.has(rel)).toBe(true);
      }
    }
  });
});

describe('knowledge search', () => {
  it('normaliza tildes: vectorizacion ≈ vectorización', () => {
    expect(normalizeSearch('vectorización')).toBe(normalizeSearch('vectorizacion'));
    const withAccent = searchKnowledge(bundle, { query: 'vectorización' }) as Array<{ slug: string }>;
    const without = searchKnowledge(bundle, { query: 'vectorizacion' }) as Array<{ slug: string }>;
    expect(withAccent.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
    expect(withAccent[0].slug).toBe(without[0].slug);
  });

  it('encuentra problemas frecuentes por síntoma', () => {
    const results = searchKnowledge(bundle, { query: 'no aparece el pedido' }) as Array<{
      slug: string;
    }>;
    expect(results.some((r) => r.slug === 'problemas-frecuentes' || r.slug === 'pedidos')).toBe(
      true,
    );
  });

  it('filtra por área y se puede limpiar', () => {
    const prod = searchKnowledge(bundle, { query: 'programa', area: 'produccion' }) as Array<{
      areas: string[];
    }>;
    expect(prod.every((r) => r.areas.includes('produccion'))).toBe(true);
    const all = searchKnowledge(bundle, { query: 'programa', area: 'todos' }) as unknown[];
    expect(all.length).toBeGreaterThanOrEqual(prod.length);
  });

  it('consulta vacía de resultados no inventa contenido', () => {
    const results = searchKnowledge(bundle, { query: 'xyzzyplugh-inexistente-999' });
    expect(results).toEqual([]);
  });
});
