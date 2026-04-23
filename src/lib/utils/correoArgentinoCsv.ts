import { canonicalizeProvince, normalizeLocality, normalizePhoneDigits } from './shippingNormalization';

// Importante para deploy (Vercel): no depender de archivos fuera de `src`/`public`.
// Si se quiere cargar un padrón completo de sucursales, puede inyectarse por variable
// de entorno en build: VITE_CORREO_SUCURSALES_CSV.
const sucursalesRawCsv = (import.meta.env.VITE_CORREO_SUCURSALES_CSV as string | undefined) ?? '';

export const CSV_FIELDS = [
  'tipo_producto(obligatorio)',
  'largo(obligatorio en CM)',
  'ancho(obligatorio en CM)',
  'altura(obligatorio en CM)',
  'peso(obligatorio en KG)',
  'valor_del_contenido(obligatorio en pesos argentinos)',
  'provincia_destino(obligatorio)',
  'sucursal_destino(obligatorio solo en caso de no ingresar localidad de destino)',
  'localidad_destino(obligatorio solo en caso de no ingresar sucursal de destino)',
  'calle_destino(obligatorio solo en caso de no ingresar sucursal de destino)',
  'altura_destino(obligatorio solo en caso de no ingresar sucursal de destino)',
  'piso(opcional solo en caso de no ingresar sucursal de destino)',
  'dpto(opcional solo en caso de no ingresar sucursal de destino)',
  'codpostal_destino(obligatorio solo en caso de no ingresar sucursal de destino)',
  'destino_nombre(obligatorio)',
  'destino_email(obligatorio, debe ser un email valido)',
  'cod_area_tel(opcional)',
  'tel(opcional)',
  'cod_area_cel(opcional)',
  'cel(opcional)',
  'numero_orden(opcional)',
] as const;

export const DEFAULT_VALUES = {
  tipo_producto: 'CP',
  largo: '25',
  ancho: '8',
  altura: '8',
  peso: '0.5',
  valor_del_contenido: '40000',
};

const PROVINCE_CODES: Record<string, string> = {
  SALTA: 'A',
  'BUENOS AIRES': 'B',
  'CAPITAL FEDERAL': 'C',
  'SAN LUIS': 'D',
  'ENTRE RIOS': 'E',
  'LA RIOJA': 'F',
  'SANTIAGO DEL ESTERO': 'G',
  CHACO: 'H',
  'SAN JUAN': 'J',
  CATAMARCA: 'K',
  'LA PAMPA': 'L',
  MENDOZA: 'M',
  MISIONES: 'N',
  FORMOSA: 'P',
  NEUQUEN: 'Q',
  'RIO NEGRO': 'R',
  'SANTA FE': 'S',
  TUCUMAN: 'T',
  CHUBUT: 'U',
  'TIERRA DEL FUEGO': 'V',
  CORRIENTES: 'W',
  CORDOBA: 'X',
  JUJUY: 'Y',
  'SANTA CRUZ': 'Z',
};

type Sucursal = {
  codigo: string;
  calle: string;
  numero: string;
  localidad: string;
  provincia: string;
};

export type CorreoAddressInput = {
  provincia: string;
  localidad: string;
  domicilio: string;
  codigoPostal: string;
  nombreCompleto: string;
  email: string;
  telefono: string;
  tipoEnvio: 'Domicilio' | 'Sucursal';
  numeroOrden: string;
};

export const normalizeString = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const sanitizeCsvValue = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s@.,\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const splitStreetAndNumber = (address: string): { street: string; number: string } => {
  const cleaned = sanitizeCsvValue(address);
  const match = cleaned.match(/^(.*?)(\d+)\s*$/);
  if (!match) return { street: cleaned, number: '' };
  return { street: match[1].trim(), number: match[2].trim() };
};

const splitPhone = (phone: string): { area: string; number: string } => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return { area: '', number: '' };
  if (digits.length <= 4) return { area: '', number: digits };
  return { area: digits.slice(0, 3), number: digits.slice(3) };
};

const parseSucursales = (): Sucursal[] => {
  if (!sucursalesRawCsv.trim()) return [];
  const lines = sucursalesRawCsv.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    return {
      codigo: (parts[0] || '').trim(),
      calle: (parts[1] || '').trim(),
      numero: (parts[2] || '').trim(),
      localidad: (parts[3] || '').trim(),
      provincia: (parts[4] || '').trim(),
    };
  });
};

const SUCURSALES = parseSucursales();

const buscarSucursal = (localidad: string, provincia: string): Sucursal | null => {
  const localidadNorm = normalizeString(localidad);
  const provinciaNorm = normalizeString(provincia);

  const exact = SUCURSALES.find(
    (s) => normalizeString(s.localidad) === localidadNorm && normalizeString(s.provincia) === provinciaNorm,
  );
  if (exact) return exact;

  const fallback = SUCURSALES.find((s) => normalizeString(s.localidad) === localidadNorm);
  return fallback || null;
};

