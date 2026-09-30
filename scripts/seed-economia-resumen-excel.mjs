/**
 * Carga el resumen mensual del Excel (Jul-24 → Ago-25) en economia_gastos_mensuales.
 * Marca cada mes como fuente=resumen + gastos_reales, con publicidad / dólares / inversión
 * como desglose (sin inventar sueldos). No pisa meses con detalle fino ni Sep-25+.
 *
 * Uso:
 *   node scripts/seed-economia-resumen-excel.mjs              # dry-run (default)
 *   node scripts/seed-economia-resumen-excel.mjs --write      # escribe en Supabase
 *   node scripts/seed-economia-resumen-excel.mjs --write --with-usd
 *
 * Env (.env en la raíz):
 *   SUPABASE_URL o VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (recomendado; evita RLS)
 *   ECONOMIA_OWNER_EMAIL (opcional; default julian.475@hotmail.com)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile(envPath) {
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
    /* missing file ok */
  }
}

loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, 'services', 'andreani-worker', '.env'));

/** Filas del Excel de cierre (Gastos R ya incluye publicidad). */
const EXCEL_ROWS = [
  // Jul-24…Ene-25: cierre completo (facturación + unidades) porque el catálogo de pedidos está incompleto/vacío.
  { month: '2024-07', facturacion: 5_791_000, unidades: 147, gastosR: 1_800_000, publicidad: 96_000, dolaresArs: 980_000, inversion: 315_000, totalUsd: null, withVentas: true },
  { month: '2024-08', facturacion: 5_996_300, unidades: 148, gastosR: 4_500_000, publicidad: 126_000, dolaresArs: 700_000, inversion: 163_000, totalUsd: null, withVentas: true },
  { month: '2024-09', facturacion: 7_393_000, unidades: 177, gastosR: 4_800_000, publicidad: 220_000, dolaresArs: 255_000, inversion: 294_000, totalUsd: null, withVentas: true },
  { month: '2024-10', facturacion: 8_771_000, unidades: 154, gastosR: 5_530_000, publicidad: 275_000, dolaresArs: 427_000, inversion: 550_000, totalUsd: 800, withVentas: true },
  { month: '2024-11', facturacion: 8_198_500, unidades: 148, gastosR: 6_888_000, publicidad: 470_000, dolaresArs: 1_465_000, inversion: 339_000, totalUsd: 600, withVentas: true },
  { month: '2024-12', facturacion: 11_256_200, unidades: 178, gastosR: 8_000_000, publicidad: 800_000, dolaresArs: 2_176_500, inversion: 90_000, totalUsd: 200, withVentas: true },
  { month: '2025-01', facturacion: 12_827_500, unidades: 207, gastosR: 7_500_000, publicidad: 1_050_000, dolaresArs: 1_419_000, inversion: 163_000, totalUsd: 300, withVentas: true },
  // Feb-25…Jul-25: solo gastos/ganancias; las ventas salen de pedidos.
  { month: '2025-02', facturacion: null, unidades: null, gastosR: 8_000_000, publicidad: 1_200_000, dolaresArs: 2_410_000, inversion: 90_000, totalUsd: 1100, withVentas: false },
  { month: '2025-03', facturacion: null, unidades: null, gastosR: 9_000_000, publicidad: 2_000_000, dolaresArs: 3_470_000, inversion: 90_000, totalUsd: 1960, withVentas: false },
  { month: '2025-04', facturacion: null, unidades: null, gastosR: 9_000_000, publicidad: 2_000_000, dolaresArs: 1_965_000, inversion: 90_000, totalUsd: 1390, withVentas: false },
  { month: '2025-05', facturacion: null, unidades: null, gastosR: 10_200_000, publicidad: 2_000_000, dolaresArs: 3_800_000, inversion: 90_000, totalUsd: 2000, withVentas: false },
  { month: '2025-06', facturacion: null, unidades: null, gastosR: 10_800_000, publicidad: 1_650_000, dolaresArs: 2_380_000, inversion: 90_000, totalUsd: 2800, withVentas: false },
  { month: '2025-07', facturacion: null, unidades: null, gastosR: 10_300_000, publicidad: 2_085_000, dolaresArs: 1_950_000, inversion: 3_290_000, totalUsd: 1500, withVentas: false },
  // Ago-25: pedidos incompletos en catálogo → forzar facturación del Excel.
  { month: '2025-08', facturacion: 15_800_000, unidades: null, gastosR: 10_400_000, publicidad: 2_130_000, dolaresArs: 4_000_000, inversion: 2_860_000, totalUsd: 3000, withVentas: true },
];

