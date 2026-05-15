/**
 * Importa CSV de "Clientes Viejos" (export tipo Google Sheets) a Supabase:
 * clientes + ordenes + sellos.
 *
 * Columnas esperadas (cabecera): Medio, Contacto, Nombre, Diseño, Medida,
 * Estado de Fabricacion, Estado de Venta, Seña, Entrega, Sello (precio total), Restante, Notas, …
 *
 * - Medidas del CSV en **cm** → se guardan en ancho_real/largo_real como cm (igual que el resto de la app).
 * - Sin **Sello** / monto: se usa **valor 100** (y se anota en `nota`).
 * - Sin **fecha** en la celda pero el resto cargado: se usa la fecha de la **primera fila siguiente** con fecha válida; si no hay, la **última fecha** ya importada en el mismo CSV.
 * - Si en el CSV **Estado de venta** era Foto (foto enviada), **estado_fabricacion** se fuerza a Hecho.
 * - En la base, **siempre** estado_venta = Transferido y orden: estado_orden / estado_envio = Seguimiento Enviado
 *   (histórico cerrado; alinea con la lógica operativa actual).
 * - Carga por partes: `--chunks 5 --chunk 1` … `--chunk 5` (en cada corrida se recorre todo el CSV para fechas y
 *   secuencia de teléfonos ficticios; solo se inserta el tramo indicado).
 *
 * Uso:
 *   node scripts/import-clientes-viejos-csv.mjs --dry-run --file "Clientes Viejos/Ventas Alcohn - Ventas 2025 Automaticas.csv" --year 2025
 *   node scripts/import-clientes-viejos-csv.mjs --file "…csv" --year 2025 --chunks 5 --chunk 1
 *   … luego --chunk 2 … --chunk 5 (mismo --file; una corrida a la vez).
 *
 * Reanudar tras un corte (OOM, etc.): el mensaje de error usa `Fila N` = índice de fila en el CSV
 * con cabecera en la fila 1 del archivo → N = r+1 (r es el índice interno, primera fila de datos r=1).
 * Ejemplo: si falló en `Fila 1641`, reanudá con `--start-row 1640` (mismo --file y --year).
 * Las filas anteriores solo recalculan fecha encadenada y secuencia de teléfonos placeholder, sin insertar.
 * No combines con --skip-first-ok (se ignora si usás --start-row).
 *
 * Variables de entorno (igual que import-ventas-csv.mjs):
 *   SUPABASE_URL o VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (recomendado)
 * Si aparece "fetch failed" por certificados SSL en tu PC, ver comentario IMPORT_SUPABASE_INSECURE_TLS más abajo en este archivo.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(root, '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

loadEnvFile();

/**
 * Si Node no confía en el certificado (antivirus / proxy HTTPS), definí solo para esta consola:
 *   set IMPORT_SUPABASE_INSECURE_TLS=1   (Windows cmd)
 *   $env:IMPORT_SUPABASE_INSECURE_TLS='1'   (PowerShell)
 * Arreglar la causa (actualizar Windows, excepción en el antivirus) es preferible a dejar esto siempre.
 */
if (process.env.IMPORT_SUPABASE_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn(
    '\n[AVISO] IMPORT_SUPABASE_INSECURE_TLS=1 → verificación SSL desactivada solo en este proceso de Node.\n',
  );
}

function formatNodeFetchDetail(err) {
  if (!err) return '';
  const parts = [];
  if (err.message) parts.push(err.message);
  const c = err.cause;
  if (c) parts.push(typeof c === 'object' && c !== null ? c.code || c.message || String(c) : String(c));
  return parts.join(' | ');
}

function looksLikeTlsCertProblem(text) {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('certificate') ||
    t.includes('ssl') ||
    t.includes('tls') ||
    t.includes('unable_to_verify') ||
    t.includes('self signed') ||
    t.includes('cert_authority_invalid')
  );
}

/** Una sola petición antes del bucle para fallar con mensaje claro (evita 1700× "fetch failed"). Fetch con tope IMPORT_FETCH_TIMEOUT_MS (default 90000). */
function createTimedFetch() {
  const ms = Number(process.env.IMPORT_FETCH_TIMEOUT_MS || 90000);
  const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  return (url, init = {}) => {
    if (!hasTimeout) return fetch(url, init);
    return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  };
}