const buscarSucursalSmart = (input: CorreoAddressInput): Sucursal | null => {
  const provinciaNorm = normalizeString(input.provincia);
  const { street, number } = splitStreetAndNumber(input.domicilio);
  const streetNorm = normalizeString(street);

  if (input.tipoEnvio === 'Sucursal' && streetNorm && number) {
    const byStreet = SUCURSALES.find((s) => {
      const sameProvince = normalizeString(s.provincia) === provinciaNorm;
      const streetMatches = normalizeString(s.calle).includes(streetNorm);
      const numberMatches = sanitizeCsvValue(s.numero) === number;
      return sameProvince && streetMatches && numberMatches;
    });
    if (byStreet) return byStreet;
  }

  return buscarSucursal(input.localidad, input.provincia);
};

const buscarProvinciaPorLocalidad = (localidad: string): string => {
  const locNorm = normalizeString(localidad);
  const found = SUCURSALES.find((s) => normalizeString(s.localidad) === locNorm);
  return found?.provincia || '';
};

const buscarProvinciaPorCodigoPostal = (codigoPostal: string): string => {
  const cp = sanitizeCsvValue(codigoPostal);
  if (!cp) return '';

  // El archivo de sucursales no trae CP explícito en columnas separadas.
  // Como fallback leve, buscamos coincidencias textuales.
  const found = SUCURSALES.find(
    (s) =>
      s.localidad.includes(cp) ||
      s.calle.includes(cp) ||
      sanitizeCsvValue(s.numero) === cp,
  );
  return found?.provincia || '';
};

export const createCorreoCsvRow = (
  input: CorreoAddressInput,
): { row: string[]; ok: true } | { ok: false; reason: string } => {
  const canonicalProvince = canonicalizeProvince(input.provincia);
  const locality = normalizeLocality(input.localidad);
  const phone = normalizePhoneDigits(input.telefono);
  const directProvinceCode = PROVINCE_CODES[normalizeString(canonicalProvince)] || '';
  const sucursal = buscarSucursalSmart(input);
  const provinceFromLocalidad = locality ? buscarProvinciaPorLocalidad(locality) : '';
  const provinceFromCp = input.codigoPostal ? buscarProvinciaPorCodigoPostal(input.codigoPostal) : '';
  const inferredProvince =
    (directProvinceCode && canonicalProvince) ||
    sucursal?.provincia ||
    provinceFromLocalidad ||
    provinceFromCp ||
    '';
  const inferredProvinceCode = PROVINCE_CODES[normalizeString(inferredProvince)] || '';

  if (!inferredProvinceCode) {
    return {
      ok: false,
      reason:
        'No se pudo mapear provincia/código. Revisar provincia, localidad o código postal de la dirección.',
    };
  }

  const { street, number } = splitStreetAndNumber(input.domicilio);
  const { area, number: phoneNumber } = splitPhone(phone);
  const cleanedName = sanitizeCsvValue(input.nombreCompleto);
  const cleanedEmail = sanitizeCsvValue(input.email);
  const cleanedLocality = sanitizeCsvValue(locality);
  const cleanedPostalCode = sanitizeCsvValue(input.codigoPostal);

  const sucursalCode = input.tipoEnvio === 'Sucursal' ? sanitizeCsvValue(sucursal?.codigo || '') : '';
  if (input.tipoEnvio === 'Sucursal' && !sucursalCode) {
    return {
      ok: false,
      reason: 'Envío a sucursal sin sucursal válida encontrada (calle/número/localidad/provincia).',
    };
  }

  if (input.tipoEnvio === 'Domicilio' && (!cleanedLocality || !sanitizeCsvValue(street))) {
    return {
      ok: false,
      reason: 'Envío a domicilio incompleto: falta localidad o calle.',
    };
  }

  const row = [
    DEFAULT_VALUES.tipo_producto,
    DEFAULT_VALUES.largo,
    DEFAULT_VALUES.ancho,
    DEFAULT_VALUES.altura,
    DEFAULT_VALUES.peso,
    DEFAULT_VALUES.valor_del_contenido,
    inferredProvinceCode,
    sucursalCode,
    input.tipoEnvio === 'Sucursal' ? '' : cleanedLocality,
    input.tipoEnvio === 'Sucursal' ? '' : sanitizeCsvValue(street),
    input.tipoEnvio === 'Sucursal' ? '' : sanitizeCsvValue(number),
    '',
    '',
    input.tipoEnvio === 'Sucursal' ? '' : cleanedPostalCode,
    cleanedName,
    cleanedEmail,
    '',
    '',
    area,
    sanitizeCsvValue(phoneNumber),
    sanitizeCsvValue(input.numeroOrden),
  ];

  return { ok: true, row: row.map((cell) => sanitizeCsvValue(cell)) };
};
