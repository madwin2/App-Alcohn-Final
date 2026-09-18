export const PROVINCIAS = {
  A: 'Salta',
  B: 'Buenos Aires',
  C: 'CABA',
  D: 'San Luis',
  E: 'Entre Ríos',
  F: 'La Rioja',
  G: 'Sgo. del Estero',
  H: 'Chaco',
  J: 'San Juan',
  K: 'Catamarca',
  L: 'La Pampa',
  M: 'Mendoza',
  N: 'Misiones',
  P: 'Formosa',
  Q: 'Neuquén',
  R: 'Río Negro',
  S: 'Santa Fe',
  T: 'Tucumán',
  U: 'Chubut',
  V: 'Tierra del Fuego',
  W: 'Corrientes',
  X: 'Córdoba',
  Y: 'Jujuy',
  Z: 'Santa Cruz',
} as const;

export type CodigoProvincia = keyof typeof PROVINCIAS;

export const CODIGOS_PROVINCIA = Object.keys(PROVINCIAS) as CodigoProvincia[];

const ALIASES: Record<string, CodigoProvincia> = {
  'ciudad autonoma de buenos aires': 'C',
  'ciudad autónoma de buenos aires': 'C',
  'capital federal': 'C',
  caba: 'C',
  'buenos aires': 'B',
  'provincia de buenos aires': 'B',
  'santiago del estero': 'G',
  'sgo. del estero': 'G',
  'sgo del estero': 'G',
  'tierra del fuego': 'V',
  'entre rios': 'E',
  'entre ríos': 'E',
  neuquen: 'Q',
  neuquén: 'Q',
  tucuman: 'T',
  tucumán: 'T',
  cordoba: 'X',
  córdoba: 'X',
  'rio negro': 'R',
  'río negro': 'R',
};

export function esCodigoProvincia(value: string): value is CodigoProvincia {
  return Object.prototype.hasOwnProperty.call(PROVINCIAS, value.toUpperCase());
}

export function nombreProvincia(codigo: string): string {
  const key = codigo.trim().toUpperCase();
  if (esCodigoProvincia(key)) return PROVINCIAS[key];
  throw new Error(
    `Código de provincia inválido: «${codigo}». Válidos: ${Object.keys(PROVINCIAS).join(', ')} (no existen I, Ñ ni O).`,
  );
}

export function codigoProvincia(nombre: string): CodigoProvincia {
  const trimmed = nombre.trim();
  if (!trimmed) throw new Error('Falta la provincia.');
  const upper = trimmed.toUpperCase();
  if (esCodigoProvincia(upper)) return upper;

  const normalized = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (ALIASES[trimmed.toLowerCase()]) return ALIASES[trimmed.toLowerCase()];
  if (ALIASES[normalized]) return ALIASES[normalized];

  for (const [code, label] of Object.entries(PROVINCIAS) as [CodigoProvincia, string][]) {
    const labelNorm = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (labelNorm === normalized) return code;
  }

  throw new Error(
    `Provincia desconocida: «${nombre}». Usá el código de 1 letra (ej. B) o el nombre (ej. Buenos Aires).`,
  );
}