async function probeSupabase(supabase, url) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* */
  }
  console.log(`Probando conexión TLS a Supabase (${host})…`);
  const { error } = await supabase.from('clientes').select('id').limit(1);
  if (!error) {
    console.log('Conexión OK.\n');
    return;
  }
  const detail = formatNodeFetchDetail(error);
  console.error('\nNo se pudo hablar con Supabase:', detail || error.message);
  if (looksLikeTlsCertProblem(detail) || looksLikeTlsCertProblem(error.message)) {
    console.error(
      '\nParece un problema de **certificado SSL** en tu PC (muy frecuente con antivirus que “escanean” HTTPS, o proxy corporativo).',
    );
    console.error('Opciones:');
    console.error('  1) Actualizar Windows / desactivar temporalmente inspección HTTPS del antivirus y reintentar.');
    console.error(
      `  2) Solo para importar: en cmd: set IMPORT_SUPABASE_INSECURE_TLS=1  |  en PowerShell: $env:IMPORT_SUPABASE_INSECURE_TLS='1'  (misma ventana, antes del npm run).`,
    );
    console.error('  3) Probar: `set NODE_OPTIONS=--dns-result-order=ipv4first` si el fallo fuera de red/IPv6.\n');
  } else if (String(error.message || '').includes('fetch failed')) {
    console.error('\nRevisá internet, firewall, VPN y que VITE_SUPABASE_URL en .env sea la URL https de tu proyecto.\n');
  }
  process.exit(1);
}

/** Parsea CSV con campos entre comillas y comas internas (RFC básico). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  pushField();
  if (row.length) pushRow();
  return rows;
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function buildHeaderIndex(headerRow) {
  const idx = {};
  headerRow.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (key && idx[key] === undefined) idx[key] = i;
  });
  return idx;
}

function col(idx, names, row) {
  for (const n of names) {
    const k = normalizeHeader(n);
    if (idx[k] !== undefined) {
      const v = row[idx[k]];
      return v != null ? String(v).trim() : '';
    }
  }
  return '';
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    file: null,
    year: null,
    verboseSkips: false,
    skipFirstOk: 0,
    startRow: 1,
    chunks: 1,
    chunk: 1,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--verbose-skips') args.verboseSkips = true;
    else if (argv[i] === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === '--year' && argv[i + 1]) args.year = parseInt(argv[++i], 10);
    else if (argv[i] === '--skip-first-ok' && argv[i + 1]) args.skipFirstOk = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (argv[i] === '--start-row' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      args.startRow = Number.isFinite(n) && n >= 1 ? n : 1;
    } else if (argv[i] === '--chunks' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      args.chunks = Number.isFinite(n) && n >= 1 ? n : 1;
    } else if (argv[i] === '--chunk' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      args.chunk = Number.isFinite(n) && n >= 1 ? n : 1;
    }
  }
  /** npm en algunos Windows pasa `--year 2025 --chunks 5 --chunk 1` como `2025 5 1` (sin guiones). */
  maybeApplyNpmLooseNumericTail(argv, args);
  return args;
}

function maybeApplyNpmLooseNumericTail(argv, args) {
  if (argv.includes('--year') || argv.includes('--chunks') || argv.includes('--chunk')) return;
  const tail = [];
  for (let i = argv.length - 1; i >= 2; i--) {
    if (/^\d+$/.test(argv[i])) tail.unshift(argv[i]);
    else break;
  }
  if (tail.length !== 3) return;
  const y = parseInt(tail[0], 10);
  const ch = parseInt(tail[1], 10);
  const ck = parseInt(tail[2], 10);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return;
  if (!Number.isFinite(ch) || ch < 1 || ch > 500) return;
  if (!Number.isFinite(ck) || ck < 1 || ck > ch) return;
  args.year = y;
  args.chunks = ch;
  args.chunk = ck;
  console.warn(
    `[Aviso] argv sin banderas --year/--chunks/--chunk (${y}, ${ch}, ${ck}). Se asume --year ${y} --chunks ${ch} --chunk ${ck}.\n` +
      '  Si no era eso, llamá con node directo: node scripts/import-clientes-viejos-csv.mjs --year 2025 --chunks 5 --chunk 1\n',
  );
}