/** Meses que forzamos a resumen aunque tengan sueldos/detalle (cierre Excel manda). */
const FORCE_RESUMEN_MONTHS = new Set(['2025-01']);

const DEFAULT_OWNER_EMAIL = 'julian.475@hotmail.com';

function parseArgs(argv) {
  const args = { write: false, withUsd: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--with-usd') args.withUsd = true;
    else if (argv[i] === '--dry-run') args.write = false;
  }
  return args;
}

function emptyFixed() {
  return {
    monotributos: 0,
    sueldos: [],
    contador: 0,
    electricidad: 0,
    agua: 0,
    internet: 0,
    alquiler: 0,
    seguro: 0,
    credito: 0,
  };
}

function emptyExtras() {
  return {
    publicidad: 0,
    envios: 0,
    inversiones_empresa: 0,
    compra_dolares: 0,
    gastos_varios: 0,
    automatizaciones: 0,
    remodelaciones: 0,
    impuestos: 0,
    inversion_cyprea: 0,
  };
}

function monthHasDetailedFixedCosts(bundle) {
  if (!bundle || typeof bundle !== 'object') return false;
  if (bundle.fuente === 'detalle') return true;
  if (bundle.fuente === 'resumen') return false;
  const fixed = bundle.fixed || {};
  const sueldos = Array.isArray(fixed.sueldos) ? fixed.sueldos : [];
  if (sueldos.some((s) => Number(s?.monto) > 0)) return true;
  return (
    Number(fixed.monotributos) > 0 ||
    Number(fixed.contador) > 0 ||
    Number(fixed.alquiler) > 0 ||
    Number(fixed.seguro) > 0 ||
    Number(fixed.credito) > 0 ||
    Number(fixed.electricidad) > 0 ||
    Number(fixed.agua) > 0 ||
    Number(fixed.internet) > 0
  );
}

function buildResumenBundle(row, existing) {
  const extras = { ...emptyExtras(), ...(existing?.extras || {}) };
  extras.publicidad = row.publicidad;
  extras.compra_dolares = row.dolaresArs;
  extras.inversiones_empresa = row.inversion;
  const out = {
    // Para resumen forzado no conservamos sueldos viejos (evitar mezclar con legado).
    fixed: FORCE_RESUMEN_MONTHS.has(row.month) ? emptyFixed() : existing?.fixed && typeof existing.fixed === 'object' ? existing.fixed : emptyFixed(),
    extras,
    ...(existing?.pagos && !FORCE_RESUMEN_MONTHS.has(row.month) ? { pagos: existing.pagos } : {}),
    fuente: 'resumen',
    gastos_reales: row.gastosR,
  };
  if (row.withVentas && row.facturacion != null) out.ventas_resumen = row.facturacion;
  if (row.withVentas && row.unidades != null) out.unidades_resumen = row.unidades;
  // Si el mes no lleva ventas del Excel, limpia overrides viejos.
  if (!row.withVentas) {
    delete out.ventas_resumen;
    delete out.unidades_resumen;
  }
  return out;
}

function midMonthIso(monthKey) {
  return `${monthKey}-15`;
}

