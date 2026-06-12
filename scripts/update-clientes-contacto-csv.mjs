/**
 * Actualiza teléfono y/o mail de clientes existentes desde CSV (p. ej. supabase_update.csv).
 *
 * Columnas esperadas:
 *   id, nombre, apellido, telefono, mail, updated_telefono, updated_mail
 *
 * - updated_telefono = si  → escribe `telefono` del CSV (normalizado E.164)
 * - updated_telefono = no  → no toca el teléfono en Supabase (ej. dejar placeholder del import)
 * - updated_mail = si      → escribe `mail` del CSV
 * - updated_mail = no      → no toca el mail
 *
 * `mail` es UNIQUE en la tabla: si otro cliente ya tiene ese mail, se omite el mail
 * y se actualiza el teléfono igual (si corresponde). Conflictos → update-clientes-contacto-conflicts.csv
 *
 * Uso:
 *   node scripts/update-clientes-contacto-csv.mjs --dry-run --file supabase_update.csv
 *   node scripts/update-clientes-contacto-csv.mjs --file supabase_update.csv
 *
 * Variables: SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (recomendado).
 * TLS Windows: IMPORT_SUPABASE_INSECURE_TLS=1 (igual que import-clientes-viejos).
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

if (process.env.IMPORT_SUPABASE_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('\n[AVISO] IMPORT_SUPABASE_INSECURE_TLS=1 → SSL desactivado en este proceso.\n');
}

function parseArgs(argv) {
  const args = { dryRun: false, file: path.join(root, 'supabase_update.csv') };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (!argv[i].startsWith('-') && argv[i].endsWith('.csv')) args.file = argv[i];
  }
  if (!path.isAbsolute(args.file)) args.file = path.join(root, args.file);
  return args;
}

const PAGE = 1000;

function mailKey(mail) {
  return String(mail || '').trim().toLowerCase();
}

async function loadMailIndex(supabase) {
  const mailToId = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, mail')
      .not('mail', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const c of data) {
      const k = mailKey(c.mail);
      if (k) mailToId.set(k, c.id);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return mailToId;
}

/** Quita mails que chocan con otro id (BD o fila anterior del CSV). */
function applyMailConflictRules(rows, mailToId) {
  const conflicts = [];
  let skippedMail = 0;

  for (const row of rows) {
    if (!row.patch.mail) continue;
    const key = mailKey(row.patch.mail);
    const owner = mailToId.get(key);
    if (owner && owner !== row.id) {
      conflicts.push({
        id: row.id,
        nombre: row.nombre,
        apellido: row.apellido,
        mail: row.patch.mail,
        conflict_owner_id: owner,
        reason: 'mail ya usado por otro cliente (o fila anterior del CSV)',
      });
      delete row.patch.mail;
      row.notes.push('mail omitido: UNIQUE (otro cliente)');
      skippedMail++;
      if (!Object.keys(row.patch).length) row.skipUpdate = true;
    } else {
      mailToId.set(key, row.id);
    }
  }

  return { conflicts, skippedMail };
}

function isDuplicateMailError(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return m.includes('clientes_mail_key') || m.includes('duplicate key') && m.includes('mail');
}

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
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row);
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

function flagSi(cell) {
  return String(cell || '').trim().toLowerCase() === 'si';
}

function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const t = String(raw || '').trim();
  if (t.startsWith('+')) return t.replace(/\s/g, '');
  if (d.startsWith('54')) return `+${d}`;
  if (d.startsWith('9') || d.length >= 10) return `+54${d}`;
  return `+54${d}`;
}

function normalizeMail(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!s.includes('@')) return null;
  return s;
}

