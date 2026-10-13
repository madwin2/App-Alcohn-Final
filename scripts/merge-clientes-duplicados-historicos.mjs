/**
 * Unifica clientes duplicados de la carga histórica (mismo teléfono normalizado).
 *
 * Reglas (acordadas 2026-10-08):
 *   - Mismo teléfono = misma persona
 *   - Cliente canónico = el más viejo (created_at)
 *   - Nombre = el del canónico
 *   - Mail = el más nuevo no vacío
 *   - Excepción: teléfono 5492634312651 (Pablo Grilli) → mail imgrillisa@yahoo.com.ar
 *   - Seguimientos comerciales: si el canónico ya tiene ese tipo, se borra el del duplicado;
 *     si no, se reasigna al canónico
 *
 * Alcance: clusters donde al menos un cliente tiene un sello con nota
 * "Importación histórica". Se excluyen placeholders (+549110000…) y es_interno.
 *
 * Uso:
 *   node scripts/merge-clientes-duplicados-historicos.mjs              # dry-run
 *   node scripts/merge-clientes-duplicados-historicos.mjs --dry-run
 *   node scripts/merge-clientes-duplicados-historicos.mjs --apply --i-know-this-is-production
 *   node scripts/merge-clientes-duplicados-historicos.mjs --apply --i-know-this-is-production --limit 5
 *
 * Env:
 *   SUPABASE_URL o VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (recomendado; hace falta para escribir)
 *   IMPORT_SUPABASE_INSECURE_TLS=1  (solo si falla SSL en Windows)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Excepción: Pablo Grilli — quedarnos con yahoo. */
const MAIL_OVERRIDES_BY_PHONE_KEY = {
  '5492634312651': 'imgrillisa@yahoo.com.ar',
};

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
  console.warn('\n[AVISO] IMPORT_SUPABASE_INSECURE_TLS=1 → SSL desactivado solo en este proceso.\n');
}

