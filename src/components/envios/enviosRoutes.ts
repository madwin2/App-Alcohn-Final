export type EnviosCarrierFilter = 'ALL' | 'CORREO_ARGENTINO' | 'ANDREANI' | 'VIA_CARGO';

export const ENVIOS_CARRIER_PATH: Record<EnviosCarrierFilter, string> = {
  ALL: '/envios/todos',
  CORREO_ARGENTINO: '/envios/correo',
  ANDREANI: '/envios/andreani',
  VIA_CARGO: '/envios/via-cargo',
};

export const ENVIOS_SLUG_TO_FILTER: Record<string, EnviosCarrierFilter> = {
  todos: 'ALL',
  correo: 'CORREO_ARGENTINO',
  andreani: 'ANDREANI',
  'via-cargo': 'VIA_CARGO',
};

export function enviosFilterFromSlug(slug: string | undefined): EnviosCarrierFilter | null {
  if (!slug) return null;
  return ENVIOS_SLUG_TO_FILTER[slug] ?? null;
}
