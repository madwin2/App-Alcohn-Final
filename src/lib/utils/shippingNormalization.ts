const PROVINCES = [
  'Buenos Aires',
  'Capital Federal',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
] as const;

type ProvinceName = (typeof PROVINCES)[number];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PROVINCE_ALIASES: Record<string, ProvinceName> = {
  'BUENOS AIRES': 'Buenos Aires',
  'BS AS': 'Buenos Aires',
  BSAS: 'Buenos Aires',
  /** Texto frecuente en cargas manuales / clientes; debe agrupar con «Buenos Aires» para catálogos y CSV. */
  'PROVINCIA DE BUENOS AIRES': 'Buenos Aires',
  'PROVINCIA BUENOS AIRES': 'Buenos Aires',
  'BUENOS AIRES PROVINCIA': 'Buenos Aires',
  'BS AS PROVINCIA': 'Buenos Aires',
  'BS AS PROV': 'Buenos Aires',
  'PBA': 'Buenos Aires',
  'PROV BUENOS AIRES': 'Buenos Aires',
  GBA: 'Buenos Aires',
  'G B A': 'Buenos Aires',
  CABA: 'Capital Federal',
  'CAP FED': 'Capital Federal',
  'CAPITAL FEDERAL': 'Capital Federal',
  'CIUDAD AUTONOMA DE BUENOS AIRES': 'Capital Federal',
  CATAMARCA: 'Catamarca',
  CHACO: 'Chaco',
  CHUBUT: 'Chubut',
  CORDOBA: 'Córdoba',
  CORRIENTES: 'Corrientes',
  'ENTRE RIOS': 'Entre Ríos',
  FORMOSA: 'Formosa',
  JUJUY: 'Jujuy',
  'LA PAMPA': 'La Pampa',
  'LA RIOJA': 'La Rioja',
  MENDOZA: 'Mendoza',
  MISIONES: 'Misiones',
  NEUQUEN: 'Neuquén',
  'RIO NEGRO': 'Río Negro',
  SALTA: 'Salta',
  'SAN JUAN': 'San Juan',
  'SAN LUIS': 'San Luis',
  'SANTA CRUZ': 'Santa Cruz',
  'SANTA FE': 'Santa Fe',
  'SANTIAGO DEL ESTERO': 'Santiago del Estero',
  'TIERRA DEL FUEGO': 'Tierra del Fuego',
  TDF: 'Tierra del Fuego',
  TUCUMAN: 'Tucumán',
};

const LOCALITY_ABBREVIATIONS: Record<string, string> = {
  GRAL: 'General',
  'GRAL.': 'General',
  STA: 'Santa',
  'STA.': 'Santa',
  STO: 'Santo',
  'STO.': 'Santo',
  PTE: 'Presidente',
  'PTE.': 'Presidente',
  CNEL: 'Coronel',
  'CNEL.': 'Coronel',
  MTRO: 'Ministro',
  'MTRO.': 'Ministro',
};

export const canonicalizeProvince = (value: string): string => {
  if (!value?.trim()) return '';
  const normalized = normalize(value);
  if (PROVINCE_ALIASES[normalized]) return PROVINCE_ALIASES[normalized];
  for (const p of PROVINCES) {
    if (normalize(p) === normalized) return p;
  }
  /** CABA con redacción rara (sin «DE» u orden distinto). */
  if (
    normalized.includes('CIUDAD AUTONOMA') &&
    normalized.includes('BUENOS') &&
    normalized.includes('AIRES')
  ) {
    return 'Capital Federal';
  }
  /**
   * Texto libre muy habitual: «Buenos Aires, Argentina», «Buenos Aires Provincia», etc.
   * Debe resolverse a provincia BA (no CABA) para catálogos y CSV.
   */
  if (normalized.startsWith('BUENOS AIRES')) {
    if (normalized.includes('CIUDAD AUTONOMA')) return 'Capital Federal';
    if (normalized.includes('CAPITAL FEDERAL') || normalized.includes('CAP FED')) return 'Capital Federal';
    return 'Buenos Aires';
  }
  /** «Bs As», «Bs As La Matanza», etc. (no matchear prefijos tipo «BS ASUNCION»). */
  if (
    normalized === 'BS AS' ||
    normalized.startsWith('BS AS ') ||
    normalized === 'BSAS' ||
    normalized.startsWith('BSAS ')
  ) {
    if (normalized.includes('CIUDAD AUTONOMA')) return 'Capital Federal';
    return 'Buenos Aires';
  }
  /** «Merlo Buenos Aires», «La Plata Buenos Aires», etc. */
  if (
    (normalized.endsWith('BUENOS AIRES') || normalized.includes(' BUENOS AIRES')) &&
    !normalized.includes('CIUDAD AUTONOMA') &&
    !normalized.includes('CAPITAL FEDERAL') &&
    !normalized.includes('CAP FED')
  ) {
    return 'Buenos Aires';
  }
  return '';
};

export const normalizeLocality = (value: string): string => {
  let cleaned = value
    .replace(/[.,;:_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const parts = cleaned.split(' ').map((word) => {
    const upper = word.toUpperCase();
    const expanded = LOCALITY_ABBREVIATIONS[upper] || word;
    return expanded.charAt(0).toUpperCase() + expanded.slice(1).toLowerCase();
  });

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

export const normalizePhoneDigits = (value: string): string => value.replace(/\D/g, '');

/** Quita el prefijo 549 (Argentina móvil en formato internacional E.164). */
export const stripLeading549FromDigits = (digits: string): string => {
  const d = (digits || '').replace(/\D/g, '');
  if (d.startsWith('549') && d.length > 3) return d.slice(3);
  return d;
};

/** Dígitos locales para Correo / formulario Envíos (sin 549 inicial). */
export const normalizePhoneDigitsForEnvios = (value: string): string =>
  stripLeading549FromDigits(normalizePhoneDigits(value));

/** Localidad estándar MiCorreo / Correo Argentino cuando la provincia es Capital Federal (CABA). */
export const getCorreoCapitalFederalLocality = (): string =>
  normalizeLocality('Ciudad Autónoma de Buenos Aires');

/**
 * Alinea localidad con el criterio de Correo: en Capital Federal siempre
 * "Ciudad Autónoma de Buenos Aires" (da igual si en BD o en el texto venía CABA, barrio, etc.).
 */
export const normalizeLocalityForCorreo = (canonicalProvince: string, locality: string): string => {
  if (canonicalProvince === 'Capital Federal') {
    return getCorreoCapitalFederalLocality();
  }
  return normalizeLocality(locality);
};