function parseArgs(argv) {
  const args = { dryRun: true, apply: false, confirmProd: false, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (a === '--i-know-this-is-production') args.confirmProd = true;
    else if (a === '--limit') {
      args.limit = Number(argv[++i]);
      if (!Number.isFinite(args.limit) || args.limit < 1) {
        console.error('--limit debe ser un entero >= 1');
        process.exit(1);
      }
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else {
      console.error(`Arg desconocido: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Misma lógica que src/lib/utils/phoneNormalization.ts */
function normalizePhoneDigitsCliente(value) {
  const d = normalizePhoneDigits(value);
  if (d.length < 8) return '';
  if (d.startsWith('549')) return d;
  if (d.startsWith('54') && d.length >= 11) return `549${d.slice(2)}`;
  if (d.startsWith('9') && d.length >= 10) return `54${d}`;
  if (d.length === 10) return `549${d}`;
  if (d.length === 11 && d.startsWith('0')) return `549${d.slice(1)}`;
  if (d.startsWith('54')) return d;
  return `54${d}`;
}

function isPlaceholderClientePhone(value) {
  const d = normalizePhoneDigits(value);
  return /^549110000\d{6}$/.test(d);
}

function fullName(c) {
  return `${c.nombre || ''} ${c.apellido || ''}`.trim();
}

function createTimedFetch() {
  const ms = Number(process.env.IMPORT_FETCH_TIMEOUT_MS || 90000);
  const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  return (url, init = {}) => {
    if (!hasTimeout) return fetch(url, init);
    return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  };
}

async function fetchAllPages(supabase, table, select, { filter } = {}) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadImportHistClienteIds(supabase) {
  const rows = await fetchAllPages(
    supabase,
    'sellos',
    'orden_id, ordenes!inner(cliente_id)',
    { filter: (q) => q.ilike('nota', '%Importación histórica%') },
  );
  const ids = new Set();
  for (const r of rows) {
    const cid = r.ordenes?.cliente_id;
    if (cid) ids.add(cid);
  }
  return ids;
}

function buildClusters(clientes, importHistIds) {
  /** @type {Map<string, typeof clientes>} */
  const byPhone = new Map();
  for (const c of clientes) {
    if (c.es_interno) continue;
    if (!c.telefono || isPlaceholderClientePhone(c.telefono)) continue;
    const phoneKey = normalizePhoneDigitsCliente(c.telefono);
    if (!phoneKey) continue;
    if (!byPhone.has(phoneKey)) byPhone.set(phoneKey, []);
    byPhone.get(phoneKey).push(c);
  }

  const clusters = [];
  for (const [phoneKey, members] of byPhone) {
    if (members.length < 2) continue;
    const touchesHist = members.some((m) => importHistIds.has(m.id));
    if (!touchesHist) continue;

    members.sort((a, b) => {
      const ta = a.created_at || '';
      const tb = b.created_at || '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    const canon = members[0];
    const duplicates = members.slice(1);

    let mailPropuesto = null;
    const withMail = [...members]
      .filter((m) => m.mail && String(m.mail).trim())
      .sort((a, b) => {
        const ta = a.created_at || '';
        const tb = b.created_at || '';
        if (ta !== tb) return ta > tb ? -1 : 1;
        return a.id > b.id ? -1 : 1;
      });
    if (withMail.length) mailPropuesto = String(withMail[0].mail).trim();

    const override = MAIL_OVERRIDES_BY_PHONE_KEY[phoneKey];
    if (override) mailPropuesto = override;

    const nombres = new Set(members.map((m) => fullName(m).toLowerCase()));

    clusters.push({
      phoneKey,
      canon,
      duplicates,
      members,
      mailPropuesto,
      nombresDistintos: nombres.size,
      nOrdenesHint: null,
    });
  }

  clusters.sort((a, b) => a.phoneKey.localeCompare(b.phoneKey));
  return clusters;
}

async function countByCliente(supabase, table, clienteIds) {
  const counts = new Map();
  for (const id of clienteIds) counts.set(id, 0);
  // Pedir en chunks por .in()
  const chunk = 80;
  const ids = [...clienteIds];
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await supabase.from(table).select('cliente_id').in('cliente_id', slice);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    for (const row of data || []) {
      counts.set(row.cliente_id, (counts.get(row.cliente_id) || 0) + 1);
    }
  }
  return counts;
}

async function mergeOneCluster(supabase, cluster, { dryRun }) {
  const { canon, duplicates, phoneKey, mailPropuesto } = cluster;
  const dupIds = duplicates.map((d) => d.id);
  const label = `${phoneKey} → ${fullName(canon)} (${canon.id.slice(0, 8)}…) +${dupIds.length} dup`;

  if (dryRun) {
    return { ok: true, label, actions: ['dry-run'] };
  }

  const actions = [];

  // 1) Seguimientos: borrar los del dup si el canónico ya tiene ese tipo; si no, reasignar
  const { data: segs, error: eSeg } = await supabase
    .from('comercial_cliente_seguimientos')
    .select('id, cliente_id, tipo')
    .in('cliente_id', [canon.id, ...dupIds]);
  if (eSeg) throw new Error(`seguimientos select: ${eSeg.message}`);

  const tiposCanon = new Set((segs || []).filter((s) => s.cliente_id === canon.id).map((s) => s.tipo));
  const segDelete = [];
  const segMove = [];
  for (const s of segs || []) {
    if (s.cliente_id === canon.id) continue;
    if (tiposCanon.has(s.tipo)) segDelete.push(s.id);
    else {
      segMove.push(s.id);
      tiposCanon.add(s.tipo); // evitar dos dups del mismo tipo
    }
  }
  if (segDelete.length) {
    const { error } = await supabase.from('comercial_cliente_seguimientos').delete().in('id', segDelete);
    if (error) throw new Error(`seguimientos delete: ${error.message}`);
    actions.push(`segs deleted ${segDelete.length}`);
  }
  if (segMove.length) {
    const { error } = await supabase
      .from('comercial_cliente_seguimientos')
      .update({ cliente_id: canon.id })
      .in('id', segMove);
    if (error) throw new Error(`seguimientos move: ${error.message}`);
    actions.push(`segs moved ${segMove.length}`);
  }

  // 2) Exclusiones blandas (sin FK)
  const { data: excl, error: eEx } = await supabase
    .from('comercial_exclusiones')
    .select('id, entity_id')
    .eq('entity_type', 'cliente')
    .in('entity_id', [canon.id, ...dupIds]);
  if (eEx) throw new Error(`exclusiones select: ${eEx.message}`);

  const canonExcluded = (excl || []).some((e) => e.entity_id === canon.id);
  for (const e of excl || []) {
    if (e.entity_id === canon.id) continue;
    if (canonExcluded) {
      const { error } = await supabase.from('comercial_exclusiones').delete().eq('id', e.id);
      if (error) throw new Error(`exclusiones delete: ${error.message}`);
      actions.push('excl deleted');
    } else {
      const { error } = await supabase
        .from('comercial_exclusiones')
        .update({ entity_id: canon.id })
        .eq('id', e.id);
      if (error) throw new Error(`exclusiones move: ${error.message}`);
      actions.push('excl moved');
      // solo una puede apuntar al canónico (UNIQUE)
      break;
    }
  }

  // 3) Reasignar FKs
  for (const table of ['ordenes', 'direcciones', 'mockup_solicitudes']) {
    const { data, error } = await supabase
      .from(table)
      .update({ cliente_id: canon.id })
      .in('cliente_id', dupIds)
      .select('id');
    if (error) throw new Error(`${table} reassign: ${error.message}`);
    if (data?.length) actions.push(`${table} ${data.length}`);
  }

  // 4) Mail UNIQUE: vaciar mails de dups (y del canónico si vamos a poner otro)
  const mailNorm = mailPropuesto ? mailPropuesto.trim().toLowerCase() : null;
  for (const d of duplicates) {
    if (d.mail) {
      const { error } = await supabase.from('clientes').update({ mail: null }).eq('id', d.id);
      if (error) throw new Error(`clear mail dup: ${error.message}`);
    }
  }
  if (mailNorm && String(canon.mail || '').trim().toLowerCase() !== mailNorm) {
    // por si el mail vive en un dup ya limpiado, o hay que setear override
    const { error } = await supabase.from('clientes').update({ mail: mailPropuesto.trim() }).eq('id', canon.id);
    if (error) throw new Error(`set mail canon: ${error.message}`);
    actions.push(`mail→${mailPropuesto}`);
  }

  // 5) Teléfono canónico (formato app: dígitos sin +)
  if (normalizePhoneDigits(canon.telefono) !== phoneKey) {
    const { error } = await supabase.from('clientes').update({ telefono: phoneKey }).eq('id', canon.id);
    if (error) throw new Error(`set telefono canon: ${error.message}`);
    actions.push(`tel→${phoneKey}`);
  }

  // 6) Borrar duplicados (ya sin FKs)
  const { error: eDel } = await supabase.from('clientes').delete().in('id', dupIds);
  if (eDel) throw new Error(`delete dups: ${eDel.message}`);
  actions.push(`deleted ${dupIds.length}`);

  return { ok: true, label, actions };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Uso:
  node scripts/merge-clientes-duplicados-historicos.mjs [--dry-run]
  node scripts/merge-clientes-duplicados-historicos.mjs --apply --i-know-this-is-production [--limit N]`);
    process.exit(0);
  }

  if (args.apply && !args.confirmProd) {
    console.error('Para escribir en producción hace falta --apply --i-know-this-is-production');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL/VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o ANON).');
    process.exit(1);
  }
  if (args.apply && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('--apply requiere SUPABASE_SERVICE_ROLE_KEY (anon puede fallar por RLS).');
    process.exit(1);
  }

  const supabase = createClient(url, key, { global: { fetch: createTimedFetch() } });

  console.log(args.dryRun ? '=== DRY-RUN (no escribe) ===\n' : '=== APPLY (escribe en producción) ===\n');

  console.log('Cargando clientes…');
  const clientes = await fetchAllPages(
    supabase,
    'clientes',
    'id, nombre, apellido, telefono, mail, medio_contacto, es_interno, created_at',
  );
  console.log(`  ${clientes.length} clientes`);

  console.log('Detectando clientes de importación histórica…');
  const importHistIds = await loadImportHistClienteIds(supabase);
  console.log(`  ${importHistIds.size} clientes con sello "Importación histórica"`);

  let clusters = buildClusters(clientes, importHistIds);
  if (args.limit) {
    clusters = clusters.slice(0, args.limit);
    console.log(`\n--limit ${args.limit}: solo ${clusters.length} grupos`);
  }

  const allIds = new Set();
  for (const cl of clusters) for (const m of cl.members) allIds.add(m.id);
  console.log('\nContando órdenes por cliente del plan…');
  const ordenCounts = await countByCliente(supabase, 'ordenes', allIds);

  let ordenesAReasignar = 0;
  let clientesABorrar = 0;
  let gruposNombresDistintos = 0;
  for (const cl of clusters) {
    clientesABorrar += cl.duplicates.length;
    if (cl.nombresDistintos > 1) gruposNombresDistintos++;
    for (const d of cl.duplicates) ordenesAReasignar += ordenCounts.get(d.id) || 0;
  }

  console.log(`
Resumen del plan
  Grupos:                    ${clusters.length}
  Clientes a borrar:         ${clientesABorrar}
  Órdenes a reasignar:       ${ordenesAReasignar}
  Grupos nombres distintos:  ${gruposNombresDistintos}
  Overrides de mail:         ${Object.keys(MAIL_OVERRIDES_BY_PHONE_KEY).length} (Grilli→yahoo)
`);

  // Mostrar hasta 20 ejemplos
  const ejemplos = [...clusters]
    .sort((a, b) => {
      const oa = a.duplicates.reduce((s, d) => s + (ordenCounts.get(d.id) || 0), 0);
      const ob = b.duplicates.reduce((s, d) => s + (ordenCounts.get(d.id) || 0), 0);
      return ob - oa;
    })
    .slice(0, 20);

  console.log('Ejemplos (hasta 20, por órdenes a mover):');
  for (const cl of ejemplos) {
    const move = cl.duplicates.reduce((s, d) => s + (ordenCounts.get(d.id) || 0), 0);
    const names = [...new Set(cl.members.map(fullName))].join(' | ');
    console.log(
      `  ${cl.phoneKey}  canon=${fullName(cl.canon)}  mail=${cl.mailPropuesto || '—'}  ` +
        `dups=${cl.duplicates.length}  ordenes→${move}  nombres: ${names}`,
    );
  }

  if (args.dryRun) {
    console.log('\nDry-run OK. Para aplicar:');
    console.log(
      '  node scripts/merge-clientes-duplicados-historicos.mjs --apply --i-know-this-is-production',
    );
    console.log('Opcional: --limit 5 para probar de a poco.\n');
    return;
  }

  console.log('\nAplicando merges…');
  let ok = 0;
  let fail = 0;
  for (const cl of clusters) {
    try {
      const r = await mergeOneCluster(supabase, cl, { dryRun: false });
      ok++;
      console.log(`  OK ${r.label}  [${r.actions.join(', ')}]`);
    } catch (err) {
      fail++;
      console.error(`  FAIL ${cl.phoneKey} ${fullName(cl.canon)}: ${err.message || err}`);
    }
  }
  console.log(`\nListo. OK=${ok} FAIL=${fail}`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
