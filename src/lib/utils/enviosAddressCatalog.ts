import { canonicalizeProvince, getCorreoCapitalFederalLocality } from '@/lib/utils/shippingNormalization';

export type DireccionCatalogRow = {
  provincia: string;
  localidad: string;
  domicilio: string;
  codigo_postal: string;
};

const provinceKey = (provincia: string) => canonicalizeProvince(provincia) || provincia.trim();

/** Provincias canónicas (u originales si no matchean) presentes en el catálogo. */
export function catalogProvinceOptions(rows: DireccionCatalogRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const k = provinceKey(r.provincia);
    if (k) s.add(k);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
}

export function mergeOption(list: string[], value: string | undefined): string[] {
  const v = (value || '').trim();
  if (!v) return list;
  if (list.includes(v)) return list;
  return [...list, v].sort((a, b) => a.localeCompare(b, 'es'));
}

export function catalogLocalityOptions(
  rows: DireccionCatalogRow[],
  canonicalProvince: string,
): string[] {
  const p = canonicalProvince.trim();
  if (!p) return [];
  if (p === 'Capital Federal') {
    return [getCorreoCapitalFederalLocality()];
  }
  const s = new Set<string>();
  for (const r of rows) {
    if (provinceKey(r.provincia) !== p) continue;
    const loc = (r.localidad || '').trim();
    if (loc) s.add(loc);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
}

export function catalogAddressOptions(
  rows: DireccionCatalogRow[],
  canonicalProvince: string,
  locality: string,
): string[] {
  const p = canonicalProvince.trim();
  const loc = (locality || '').trim();
  if (!p) return [];
  const s = new Set<string>();
  if (p === 'Capital Federal') {
    for (const r of rows) {
      if (provinceKey(r.provincia) !== 'Capital Federal') continue;
      const dom = (r.domicilio || '').trim();
      if (dom) s.add(dom);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }
  if (!loc) return [];
  for (const r of rows) {
    if (provinceKey(r.provincia) !== p) continue;
    if ((r.localidad || '').trim() !== loc) continue;
    const dom = (r.domicilio || '').trim();
    if (dom) s.add(dom);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Primer código postal del catálogo que coincide con provincia + localidad + domicilio. */
export function findPostalCodeInCatalog(
  rows: DireccionCatalogRow[],
  canonicalProvince: string,
  locality: string,
  domicilio: string,
): string | null {
  const p = canonicalProvince.trim();
  const loc = (locality || '').trim();
  const dom = (domicilio || '').trim();
  if (!p || !dom) return null;
  for (const r of rows) {
    if (provinceKey(r.provincia) !== p) continue;
    if ((r.domicilio || '').trim() !== dom) continue;
    if (p === 'Capital Federal') {
      return (r.codigo_postal || '').trim() || null;
    }
    if ((r.localidad || '').trim() === loc) {
      return (r.codigo_postal || '').trim() || null;
    }
  }
  return null;
}
