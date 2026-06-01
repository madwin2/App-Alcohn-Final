import {
  canonicalizeProvince,
  getCorreoCapitalFederalLocality,
  normalizeLocality,
  stripAccents,
} from '@/lib/utils/shippingNormalization';

/** Misma localidad con distinto casing / puntuación / tildes (ej. LA PLATA vs La Plata). */
const localityKey = (localidad: string) => stripAccents(normalizeLocality(localidad));

export type DireccionCatalogRow = {
  provincia: string;
  localidad: string;
  domicilio: string;
  codigo_postal: string;
  /** Solo para filas provenientes de `correo_sucursales` (padrón MiCorreo). */
  codigo_sucursal?: string;
};

/** Fila mínima de `correo_sucursales` (padrón MiCorreo en Supabase). */
export type CorreoSucursalPadronRow = {
  codigo: string;
  provincia: string;
  localidad: string;
  calle: string;
  numero: string | null;
};

/** Convierte una sucursal del padrón Correo al formato unificado del catálogo de envíos. */
export function correoSucursalToCatalogRow(r: CorreoSucursalPadronRow): DireccionCatalogRow {
  const calle = (r.calle || '').trim();
  const numeroRaw = (r.numero || '').trim();
  // En el padrón MiCorreo a veces viene "0" como placeholder: tratamos como sin número.
  const numero = numeroRaw === '0' ? '' : numeroRaw;
  const domicilio = [calle, numero].filter(Boolean).join(' ').trim() || calle;
  return {
    codigo_sucursal: (r.codigo || '').trim() || undefined,
    provincia: (r.provincia || '').trim(),
    localidad: (r.localidad || '').trim(),
    domicilio,
    codigo_postal: '',
  };
}

/**
 * Provincia canónica para agrupar en el catálogo: usa el texto, y si viene vacío
 * infiere Buenos Aires por código postal tipo B1234 (muy común en domicilios de PBA).
 */
export function provinceKeyForCatalogRow(r: DireccionCatalogRow): string {
  const fromField = canonicalizeProvince(r.provincia);
  if (fromField) return fromField;
  const trimmed = (r.provincia || '').trim();
  if (trimmed) return trimmed;
  const cp = (r.codigo_postal || '').replace(/\D/g, '');
  if (/^B\d{4}$/i.test(cp)) return 'Buenos Aires';
  return '';
}

/** Provincias canónicas (u originales si no matchean) presentes en el catálogo. */
export function catalogProvinceOptions(rows: DireccionCatalogRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const k = provinceKeyForCatalogRow(r);
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

/**
 * Localidades tal como figuran en `correo_sucursales.localidad` (una por clave normalizada).
 */
export function catalogLocalityOptions(
  rows: DireccionCatalogRow[],
  canonicalProvince: string,
): string[] {
  const p = canonicalProvince.trim();
  if (!p) return [];
  const byKey = new Map<string, string>();
  for (const r of rows) {
    if (provinceKeyForCatalogRow(r) !== p) continue;
    const raw = (r.localidad || '').trim();
    if (!raw) continue;
    const key = localityKey(raw);
    if (!byKey.has(key)) byKey.set(key, stripAccents(raw));
  }
  if (p === 'Capital Federal' && !byKey.size) {
    return [getCorreoCapitalFederalLocality()];
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

export function catalogContainsProvince(rows: DireccionCatalogRow[], province: string): boolean {
  const pCanon = canonicalizeProvince(province) || province.trim();
  if (!pCanon) return false;
  return catalogProvinceOptions(rows).includes(pCanon);
}

export function catalogContainsLocality(
  rows: DireccionCatalogRow[],
  province: string,
  locality: string,
): boolean {
  const pCanon = canonicalizeProvince(province) || province.trim();
  const loc = (locality || '').trim();
  if (!pCanon || !loc) return false;
  const opts = catalogLocalityOptions(rows, pCanon);
  const locNorm = localityKey(loc);
  return opts.some((o) => localityKey(o) === locNorm);
}

export function catalogContainsSucursalAddress(
  rows: DireccionCatalogRow[],
  province: string,
  locality: string,
  domicilio: string,
): boolean {
  const pCanon = canonicalizeProvince(province) || province.trim();
  const dom = (domicilio || '').trim();
  if (!pCanon || !dom) return false;
  const locForAddr =
    pCanon === 'Capital Federal' ? catalogLocalityOptions(rows, pCanon)[0] || locality : locality;
  const opts = catalogAddressOptions(rows, pCanon, locForAddr.trim());
  const domNorm = stripAccents(dom);
  return opts.some((o) => stripAccents(o.trim()) === domNorm);
}

export function catalogAddressOptions(
  rows: DireccionCatalogRow[],
  canonicalProvince: string,
  locality: string,
): string[] {
  const p = canonicalProvince.trim();
  const locNorm = localityKey(locality);
  if (!p) return [];
  const s = new Set<string>();
  if (p === 'Capital Federal') {
    for (const r of rows) {
      if (provinceKeyForCatalogRow(r) !== 'Capital Federal') continue;
      const dom = (r.domicilio || '').trim();
      if (dom) s.add(stripAccents(dom));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }
  if (!locNorm) return [];
  for (const r of rows) {
    if (provinceKeyForCatalogRow(r) !== p) continue;
    if (localityKey(r.localidad) !== locNorm) continue;
    const dom = (r.domicilio || '').trim();
    if (dom) s.add(stripAccents(dom));
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
  const locNorm = localityKey(locality);
  const dom = stripAccents((domicilio || '').trim());
  if (!p || !dom) return null;
  for (const r of rows) {
    if (provinceKeyForCatalogRow(r) !== p) continue;
    if (stripAccents((r.domicilio || '').trim()) !== dom) continue;
    if (p === 'Capital Federal') {
      return (r.codigo_postal || '').trim() || null;
    }
    if (localityKey(r.localidad) === locNorm) {
      return (r.codigo_postal || '').trim() || null;
    }
  }
  return null;
}
