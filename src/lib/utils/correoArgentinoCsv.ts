import { canonicalizeProvince, normalizeLocality, normalizePhoneDigits } from './shippingNormalization';
import {
  buscarSucursal,
  buscarSucursalSmart,
  getSucursalesPadronPreferSupabase,
  obtenerCodigoProvincia,
} from './correoSucursalesPadron';

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
  return { street: match[1]!.trim(), number: match[2]!.trim() };
};

const splitPhone = (phone: string): { area: string; number: string } => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return { area: '', number: '' };
  if (digits.length <= 4) return { area: '', number: digits };
  return { area: digits.slice(0, 3), number: digits.slice(3) };
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
};

/**
 * Fila de plantilla Masiva Correo (mismos criterios que "correo arg auto" + padrón MiCorreo embebido).
 */
export const createCorreoCsvRow = async (
  input: CorreoAddressInput,
): Promise<
  | { row: string[]; ok: true }
  | { ok: false; reason: string }
> => {
  const SUC = await getSucursalesPadronPreferSupabase();
  if (!SUC.length) {
    return {
      ok: false,
      reason:
        'Padrón de sucursales no disponible en Supabase (tabla `correo_sucursales` vacía o inaccesible).',
    };
  }

  const locality = normalizeLocality(input.localidad);
  const phone = normalizePhoneDigits(input.telefono);
  const { area, number: phoneNumber } = splitPhone(phone);
  const cleanedName = sanitizeCsvValue(input.nombreCompleto);
  const cleanedEmail = sanitizeCsvValue(input.email);
  const cleanedLocality = sanitizeCsvValue(locality);
  const cleanedPostalCode = sanitizeCsvValue(input.codigoPostal);
  const { street, number } = splitStreetAndNumber(input.domicilio);
  const streetForCsv = sanitizeCsvValue(street);
  const isSucursal = input.tipoEnvio === 'Sucursal';

  let letraProvincia = '';
  let sucursalCode = '';
  const domicilioRaw = (input.domicilio || '').trim();

  if (isSucursal) {
    const smart = buscarSucursalSmart(
      {
        tipoEnvio: 'sucursal',
        provincia: input.provincia,
        localidad: locality,
        direccion: domicilioRaw,
      },
      SUC,
    );
    if (!smart) {
      return {
        ok: false,
        reason:
          'Sucursal: en el padrón no hubo una sola coincidencia. Revisá provincia y localidad, y en «Dirección de la sucursal» la calle y el número exactos (como en el listado MiCorreo). Si hay varias sucursales en la misma localidad, sin esa dirección no se puede elegir el código.',
      };
    }
    letraProvincia = obtenerCodigoProvincia(smart.provincia);
    sucursalCode = sanitizeCsvValue(smart.codigo);
    if (!sucursalCode) {
      return { ok: false, reason: 'Sucursal encontrada en padrón pero sin código.' };
    }
  } else {
    const dePadron = buscarSucursal(locality, input.provincia, SUC);
    const provCanon = canonicalizeProvince(input.provincia);
    const provFuente = dePadron
      ? dePadron.provincia
      : provCanon || (input.provincia || '').trim();
    letraProvincia = obtenerCodigoProvincia(provFuente);
    if (!letraProvincia && provCanon) {
      letraProvincia = obtenerCodigoProvincia(provCanon);
    }
  }

  if (!letraProvincia) {
    return {
      ok: false,
      reason:
        'No se pudo obtener el código de letra de provincia. Revisá el nombre de provincia en el domicilio guardado.',
    };
  }

  if (!isSucursal && (!cleanedLocality || !streetForCsv)) {
    return {
      ok: false,
      reason: 'Domicilio incompleto: faltan localidad o calle (con número al final o en el texto).',
    };
  }

  if (isSucursal && !sucursalCode) {
    return { ok: false, reason: 'Sucursal sin código en padrón.' };
  }

  const row = [
    DEFAULT_VALUES.tipo_producto,
    DEFAULT_VALUES.largo,
    DEFAULT_VALUES.ancho,
    DEFAULT_VALUES.altura,
    DEFAULT_VALUES.peso,
    DEFAULT_VALUES.valor_del_contenido,
    letraProvincia,
    isSucursal ? sucursalCode : '',
    isSucursal ? '' : cleanedLocality,
    isSucursal ? '' : streetForCsv,
    isSucursal ? '' : sanitizeCsvValue(number),
    '',
    '',
    isSucursal ? '' : cleanedPostalCode,
    cleanedName,
    cleanedEmail,
    '',
    '',
    area,
    sanitizeCsvValue(phoneNumber),
    '',
  ];

  return { ok: true, row: row.map((cell) => sanitizeCsvValue(String(cell))) };
};