/** Índices r de filas de datos (1 .. tableLength-1) para el tramo `chunk` de `chunks` (ambos 1-based). */
function computeChunkRowRange(tableLength, chunks, chunk) {
  const lastR = tableLength - 1;
  const n = lastR;
  if (chunk < 1 || chunk > chunks || chunks < 1) return { start: 1, end: lastR, empty: false };
  if (chunks === 1 || n < 1) return { start: 1, end: lastR, empty: false };
  const base = Math.floor(n / chunks);
  const extra = n % chunks;
  let r = 1;
  for (let c = 1; c <= chunks; c++) {
    const size = base + (c <= extra ? 1 : 0);
    const start = r;
    const end = r + size - 1;
    if (c === chunk) return { start, end, empty: size === 0 || start > end };
    r = end + 1;
  }
  return { start: 1, end: lastR, empty: false };
}

function inferYearFromPath(filePath, explicit) {
  if (explicit && Number.isFinite(explicit)) return explicit;
  const base = path.basename(filePath);
  const m = base.match(/(20\d{2})/);
  if (m) return parseInt(m[1], 10);
  return 2025;
}

function parseFechaDM(s, year) {
  if (!s || !String(s).trim()) return null;
  const t = String(s).trim().replace(/-/g, '/');
  const parts = t.split('/');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!day || !month || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function mapMedio(m) {
  const u = String(m || '').toUpperCase().trim();
  if (u.includes('IG')) return 'Instagram';
  if (u.includes('FB')) return 'Facebook';
  if (u.includes('MAIL')) return 'Mail';
  if (u.startsWith('WP') || u.includes('WHATSAPP')) return 'Whatsapp';
  return 'Whatsapp';
}

function splitNombre(full) {
  const s = String(full || '').trim();
  if (!s) return { nombre: 'Cliente', apellido: '-' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { nombre: parts[0], apellido: '-' };
  return { nombre: parts[0], apellido: parts.slice(1).join(' ') };
}

/** Medidas en cm del CSV → ancho y largo en cm para la DB (como el alta manual). */
function parseMedidaCm(medidaRaw) {
  const s = String(medidaRaw || '')
    .trim()
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\s/g, '');
  const normalized = s.replace(/,/g, '.');
  const m = normalized.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!m) return { anchoCm: 5, largoCm: 3 };
  return { anchoCm: parseFloat(m[1]), largoCm: parseFloat(m[2]) };
}

