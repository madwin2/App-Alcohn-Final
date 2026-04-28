/**
 * Importa ventas históricas desde CSV a Supabase (clientes + ordenes + sellos).
 *
 * Uso:
 *   node scripts/import-ventas-csv.mjs --dry-run
 *   node scripts/import-ventas-csv.mjs --file "ventas-2026-04-27 - Hoja 1.csv"
 *
 * Variables de entorno (desde .env en la raíz del proyecto o exportadas):
 *   SUPABASE_URL o VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (recomendado para import masivo; evita RLS)
 *   o VITE_SUPABASE_ANON_KEY solo si tenés políticas que permitan insert
 *
 * Notas:
 * - Un cliente por fila (evita fusionar mal a quienes no tienen teléfono).
 * - Teléfono vacío: se asigna un número placeholder único +549110000XXXXX importable.
 * - Nombre completo en una columna: primera palabra = nombre, resto = apellido.
 * - Medidas tipo 37x37 se interpretan en mm (como en la app).
 * - estado_orden / estado_venta según columna venta (Foto / Transferido).
 * - nota en sello: indica importación CSV.
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

const YEAR = 2026;

function parseArgs(argv) {
  const args = { dryRun: false, file: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    }
  }
  return args;
}

function parseFechaCell(s) {
  if (!s || !String(s).trim()) return null;
  const t = String(s).trim().replace(/-/g, '/');
  const parts = t.split('/');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!day || !month || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

function parseMedida(medidaRaw) {
  const s = String(medidaRaw || '')
    .trim()
    .toLowerCase()
    .replace(/×/g, 'x');
  const m = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!m) return { wMm: 50, hMm: 30 };
  return { wMm: parseFloat(m[1]), hMm: parseFloat(m[2]) };
}

function parseMoney(s) {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function mapFabricacion(cell) {
  const c = String(cell || '').toLowerCase();
  if (c.includes('hecho')) return 'Hecho';
  return 'Hecho';
}

function mapEstadoVenta(cell) {
  const c = String(cell || '').trim().toLowerCase();
  if (c.includes('transferido')) return 'Transferido';
  if (c.includes('foto')) return 'Foto';
  return 'Foto';
}

function mapEstadoOrden(ventaCell) {
  const v = mapEstadoVenta(ventaCell);
  if (v === 'Transferido') return 'Transferido';
  return 'Foto';
}

/** Teléfono placeholder único para filas sin número (evita NOT NULL / duplicados lógicos). */
function placeholderPhone(seq) {
  const n = String(seq).padStart(6, '0');
  return `+549110000${n}`;
}

function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  if (raw.trim().startsWith('+')) return raw.trim();
  if (d.startsWith('54')) return `+${d}`;
  if (d.startsWith('9') || d.length >= 10) return `+54${d}`;
  return `+54${d}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = args.file
    ? path.isAbsolute(args.file)
      ? args.file
      : path.join(root, args.file)
    : path.join(root, 'ventas-2026-04-27 - Hoja 1.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('No existe el archivo:', csvPath);
    process.exit(1);
  }

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

    supabase = createClient(url, key);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

  let headerSkipped = false;
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(',').map((c) => c.trim());
    if (!headerSkipped) {
      if (cols[0]?.toLowerCase().includes('fecha')) {
        headerSkipped = true;
        continue;
      }
    }
    // Pad hasta 11 columnas
    while (cols.length < 11) cols.push('');
    rows.push({ lineNum: i + 1, cols });
  }

  console.log(`Filas de datos: ${rows.length}${args.dryRun ? ' (dry-run)' : ''}`);

  let seq = 0;
  let ok = 0;
  let skipped = 0;

  for (const { lineNum, cols } of rows) {
    seq += 1;
    const fechaCell = cols[0];
    const medio = cols[1];
    const telRaw = cols[2];
    const nombreFull = cols[3];
    const diseno = cols[4] || 'Sin diseño';
    const medida = cols[6];
    const fabCell = cols[7];
    const ventaCell = cols[8];
    const seniaVal = parseMoney(cols[9]);
    const totalVal = parseMoney(cols[10]);

    const fecha = parseFechaCell(fechaCell);
    if (!fecha) {
      console.log(`L${lineNum}: sin fecha válida, omitido`);
      skipped++;
      continue;
    }

    let valor = totalVal;
    if (valor == null && seniaVal != null) valor = seniaVal;
    if (valor == null || valor < 0) {
      console.log(`L${lineNum}: sin monto total, omitido`);
      skipped++;
      continue;
    }

    const senia = seniaVal != null && seniaVal >= 0 ? seniaVal : 0;

    const { wMm, hMm } = parseMedida(medida);
    const { nombre, apellido } = splitNombre(nombreFull);
    let telefono = normalizePhone(telRaw);
    if (!telefono) telefono = placeholderPhone(seq);

    const medioContacto = mapMedio(medio);
    const estadoFabricacion = mapFabricacion(fabCell);
    const estadoVenta = mapEstadoVenta(ventaCell);
    const estadoOrden = mapEstadoOrden(ventaCell);

    const createdAt = `${fecha}T12:00:00.000Z`;

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
        estado_orden: estadoOrden,
        estado_envio: 'Sin envio',
        empresa_envio: null,
        tipo_envio: null,
        direccion_id: null,
        seguimiento: null,
        taken_by: null,
      },
      sello: {
        fecha,
        diseno: diseno.slice(0, 500),
        nota: 'Importación histórica ene-2026 (CSV)',
        valor,
        senia,
        estado_fabricacion: estadoFabricacion,
        estado_venta: estadoVenta,
        tipo: 'Clasico',
        item_type: 'SELLO',
        item_config: {},
        ancho_real: String(wMm / 10),
        largo_real: String(hMm / 10),
        estado_vectorizacion: 'BASE',
      },
      createdAt,
    };

    if (args.dryRun) {
      console.log(`OK dry-run L${lineNum}: ${fecha} | ${nombreFull || nombre} | ${diseno} | $${valor}`);
      ok++;
      continue;
    }

    const { data: clienteIns, error: eCliente } = await supabase.from('clientes').insert(payload.cliente).select('id').single();
    if (eCliente) {
      console.error(`L${lineNum}: error cliente`, eCliente.message);
      skipped++;
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
      console.error(`L${lineNum}: error orden`, eOrden.message);
      await supabase.from('clientes').delete().eq('id', clienteId);
      skipped++;
      continue;
    }

    const ordenId = ordenIns.id;

    const { error: eSello } = await supabase.from('sellos').insert({
      orden_id: ordenId,
      ...payload.sello,
    });

    if (eSello) {
      console.error(`L${lineNum}: error sello`, eSello.message);
      await supabase.from('ordenes').delete().eq('id', ordenId);
      await supabase.from('clientes').delete().eq('id', clienteId);
      skipped++;
      continue;
    }

    await supabase.from('ordenes').update({ created_at: createdAt }).eq('id', ordenId);
    const { data: sellosIds } = await supabase.from('sellos').select('id').eq('orden_id', ordenId).limit(1);
    if (sellosIds?.[0]?.id) {
      await supabase.from('sellos').update({ created_at: createdAt }).eq('id', sellosIds[0].id);
    }

    ok++;
    if (ok % 20 === 0) console.log(`… ${ok} importados`);
  }

  console.log(`Listo. Importados: ${ok}, omitidos: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
