/**
 * Padrón y búsqueda alineada con "correo arg auto" (generar_carga_correo.py / app.py):
 * - CSV MiCorreo: CÓDIGO, CALLE, NÚMERO, LOCALIDAD, PROVINCIA, HORARIOS
 * - normalizar_nombre + buscar_sucursal + buscar_sucursal_smart
 */

import sucursalesMiCorreoDefecto from '../data/sucursales_micorreo.csv?raw';
import { supabase } from '../supabase/client';

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
  s = s.split(/\s+/).filter(Boolean).join(' ');
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
let supabasePadronChecked = false;

const SUPABASE_PADRON_TABLE = 'correo_sucursales';

const mapSupabasePadronRowToSucursal = (row: any): SucursalMiCorreo => ({
  codigo: String(row?.codigo || '').trim(),
  calle: String(row?.calle || '').trim(),
  numero: String(row?.numero || '').trim(),
  localidad: String(row?.localidad || '').trim().toUpperCase(),
  provincia: String(row?.provincia || '').trim().toUpperCase(),
});

/**
 * Intenta obtener el padrón desde Supabase.
 * Si la tabla no existe o falla (permiso/esquema), devuelve [] y se usa fallback local.
 */
async function tryLoadPadronFromSupabase(): Promise<SucursalMiCorreo[]> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_PADRON_TABLE as any)
      .select('codigo,calle,numero,localidad,provincia')
      .limit(10000);

    if (error) {
      console.warn('Padron sucursales: fallback a CSV local (Supabase error):', error.message || error);
      return [];
    }
    const rows = (data || []).map(mapSupabasePadronRowToSucursal).filter((r) => r.codigo && r.provincia);
    return rows;
  } catch (error) {
    console.warn('Padron sucursales: fallback a CSV local (Supabase excepción):', error);
    return [];
  }
}

/** Padrón en memoria: archivo embebido en el bundle o reemplazable por VITE (texto del CSV). */
export function getSucursalesPadron(): SucursalMiCorreo[] {
  if (padronEfectivo) return padronEfectivo;
  const raw = envInlineCsv || sucursalesMiCorreoDefecto;
  padronEfectivo = parseSucursalesMiCorreoCsvText(typeof raw === 'string' ? raw : '');
  return padronEfectivo;
}

/**
 * Supabase-first: si hay padrón cargado en tabla, lo usa.
 * Fallback automático al CSV local embebido para no romper flujo.
 */
export async function getSucursalesPadronPreferSupabase(): Promise<SucursalMiCorreo[]> {
  if (!supabasePadronChecked) {
    supabasePadronChecked = true;
    const fromDb = await tryLoadPadronFromSupabase();
    if (fromDb.length > 0) {
      padronEfectivo = fromDb;
      return padronEfectivo;
    }
  }
  return getSucursalesPadron();
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
  /** Para sucursal: dirección completa de la sucursal (calle + número, como en el padrón MiCorreo). */
  direccion: string;
};

/**
 * Saca calle y número del texto (ej. "FRANCIA 1670", "9 DE JULIO 0", "S/C 0").
 */
export function parseCalleNumeroSucursal(direccion: string): { calle: string; numero: string } {
  const raw = (direccion || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) {
    return { calle: '', numero: '' };
  }
  const m = raw.match(/^(.*?)[\s,]+(N[°º]?\s*)?(\d+)\s*$/i);
  if (m) {
    return { calle: m[1]!.trim(), numero: m[3]! };
  }
  const partes = raw.split(/\s+/).filter(Boolean);
  if (partes.length > 1 && /^\d+$/.test(partes[partes.length - 1]!)) {
    return { calle: partes.slice(0, -1).join(' '), numero: partes[partes.length - 1]! };
  }
  return { calle: raw, numero: '' };
}

function esNumeroSucursalVacio(p: string): boolean {
  const t = (p || '').trim();
  if (!t) {
    return true;
  }
  if (t === '0' || t === '00' || t === '0000') {
    return true;
  }
  if (/^s\/?\s?c(\.|\/|$)?$/i.test(t) || t.toLowerCase() === 's/c') {
    return true;
  }
  return false;
}

function numerosSucursalCoinciden(cliente: string, padron: string): boolean {
  const a = (cliente || '').trim();
  const b = (padron || '').trim();
  if (a === b) {
    return true;
  }
  if (esNumeroSucursalVacio(a) && esNumeroSucursalVacio(b)) {
    return true;
  }
  return false;
}

/** Coincidencia de calle entre el texto del cliente y la columna CALLE del padrón. */
function calleSucursalCoincideConPadron(calleUser: string, callePadron: string): boolean {
  const u = normalizarNombreCorreo(calleUser);
  const p = normalizarNombreCorreo(callePadron);
  if (!u) {
    return false;
  }
  if (!p) {
    return false;
  }
  if (u === p) {
    return true;
  }
  if (p.includes(u) || u.includes(p)) {
    return true;
  }
  const uWords = u.split(' ').filter((w) => w.length > 2);
  for (const w of uWords) {
    if (p.includes(w)) {
      return true;
    }
  }
  return false;
}

/**
 * Sucursal: primero restringe por localidad+provincia; si hay más de una oficina, exige
 * que calle y número del campo dirección coincidan con el padrón (misma lógica que "correo arg auto" pero priorizando localidad).
 * Domicilio: no aplica; devolvemos null.
 */
export function buscarSucursalSmart(
  input: SucursalSmartInput,
  sucursales: SucursalMiCorreo[],
): SucursalMiCorreo | null {
  if (input.tipoEnvio !== 'sucursal') {
    return null;
  }

  const locN = normalizarNombreCorreo(input.localidad);
  const provN = normalizarNombreCorreo(input.provincia);
  if (!provN) {
    return null;
  }

  const { calle, numero } = parseCalleNumeroSucursal(input.direccion);
  const calleN = normalizarNombreCorreo(calle);
  const numT = (numero || '').trim();

  const enLocalidadYProv = locN
    ? sucursales.filter(
        (s) =>
          normalizarNombreCorreo(s.provincia) === provN && normalizarNombreCorreo(s.localidad) === locN,
      )
    : [];

  if (enLocalidadYProv.length === 1) {
    return enLocalidadYProv[0]!;
  }

  if (enLocalidadYProv.length > 1) {
    if (!calleN) {
      return null;
    }
    const filtradas = enLocalidadYProv.filter(
      (s) => calleSucursalCoincideConPadron(calle, s.calle) && numerosSucursalCoinciden(numT, s.numero),
    );
    if (filtradas.length === 1) {
      return filtradas[0]!;
    }
    return null;
  }

  const enProvSolo = sucursales.filter((s) => normalizarNombreCorreo(s.provincia) === provN);
  if (calleN) {
    const m2 = enProvSolo.filter(
      (s) => calleSucursalCoincideConPadron(calle, s.calle) && numerosSucursalCoinciden(numT, s.numero),
    );
    if (m2.length === 1) {
      return m2[0]!;
    }
  }
  return null;
}

export { CODIGOS_PROVINCIAS as CODIGOS_PROVINCIAS_CORREO };
