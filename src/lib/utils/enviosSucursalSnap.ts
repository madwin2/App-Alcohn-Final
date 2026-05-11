import {
  catalogAddressOptions,
  catalogLocalityOptions,
  catalogProvinceOptions,
  findPostalCodeInCatalog,
  type DireccionCatalogRow,
} from '@/lib/utils/enviosAddressCatalog';
import {
  canonicalizeProvince,
  getCorreoCapitalFederalLocality,
  normalizeLocality,
} from '@/lib/utils/shippingNormalization';

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type GeoFormSlice = {
  province: string;
  locality: string;
  address: string;
  postalCode: string;
};

/**
 * Ajusta provincia / localidad / domicilio del formulario a valores que existen
 * en el padrón `correo_sucursales` (mismo shape que `DireccionCatalogRow`), para
 * que coincidan con los desplegables después de interpretar texto.
 */
export function snapFormToCorreoSucursalCatalog(
  form: GeoFormSlice,
  rows: DireccionCatalogRow[],
): GeoFormSlice {
  if (!rows.length) {
    return { ...form };
  }

  const provinces = catalogProvinceOptions(rows);
  const fpCanon = canonicalizeProvince(form.province) || form.province.trim();

  let bestProvince =
    provinces.find((p) => p === fpCanon) ||
    provinces.find((p) => canonicalizeProvince(p) === fpCanon) ||
    provinces.find((p) => norm(p) === norm(form.province)) ||
    provinces.find(
      (p) => norm(form.province).includes(norm(p)) || norm(p).includes(norm(form.province)),
    ) ||
    '';

  const localities = catalogLocalityOptions(rows, bestProvince);
  const fl = normalizeLocality(form.locality);
  let bestLocality =
    localities.find((l) => normalizeLocality(l) === fl) ||
    localities.find(
      (l) => norm(l).includes(norm(form.locality)) || norm(form.locality).includes(norm(l)),
    ) ||
    '';

  if (!bestLocality && bestProvince === 'Capital Federal') {
    bestLocality = getCorreoCapitalFederalLocality();
  }

  const locForAddr =
    bestProvince === 'Capital Federal' ? getCorreoCapitalFederalLocality() : bestLocality;
  const addresses = catalogAddressOptions(rows, bestProvince, locForAddr);
  const fa = norm(form.address);
  const bestAddress =
    addresses.find((a) => norm(a) === fa) ||
    addresses.find((a) => fa.includes(norm(a)) || norm(a).includes(fa)) ||
    '';

  const cp =
    findPostalCodeInCatalog(rows, bestProvince, locForAddr, bestAddress) || form.postalCode;

  return {
    province: bestProvince || form.province,
    locality: bestLocality || form.locality,
    address: bestAddress || form.address,
    postalCode: cp,
  };
}
