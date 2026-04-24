/**
 * Padrón y búsqueda alineada con "correo arg auto" (generar_carga_correo.py / app.py):
 * - CSV MiCorreo: CÓDIGO, CALLE, NÚMERO, LOCALIDAD, PROVINCIA, HORARIOS
 * - normalizar_nombre + buscar_sucursal + buscar_sucursal_smart
 */

import sucursalesMiCorreoDefecto from '../data/sucursales_micorreo.csv?raw';

const ABREVIACIONES: Array<[string, string]> = [
  ['GRAL.', 'GENERAL'],
  ['GRAL', 'GENERAL'],
  ['STA.', 'SANTA'],
  ['STA', 'SANTA'],
  ['STO.', 'SANTO'],
  ['STO', 'SANTO'],
  ['PDO.', 'PARTIDO'],
  ['PDO', 'PARTIDO'],
  ['DPTO.', 'DEPARTAMENTO'],
  ['DPTO', 'DEPARTAMENTO'],
  ['CNEL.', 'CORONEL'],
  ['CNEL', 'CORONEL'],
  ['ING.', 'INGENIERO'],
  ['ING', 'INGENIERO'],
  ['DR.', 'DOCTOR'],
  ['DR', 'DOCTOR'],
  ['PTE.', 'PRESIDENTE'],
  ['PTE', 'PRESIDENTE'],
  ['MTRO.', 'MINISTRO'],
  ['MTRO', 'MINISTRO'],
  ['AV.', 'AVENIDA'],
  ['AV', 'AVENIDA'],
];

/** Códigos de letra (plantilla Masiva / MiCorreo) — misma clave que en el script Python. */
const CODIGOS_PROVINCIAS: Record<string, string> = {
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

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Misma lógica que `normalizar_nombre` en correo arg auto (app.py), sin reemplazos
 * de tildes que rompan comparaciones: mayúsculas, sin tildes, abreviaturas, trim.
 */
export function normalizarNombreCorreo(nombre: string): string {
  let s = (nombre || '').toUpperCase();
  s = stripAccents(s);
  for (const [abrev, largo] of ABREVIACIONES) {
    s = s.split(abrev).join(largo);
  }
  s = s.replace(/\./g, ' ');
  s = s.replace(/,/g, ' ');
  s = ' '.join(s.split(/\s+/).filter(Boolean));
  s = s.trim();
  if (s.endsWith('S') && !s.endsWith('ES') && s.length > 4) {
    s = s.slice(0, -1);
  }
  return s;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out.map((c) => c.trim());
}

export type SucursalMiCorreo = {
  codigo: string;
  calle: string;
  numero: string;
  localidad: string;
  provincia: string;
};

const envInlineCsv = (import.meta.env.VITE_CORREO_SUCURSALES_CSV as string | undefined)?.trim() ?? '';

/** Parsea el CSV oficial (Mismo esquema que en Python: CÓDIGO, CALLE, NÚMERO, LOCALIDAD, PROVINCIA, HORARIOS). */
export function parseSucursalesMiCorreoCsvText(raw: string): SucursalMiCorreo[] {
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim().replace(/^\uFEFF/, ''));
  const hNorm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const col = (pred: (low: string) => boolean) => {
    const i = header.findIndex((cell) => pred(hNorm(cell)));
    return i;
  };
  const iC = col((c) => c.startsWith('codig'));
  const iCal = col((c) => c.startsWith('calle') && !c.startsWith('cod'));
  const iN = col((c) => c.startsWith('numer') || c.startsWith('núm'));
  const iL = col((c) => c.startsWith('local'));
  const iP = col((c) => c.startsWith('provin'));

  const cCod = iC >= 0 ? iC : 0;
  const cCal = iCal >= 0 ? iCal : 1;
  const cN = iN >= 0 ? iN : 2;
  const cL = iL >= 0 ? iL : 3;
  const cP = iP >= 0 ? iP : 4;
  if (header.length < 5) return [];

  const out: SucursalMiCorreo[] = [];
  for (let l = 1; l < lines.length; l += 1) {
    const row = parseCsvLine(lines[l]);
    if (row.length < 5) continue;
    out.push({
      codigo: (row[cCod] || '').trim(),
      calle: (row[cCal] || '').trim(),
      numero: (row[cN] || '').trim(),
      localidad: (row[cL] || '').trim().toUpperCase(),
      provincia: (row[cP] || '').trim().toUpperCase(),
    });
  }
  return out;
}