/** Pesos AR: " $112.500,00", "112500", "1.234,56" */
function parseMoney(s) {
  if (s == null || String(s).trim() === '') return null;
  let t = String(s).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!t) return null;
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  } else if (hasComma) {
    t = t.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function stripFabricacion(cell) {
  return String(cell || '')
    .replace(/✅/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapEstadoFabricacion(cell) {
  const c = stripFabricacion(cell).toLowerCase();
  if (c.includes('sin hacer')) return 'Sin Hacer';
  if (c.includes('hecho')) return 'Hecho';
  if (c.includes('haciendo')) return 'Haciendo';
  if (c.includes('verificar')) return 'Verificar';
  if (c.includes('rehacer')) return 'Rehacer';
  if (c.includes('retocar')) return 'Retocar';
  if (c.includes('prioridad')) return 'Prioridad';
  return 'Hecho';
}

function mapEstadoVenta(cell) {
  const c = String(cell || '').trim().toLowerCase();
  if (c.includes('transferido')) return 'Transferido';
  if (c.includes('foto')) return 'Foto';
  if (c.includes('seña') || c.includes('senado') || c.includes('señado')) return 'Señado';
  return 'Foto';
}

function placeholderPhone(seq) {
  const n = String(seq).padStart(6, '0');
  return `+549110000${n}`;
}

function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const t = String(raw || '').trim();
  if (t.startsWith('+')) return t;
  if (d.startsWith('54')) return `+${d}`;
  if (d.startsWith('9') || d.length >= 10) return `+54${d}`;
  return `+54${d}`;
}

function getFechaCellForRow(table, headerIdx, rowIndex) {
  const row = table[rowIndex];
  if (!row) return '';
  const padded = [...row];
  while (padded.length < 16) padded.push('');
  return col(headerIdx, ['s', 'fecha'], padded) || padded[0]?.trim() || '';
}

/** firstDateFromRowBelow[r] = primera fecha d/m válida en filas r..final (inclusive). O(n). */
function buildFirstDateFromRowBelow(table, headerIdx, year) {
  const n = table.length;
  const arr = new Array(n + 1).fill(null);
  for (let r = n - 1; r >= 1; r--) {
    const fc = getFechaCellForRow(table, headerIdx, r);
    const p = parseFechaDM(fc, year);
    arr[r] = p || arr[r + 1];
  }
  return arr;
}

function isJunkNombre(nombreCell, disenoRaw) {
  const junk = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const n = String(nombreCell || '').trim().toLowerCase();
  if (junk.includes(n) && !String(disenoRaw || '').trim()) return true;
  const low = `${nombreCell || ''} ${disenoRaw || ''}`.toLowerCase().trim();
  if (low === 'enero' || low === 'enero ') return true;
  return false;
}

/** Fila con datos de pedido: no es basura de sección y tiene algo útil (nombre, diseño, medida, medio o fecha). */
function isImportableRow(fechaCell, nombreFull, disenoRaw, medida, medio) {
  if (isJunkNombre(nombreFull, disenoRaw)) return false;
  const n = String(nombreFull || '').trim();
  const d = String(disenoRaw || '').trim();
  const m = String(medida || '').trim();
  const mu = String(medio || '').trim();
  const f = String(fechaCell || '').trim();
  const hasFecha = /^\d{1,2}\/\d{1,2}/.test(f);
  const hasPayload = Boolean(n || d || m || mu);
  return hasFecha || hasPayload;
}

function mapTipoSello(notaRaw) {
  const n = String(notaRaw || '').toLowerCase();
  if (n.includes('lacre')) return 'Lacre';
  return 'Clasico';
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = args.file
    ? path.isAbsolute(args.file)
      ? args.file
      : path.join(root, args.file)
    : path.join(root, 'Clientes Viejos', 'Ventas Alcohn - Ventas 2025 Automaticas.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('No existe el archivo:', csvPath);
    process.exit(1);
  }

  const year = inferYearFromPath(csvPath, args.year);
  console.log(`Año usado para fechas d/m: ${year}`);

  let supabase = null;
  if (!args.dryRun) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const key = serviceKey || anonKey;

    if (!url || !key) {
      console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y clave (SERVICE_ROLE o ANON).');
      process.exit(1);
    }

    if (!serviceKey) {
      console.warn(
        'Aviso: no hay SUPABASE_SERVICE_ROLE_KEY. Si fallan los inserts por RLS, agregala en .env (solo para este script).',
      );
    }

    supabase = createClient(url, key, { global: { fetch: createTimedFetch() } });
    await probeSupabase(supabase, url);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const table = parseCsv(raw);
  if (table.length < 2) {
    console.error('CSV vacío o sin datos.');
    process.exit(1);
  }

  const chunks = Math.max(1, args.chunks || 1);
  const chunk = Math.max(1, args.chunk || 1);
  if (chunk > chunks) {
    console.error('--chunk no puede ser mayor que --chunks.');
    process.exit(1);
  }
  const { start: chunkStart, end: chunkEnd, empty: chunkEmpty } = computeChunkRowRange(table.length, chunks, chunk);
  if (chunkEmpty) {
    console.warn(`El tramo --chunk ${chunk} de --chunks ${chunks} no tiene filas en este CSV. Nada que hacer.`);
    process.exit(0);
  }
  const startRow = Math.max(1, args.startRow || 1);
  const insertMin = Math.max(startRow, chunkStart);
  const insertMax = chunkEnd;
  if (insertMin > insertMax) {
    console.error(
      'Ningún insert en este tramo: --start-row queda después del rango de este --chunk. Revisá --chunk o --start-row.',
    );
    process.exit(1);
  }
  if (chunks > 1) {
    console.log(
      `Carga en ${chunks} partes: corrida ${chunk}/${chunks} · r ∈ [${chunkStart}, ${chunkEnd}] (inserts solo r ∈ [${insertMin}, ${insertMax}]).`,
    );
  }

  const lockPath = path.join(root, '.import-clientes-viejos.lock');
  let lockHeld = false;
  if (!args.dryRun) {
    if (fs.existsSync(lockPath)) {
      console.error(
        '\nYa existe .import-clientes-viejos.lock (otro import en curso o uno que cortó a la mitad).\n' +
          'Si no hay ningún `node` importando, borrá ese archivo y reintentá. No abras dos imports a la vez.\n',
      );
      process.exit(1);
    }
    fs.writeFileSync(lockPath, `pid=${process.pid}\nstarted=${new Date().toISOString()}\n`);
    lockHeld = true;
  }

  try {
  const headerIdx = buildHeaderIndex(table[0]);
  const firstDateFromRowBelow = buildFirstDateFromRowBelow(table, headerIdx, year);
  const requiredNorm = ['medio', 'nombre', 'diseno', 'medida'];
  const missing = requiredNorm.filter((k) => headerIdx[k] === undefined);
  if (missing.length) {
    console.warn('Cabeceras no encontradas:', missing.join(', '));
  }

  let seq = 0;
  let ok = 0;
  let skipped = 0;
  /** Conteo de filas omitidas (útil para entender el dry-run). */
  const skip = { notDataRow: 0, badFecha: 0, dbError: 0 };
  const skipSamples = { badFecha: [] };
  const synthetic = { valor100: 0, fechaDesdeSiguiente: 0, fechaDesdeUltima: 0 };
  const pushSample = (arr, line, detail) => {
    if (arr.length < 8) arr.push(`fila ${line}: ${detail}`);
  };

  let lastGoodFecha = null;
  let skipFirstRemaining = Math.max(0, args.skipFirstOk || 0);
  if (startRow > 1 && skipFirstRemaining > 0) {
    console.warn(
      'Aviso: con --start-row no aplica --skip-first-ok; se ignora (reanudación por índice de fila).\n',
    );
    skipFirstRemaining = 0;
  }
  if (skipFirstRemaining > 0 && !args.dryRun) {
    console.log(
      `--skip-first-ok ${skipFirstRemaining}: se omiten inserciones en las primeras ${skipFirstRemaining} filas importables (reanudar import).\n`,
    );
  }
  if (startRow > 1) {
    console.log(
      `--start-row ${startRow}: filas con r < ${startRow} solo sincronizan fecha/seq; el primer insert usa r=${startRow} (en logs suele verse como "Fila ${startRow + 1}" si la cabecera ocupa una línea del CSV).\n`,
    );
  }

  for (let r = 1; r < table.length; r++) {
    if (r > insertMax) continue;

    const row = table[r];
    while (row.length < 16) row.push('');

    const fechaCell = col(headerIdx, ['s', 'fecha'], row) || row[0]?.trim() || '';
    const medio = col(headerIdx, ['Medio'], row);
    const telRaw = col(headerIdx, ['Contacto'], row);
    const nombreFull = col(headerIdx, ['Nombre'], row);
    const disenoRaw = col(headerIdx, ['Diseño', 'Diseno'], row).trim();
    const diseno = disenoRaw || 'Sin diseño';
    const medida = col(headerIdx, ['Medida'], row);
    const notaCol = col(headerIdx, ['Notas', 'Nota'], row);
    const fabCell = col(headerIdx, ['Estado de Fabricacion', 'Estado de fabricacion'], row);
    const ventaCell = col(headerIdx, ['Estado de Venta', 'Estado de venta'], row);
    const seniaVal = parseMoney(col(headerIdx, ['Seña', 'Sena', 'Seña '], row));
    const selloPrecio = parseMoney(col(headerIdx, ['Sello'], row));
    const restanteVal = parseMoney(col(headerIdx, ['Restante'], row));

    if (!isImportableRow(fechaCell, nombreFull, disenoRaw, medida, medio)) {
      if (r >= insertMin) {
        skipped++;
        skip.notDataRow++;
      }
      continue;
    }

    let fecha = parseFechaDM(fechaCell, year);
    let fechaOrigen = fecha ? 'celda' : '';
    if (!fecha) {
      fecha = firstDateFromRowBelow[r + 1];
      if (fecha) fechaOrigen = 'siguiente';
    }
    if (!fecha && lastGoodFecha) {
      fecha = lastGoodFecha;
      fechaOrigen = 'ultima';
    }
    if (!fecha) {
      if (r >= insertMin) {
        skipped++;
        skip.badFecha++;
        pushSample(skipSamples.badFecha, r + 1, String(fechaCell).slice(0, 40) || '(vacía)');
        if (args.verboseSkips) console.log(`Fila ${r + 1}: sin fecha usable (ni celda, ni fila siguiente, ni anterior), omitido`);
      }
      continue;
    }

    lastGoodFecha = fecha;

    seq += 1;

    if (r < insertMin) {
      continue;
    }

    if (fechaOrigen === 'siguiente') synthetic.fechaDesdeSiguiente++;
    if (fechaOrigen === 'ultima') synthetic.fechaDesdeUltima++;

    let valor = selloPrecio;
    if ((valor == null || valor < 0) && seniaVal != null && restanteVal != null) {
      const sum = seniaVal + restanteVal;
      if (sum > 0) valor = sum;
    }
    let aplicoValor100 = false;
    if (valor == null || valor < 0) {
      valor = 100;
      aplicoValor100 = true;
      synthetic.valor100++;
    }

    const senia = seniaVal != null && seniaVal >= 0 ? seniaVal : 0;
    const { anchoCm, largoCm } = parseMedidaCm(medida);
    const { nombre, apellido } = splitNombre(nombreFull);
    let telefono = normalizePhone(telRaw);
    if (!telefono) telefono = placeholderPhone(seq);

    const medioContacto = mapMedio(medio);
    const ventaDesdeCsv = mapEstadoVenta(ventaCell);
    let estadoFabricacion = mapEstadoFabricacion(fabCell);
    /** Foto enviada implica sello ya fabricado (se lee del CSV; en DB la venta va como Transferido). */
    if (ventaDesdeCsv === 'Foto') estadoFabricacion = 'Hecho';
    const estadoVenta = 'Transferido';
    const estado_orden = 'Seguimiento Enviado';
    const estado_envio = 'Seguimiento Enviado';
    const tipoSello = mapTipoSello(notaCol);

    const createdAt = `${fecha}T12:00:00.000Z`;
    const notaImport = `Importación histórica Clientes Viejos (${path.basename(csvPath)})`;
    const notaAjustes = [];
    if (fechaOrigen === 'siguiente') notaAjustes.push('Fecha vacía en CSV: misma fecha que la primera fila siguiente con fecha.');
    if (fechaOrigen === 'ultima') notaAjustes.push('Fecha vacía en CSV: misma fecha que el pedido anterior ya importado.');
    if (aplicoValor100) notaAjustes.push('Precio columna Sello no informado: 100 (import histórico).');

    const payload = {
      cliente: {
        nombre,
        apellido,
        telefono,
        medio_contacto: medioContacto,
        mail: null,
        dni: null,
      },
      orden: {
        fecha,
        estado_orden,
        estado_envio,
        empresa_envio: null,
        tipo_envio: null,
        direccion_id: null,
        seguimiento: null,
        taken_by: null,
      },
      sello: {
        fecha,
        diseno: diseno.slice(0, 500),
        nota: [notaCol, notaImport, ...notaAjustes].filter(Boolean).join(' · ').slice(0, 2000),
        valor,
        senia,
        estado_fabricacion: estadoFabricacion,
        estado_venta: estadoVenta,
        tipo: tipoSello,
        item_type: 'SELLO',
        item_config: {},
        ancho_real: anchoCm,
        largo_real: largoCm,
        estado_vectorizacion: 'BASE',
      },
      createdAt,
    };

    if (args.dryRun) {
      const tags = [];
      if (fechaOrigen === 'siguiente') tags.push('fecha←siguiente');
      if (fechaOrigen === 'ultima') tags.push('fecha←anterior');
      if (aplicoValor100) tags.push('valor=100');
      const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
      console.log(
        `OK dry-run fila ${r + 1}: ${fecha} | ${nombreFull || nombre} | ${diseno} | ${anchoCm}x${largoCm} cm | $${valor} | fab ${estadoFabricacion} | venta ${estadoVenta} | envío ${estado_envio}${tagStr}`,
      );
      ok++;
      continue;
    }

    if (skipFirstRemaining > 0) {
      skipFirstRemaining--;
      continue;
    }

    const { data: clienteIns, error: eCliente } = await supabase.from('clientes').insert(payload.cliente).select('id').single();
    if (eCliente) {
      console.error(`Fila ${r + 1}: error cliente`, formatNodeFetchDetail(eCliente) || eCliente.message);
      skipped++;
      skip.dbError++;
      continue;
    }

    const clienteId = clienteIns.id;

    const { data: ordenIns, error: eOrden } = await supabase
      .from('ordenes')
      .insert({
        cliente_id: clienteId,
        fecha: payload.orden.fecha,
        estado_orden: payload.orden.estado_orden,
        estado_envio: payload.orden.estado_envio,
        empresa_envio: payload.orden.empresa_envio,
        tipo_envio: payload.orden.tipo_envio,
        direccion_id: payload.orden.direccion_id,
        seguimiento: payload.orden.seguimiento,
        taken_by: payload.orden.taken_by,
      })
      .select('id')
      .single();

    if (eOrden) {
      console.error(`Fila ${r + 1}: error orden`, eOrden.message);
      await supabase.from('clientes').delete().eq('id', clienteId);
      skipped++;
      skip.dbError++;
      continue;
    }

    const ordenId = ordenIns.id;

    const { error: eSello } = await supabase.from('sellos').insert({
      orden_id: ordenId,
      ...payload.sello,
    });

    if (eSello) {
      console.error(`Fila ${r + 1}: error sello`, eSello.message);
      await supabase.from('ordenes').delete().eq('id', ordenId);
      await supabase.from('clientes').delete().eq('id', clienteId);
      skipped++;
      skip.dbError++;
      continue;
    }

    await supabase.from('ordenes').update({ created_at: createdAt }).eq('id', ordenId);
    const { data: sellosIds } = await supabase.from('sellos').select('id').eq('orden_id', ordenId).limit(1);
    if (sellosIds?.[0]?.id) {
      await supabase.from('sellos').update({ created_at: createdAt }).eq('id', sellosIds[0].id);
    }

    ok++;
    if (ok % 50 === 0) console.log(`… ${ok} importados`);
  }

  console.log(`Listo. Importados: ${ok}, omitidos: ${skipped}${args.dryRun ? ' (dry-run)' : ''}`);
  if (synthetic.valor100 || synthetic.fechaDesdeSiguiente || synthetic.fechaDesdeUltima) {
    console.log('\nAjustes automáticos:');
    if (synthetic.fechaDesdeSiguiente)
      console.log(`  · Fecha copiada de la primera fila siguiente con fecha válida: ${synthetic.fechaDesdeSiguiente} filas`);
    if (synthetic.fechaDesdeUltima)
      console.log(`  · Fecha igual al último pedido ya importado (no había fecha abajo): ${synthetic.fechaDesdeUltima} filas`);
    if (synthetic.valor100) console.log(`  · Valor sello por defecto $100 (sin monto en CSV): ${synthetic.valor100} filas`);
  }
  if (skipped > 0) {
    console.log('\nOmisiones por motivo:');
    if (skip.notDataRow)
      console.log(
        `  · ${skip.notDataRow} filas vacías o basura de sección (sin nombre/diseño/medida/medio ni fecha d/m).`,
      );
    if (skip.badFecha) {
      console.log(
        `  · ${skip.badFecha} filas con datos pero sin fecha usable (ni en la celda, ni en filas siguientes, ni pedido previo en el archivo).`,
      );
      if (skipSamples.badFecha.length) console.log('    Ejemplos:', skipSamples.badFecha.join(' | '));
    }
    if (skip.dbError) console.log(`  · ${skip.dbError} error al insertar en la base (ver mensajes arriba).`);
    console.log('\nTip: --verbose-skips lista filas con fecha ausente al final del archivo.');
  }
  } finally {
    if (lockHeld) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