function isPlaceholderPhone(tel) {
  return /^\+?549110000\d{6}$/.test(String(tel || '').replace(/\s/g, ''));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.file)) {
    console.error('No existe:', args.file);
    process.exit(1);
  }

  const table = parseCsv(fs.readFileSync(args.file, 'utf8'));
  if (table.length < 2) {
    console.error('CSV vacío.');
    process.exit(1);
  }

  const headerIdx = buildHeaderIndex(table[0]);
  const required = ['id', 'telefono', 'mail', 'updated_telefono', 'updated_mail'];
  const missing = required.filter((k) => headerIdx[k] === undefined);
  if (missing.length) {
    console.error('Faltan columnas:', missing.join(', '));
    process.exit(1);
  }

  const rows = [];
  const seenIds = new Map();
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const id = col(headerIdx, ['id'], row);
    if (!id) continue;

    const updTel = flagSi(col(headerIdx, ['updated_telefono'], row));
    const updMail = flagSi(col(headerIdx, ['updated_mail'], row));
    if (!updTel && !updMail) continue;

    const telRaw = col(headerIdx, ['telefono'], row);
    const mailRaw = col(headerIdx, ['mail'], row);
    const nombre = col(headerIdx, ['nombre'], row);
    const apellido = col(headerIdx, ['apellido'], row);

    const patch = {};
    const notes = [];

    if (updTel) {
      const tel = normalizePhone(telRaw);
      if (!tel) {
        notes.push('tel marcado si pero valor inválido/vacío');
      } else {
        patch.telefono = tel;
        if (isPlaceholderPhone(tel)) notes.push('tel nuevo sigue siendo placeholder');
      }
    }

    if (updMail) {
      const mail = normalizeMail(mailRaw);
      if (!mail) {
        notes.push('mail marcado si pero vacío o sin @');
      } else {
        patch.mail = mail;
      }
    }

    if (!Object.keys(patch).length) continue;

    if (seenIds.has(id)) {
      console.warn(`Aviso: id duplicado en CSV (${id}), se usa la última fila.`);
    }
    seenIds.set(id, true);

    rows.push({ id, nombre, apellido, patch, updTel, updMail, notes, skipUpdate: false });
  }

  console.log(`Filas con al menos un campo a actualizar: ${rows.length}`);
  const stats = { tel: 0, mail: 0, both: 0 };
  for (const row of rows) {
    const hasTel = 'telefono' in row.patch;
    const hasMail = 'mail' in row.patch;
    if (hasTel) stats.tel++;
    if (hasMail) stats.mail++;
    if (hasTel && hasMail) stats.both++;
  }
  console.log(`  · solo teléfono: ${stats.tel - stats.both}`);
  console.log(`  · solo mail: ${stats.mail - stats.both}`);
  console.log(`  · teléfono y mail: ${stats.both}`);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL y clave (SERVICE_ROLE recomendado).');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Aviso: sin SERVICE_ROLE_KEY puede fallar por RLS.');
  }

  const supabase = createClient(url, key);
  console.log('Cargando mails existentes en Supabase…');
  const mailToId = await loadMailIndex(supabase);
  const { conflicts, skippedMail } = applyMailConflictRules(rows, mailToId);
  if (skippedMail > 0) {
    console.log(
      `\n${skippedMail} filas con mail omitido (UNIQUE: otro cliente o duplicado en el CSV). Detalle en scripts/update-clientes-contacto-conflicts.csv\n`,
    );
    const lines = [
      'id,nombre,apellido,mail,conflict_owner_id,reason',
      ...conflicts.map(
        (c) =>
          `${c.id},"${String(c.nombre).replace(/"/g, '""')}","${String(c.apellido).replace(/"/g, '""')}",${c.mail},${c.conflict_owner_id},${c.reason}`,
      ),
    ];
    fs.writeFileSync(path.join(root, 'scripts', 'update-clientes-contacto-conflicts.csv'), lines.join('\n'), 'utf8');
  }

  if (args.dryRun) {
    const sample = rows.filter((r) => !r.skipUpdate).slice(0, 12);
    for (const row of sample) {
      const parts = [];
      if (row.patch.telefono) parts.push(`tel→${row.patch.telefono}`);
      if (row.patch.mail) parts.push(`mail→${row.patch.mail}`);
      const note = row.notes.length ? ` [${row.notes.join('; ')}]` : '';
      console.log(`  ${row.id.slice(0, 8)}… ${row.nombre} ${row.apellido}: ${parts.join(', ') || '(sin cambios)'}${note}`);
    }
    if (rows.length > sample.length) console.log(`  … y ${rows.filter((r) => !r.skipUpdate).length - sample.length} más aplicables`);
    console.log('\nDry-run: no se escribió nada en Supabase.');
    return;
  }

  let ok = 0;
  let err = 0;
  let notFound = 0;
  let retriedWithoutMail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.skipUpdate) continue;

    let patch = { ...row.patch };
    let { data, error } = await supabase.from('clientes').update(patch).eq('id', row.id).select('id').maybeSingle();

    if (error && isDuplicateMailError(error) && patch.mail) {
      const mail = patch.mail;
      delete patch.mail;
      retriedWithoutMail++;
      if (Object.keys(patch).length) {
        ({ data, error } = await supabase.from('clientes').update(patch).eq('id', row.id).select('id').maybeSingle());
        console.warn(`  ${row.id.slice(0, 8)}… mail omitido (${mail}), teléfono aplicado si había.`);
      } else {
        console.warn(`  ${row.id.slice(0, 8)}… solo mail en conflicto, sin cambios.`);
        err++;
        continue;
      }
    }

    if (error) {
      console.error(`Error ${row.id}:`, error.message);
      err++;
      continue;
    }
    if (!data) {
      console.warn(`No existe cliente ${row.id} (${row.nombre} ${row.apellido})`);
      notFound++;
      continue;
    }
    ok++;
    if (patch.mail) mailToId.set(mailKey(patch.mail), row.id);
    if (ok % 100 === 0) console.log(`… ${ok} actualizados`);
  }

  console.log(
    `\nListo. Actualizados: ${ok}, errores: ${err}, id no encontrado: ${notFound}, mails omitidos por conflicto: ${skippedMail}, reintentos sin mail: ${retriedWithoutMail}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