let padronEfectivo: SucursalMiCorreo[] | null = null;

/** Padrón en memoria: archivo embebido en el bundle o reemplazable por VITE (texto del CSV). */
export function getSucursalesPadron(): SucursalMiCorreo[] {
  if (padronEfectivo) return padronEfectivo;
  const raw = envInlineCsv || sucursalesMiCorreoDefecto;
  padronEfectivo = parseSucursalesMiCorreoCsvText(typeof raw === 'string' ? raw : '');
  return padronEfectivo;
}

/**
 * Código de una letra para el CSV, como `obtener_codigo_provincia` en el script Python.
 */
export function obtenerCodigoProvincia(nombreProvincia: string): string {
  if (!nombreProvincia?.trim()) return '';
  const nombre = normalizarNombreCorreo(nombreProvincia);
  for (const [prov, cod] of Object.entries(CODIGOS_PROVINCIAS)) {
    if (normalizarNombreCorreo(prov) === nombre) {
      return cod;
    }
  }
  if (CODIGOS_PROVINCIAS[nombre as keyof typeof CODIGOS_PROVINCIAS]) {
    return CODIGOS_PROVINCIAS[nombre as keyof typeof CODIGOS_PROVINCIAS]!;
  }
  return '';
}

/**
 * Misma búsqueda que `buscar_sucursal` en el Python: localidad+provincia, luego solo localidad.
 */
export function buscarSucursal(
  localidad: string,
  provincia: string | null | undefined,
  sucursales: SucursalMiCorreo[],
): SucursalMiCorreo | null {
  const localidadNorm = normalizarNombreCorreo(localidad);
  const provinciaNorm = provincia ? normalizarNombreCorreo(provincia) : null;
  for (const s of sucursales) {
    const locS = normalizarNombreCorreo(s.localidad);
    const provS = normalizarNombreCorreo(s.provincia);
    if (locS === localidadNorm && (provinciaNorm == null || provS === provinciaNorm)) {
      return s;
    }
  }
  for (const s of sucursales) {
    if (normalizarNombreCorreo(s.localidad) === localidadNorm) {
      return s;
    }
  }
  return null;
}

export type SucursalSmartInput = {
  tipoEnvio: 'domicilio' | 'sucursal';
  provincia: string;
  localidad: string;
  direccion: string;
};

/**
 * Alineado con `buscar_sucursal_smart` en app.py: sucursal+domicilio, luego localidad+provincia.
 */
export function buscarSucursalSmart(
  input: SucursalSmartInput,
  sucursales: SucursalMiCorreo[],
): SucursalMiCorreo | null {
  const provinciaNorm = normalizarNombreCorreo(input.provincia);
  const direccion = (input.direccion || '').trim();
  const partes = direccion ? direccion.split(/\s+/).filter(Boolean) : [];
  let numero = '';
  let calle = '';
  if (direccion) {
    if (partes.length > 1 && /^\d+$/.test(partes[partes.length - 1]!)) {
      numero = partes[partes.length - 1]!;
      calle = partes.slice(0, -1).join(' ');
    } else {
      calle = direccion;
    }
  }
  const calleNorm = normalizarNombreCorreo(calle);
  const numeroNorm = numero.trim();

  if (input.tipoEnvio === 'sucursal' && calleNorm && numeroNorm) {
    const coincidencias: SucursalMiCorreo[] = [];
    for (const s of sucursales) {
      if (normalizarNombreCorreo(s.provincia) === provinciaNorm) {
        const sCalle = normalizarNombreCorreo(s.calle);
        if (calleNorm.length && sCalle.includes(calleNorm)) {
          const numSuc = s.numero.trim();
          if (
            numeroNorm === numSuc ||
            ((numeroNorm === '0' || !numeroNorm) && (numSuc === '0' || !numSuc))
          ) {
            coincidencias.push(s);
          }
        }
      }
    }
    if (coincidencias.length) {
      return coincidencias[0]!;
    }
  }

  const localidad = input.localidad;
  const localidadNorm = normalizarNombreCorreo(localidad);
  const porLoc: SucursalMiCorreo[] = [];
  for (const s of sucursales) {
    if (
      normalizarNombreCorreo(s.provincia) === provinciaNorm &&
      normalizarNombreCorreo(s.localidad) === localidadNorm
    ) {
      porLoc.push(s);
    }
  }
  if (porLoc.length) {
    return porLoc[0]!;
  }
  return null;
}

export { CODIGOS_PROVINCIAS as CODIGOS_PROVINCIAS_CORREO };