async function resolveOwnerUserId(supabase, email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const want = email.toLowerCase();
  const user = (data?.users || []).find((u) => (u.email || '').toLowerCase() === want);
  if (!user) {
    throw new Error(`No se encontró usuario con email ${email}. Pasá ECONOMIA_OWNER_EMAIL o usá service role.`);
  }
  return user.id;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const ownerEmail = process.env.ECONOMIA_OWNER_EMAIL || DEFAULT_OWNER_EMAIL;

  if (!url || !key) {
    console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY (o anon).');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Modo: ${args.write ? 'WRITE' : 'DRY-RUN'} · email dueño: ${ownerEmail}`);
  if (!args.write) {
    console.log('(Por defecto no escribe. Usá --write para aplicar.)\n');
  }

  let userId;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    userId = await resolveOwnerUserId(supabase, ownerEmail);
  } else if (process.env.ECONOMIA_OWNER_USER_ID) {
    userId = process.env.ECONOMIA_OWNER_USER_ID;
  } else {
    console.error('Sin SERVICE_ROLE_KEY: definí ECONOMIA_OWNER_USER_ID (uuid) a mano.');
    process.exit(1);
  }
  console.log(`user_id: ${userId}`);

  const { data: existingRow, error: fetchErr } = await supabase
    .from('economia_gastos_mensuales')
    .select('months, legacy_fixed_scalar')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const months = { ...(existingRow?.months && typeof existingRow.months === 'object' ? existingRow.months : {}) };
  const legacyFixed = Number(existingRow?.legacy_fixed_scalar) || 0;

  const toApply = [];
  const skipped = [];

  for (const row of EXCEL_ROWS) {
    const cur = months[row.month];
    const force = FORCE_RESUMEN_MONTHS.has(row.month);
    if (!force && monthHasDetailedFixedCosts(cur)) {
      skipped.push({ month: row.month, reason: 'tiene detalle de fijos / fuente=detalle' });
      continue;
    }
    const next = buildResumenBundle(row, cur);
    toApply.push({ month: row.month, next, row, force });
  }

  console.log(`\nMeses a cargar: ${toApply.length}`);
  for (const { month, row, force } of toApply) {
    console.log(
      `  ${month}${force ? ' [FORCE]' : ''}  gastos_reales=${row.gastosR}` +
        (row.withVentas ? `  fact=${row.facturacion}  u=${row.unidades}` : '') +
        `  pub=${row.publicidad}  usd_ars=${row.dolaresArs}  inv=${row.inversion}` +
        (row.totalUsd != null ? `  total_usd=${row.totalUsd}` : ''),
    );
  }
  if (skipped.length) {
    console.log(`\nMeses omitidos: ${skipped.length}`);
    for (const s of skipped) console.log(`  ${s.month}: ${s.reason}`);
  }

  if (!args.write) {
    console.log('\nDry-run OK. Nada se escribió.');
    return;
  }

  // Backup local antes de escribir (no toca la DB).
  const backupDir = path.join(root, 'scripts', '_backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `economia_gastos_mensuales_${userId.slice(0, 8)}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        user_id: userId,
        legacy_fixed_scalar: legacyFixed,
        months: existingRow?.months ?? {},
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nBackup local: ${backupPath}`);

  for (const { month, next } of toApply) {
    months[month] = next;
  }

  const { error: upsertErr } = await supabase.from('economia_gastos_mensuales').upsert(
    {
      user_id: userId,
      months,
      legacy_fixed_scalar: legacyFixed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (upsertErr) throw upsertErr;
  console.log(`\nUpsert OK en economia_gastos_mensuales (${toApply.length} meses).`);

  if (args.withUsd) {
    let inserted = 0;
    for (const { row } of toApply) {
      if (row.totalUsd == null || row.totalUsd <= 0 || row.dolaresArs <= 0) continue;
      const note = `seed-excel-resumen ${row.month}`;
      const { data: existingMov } = await supabase
        .from('economia_movimientos_reales')
        .select('id')
        .eq('created_by', userId)
        .eq('movement_type', 'USD_PURCHASE')
        .eq('note', note)
        .maybeSingle();
      if (existingMov?.id) continue;
      const rate = row.dolaresArs / row.totalUsd;
      const { error: movErr } = await supabase.from('economia_movimientos_reales').insert({
        movement_date: midMonthIso(row.month),
        movement_type: 'USD_PURCHASE',
        amount_ars: row.dolaresArs,
        amount_usd: row.totalUsd,
        usd_rate: rate,
        note,
        created_by: userId,
      });
      if (movErr) throw movErr;
      inserted += 1;
    }
    console.log(`Movimientos USD_PURCHASE insertados: ${inserted}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
