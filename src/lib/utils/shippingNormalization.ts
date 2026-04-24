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

