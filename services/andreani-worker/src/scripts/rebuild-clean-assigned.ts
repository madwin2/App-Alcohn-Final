/**
 * Reconstruye etiquetas asignadas: Andreani limpia arriba + pie Pedido nuevo abajo.
 * Uso VPS: npx tsx src/scripts/rebuild-clean-assigned.ts [tracking...]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { rebuildCleanLabelPdf } from '../pdf/rebuild-clean.js';
import { loadConfig } from '../config.js';

function loadEnv(): Record<string, string> {
  const raw = readFileSync(path.resolve('.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}

const env = loadEnv();
const sb = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
);
const config = loadConfig();
const logoPath = existsSync(config.logoPath) ? config.logoPath : undefined;

const trackingsArg = process.argv.slice(2);
let trackings = trackingsArg;

if (!trackings.length) {
  const { data, error } = await sb
    .from('envios_andreani_etiquetas')
    .select('tracking')
    .eq('estado', 'asignada')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  trackings = (data ?? []).map((r) => r.tracking);
}

console.log('trackings', trackings.length, 'logo', logoPath ?? '(none)');
const outDir = '/tmp/andreani-clean';
mkdirSync(outDir, { recursive: true });

type OrdenRow = {
  id: string;
  sellos: Array<{
    diseno: string | null;
    archivo_base: string | null;
    archivo_vector_preview: string | null;
    item_type: string | null;
  }> | null;
};

async function loadOrder(tracking: string) {
  const { data, error } = await sb
    .from('envios_andreani_etiquetas')
    .select(
      `
      orden_id,
      ordenes (
        id,
        sellos ( diseno, archivo_base, archivo_vector_preview, item_type )
      )
    `,
    )
    .eq('tracking', tracking)
    .maybeSingle();
  if (error) throw error;
  if (!data?.orden_id) return undefined;
  const ordenRaw = (data as { ordenes?: unknown }).ordenes;
  const orden = (Array.isArray(ordenRaw) ? ordenRaw[0] : ordenRaw) as OrdenRow | null;
  if (!orden?.id) return undefined;
  const sellos = orden.sellos ?? [];
  const designNames = sellos.map((s) => s.diseno?.trim() || '').filter(Boolean);
  const imageUrls: string[][] = [];
  for (const s of sellos.slice(0, 3)) {
    const urls: string[] = [];
    for (const p of [s.archivo_vector_preview, s.archivo_base]) {
      if (!p) continue;
      if (/^https?:\/\//i.test(p)) {
        urls.push(p);
        continue;
      }
      const { data: signed } = await sb.storage.from('sellos').createSignedUrl(p, 300);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }
    if (urls.length) imageUrls.push(urls);
  }
  return { id: orden.id, designNames, caption: designNames.join(' · '), imageUrls };
}

const browser = await chromium.launch({ headless: true });
const fixed: { tracking: string; bytes: Uint8Array }[] = [];
let ok = 0;
let fail = 0;

try {
  for (const tracking of trackings) {
    process.stdout.write(`\n[${tracking}] `);
    try {
      const { data: file, error: dlErr } = await sb.storage
        .from('etiquetas-andreani')
        .download(`${tracking}.pdf`);
      if (dlErr || !file) throw new Error(dlErr?.message || 'download failed');
      const input = new Uint8Array(await file.arrayBuffer());
      const order = await loadOrder(tracking);
      const { bytes, metrics } = await rebuildCleanLabelPdf(input, tracking, order, {
        browser,
        logoPath,
      });
      if (!metrics.changed) {
        console.log('SKIP', metrics.reason);
        continue;
      }
      writeFileSync(`${outDir}/${tracking}.pdf`, Buffer.from(bytes));
      const { error: upErr } = await sb.storage
        .from('etiquetas-andreani')
        .upload(`${tracking}.pdf`, bytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;
      fixed.push({ tracking, bytes });
      console.log(
        `OK order=${order ? 'yes' : 'no'} andreaniBottom=${metrics.andreaniBottomPct}% gap=${metrics.gapPct}%`,
      );
      ok += 1;
    } catch (e) {
      console.log('FAIL', e instanceof Error ? e.message : e);
      fail += 1;
    }
  }
} finally {
  await browser.close();
}

// Merge de los trackings pedidos por argv (o los fijados)
const mergeList = trackingsArg.length ? trackingsArg : fixed.map((f) => f.tracking).slice(0, 5);
if (mergeList.length) {
  const merged = await PDFDocument.create();
  for (const t of mergeList) {
    const p = `${outDir}/${t}.pdf`;
    if (!existsSync(p)) continue;
    const d = await PDFDocument.load(readFileSync(p));
    const [page] = await merged.copyPages(d, [0]);
    merged.addPage(page);
  }
  const out = await merged.save();
  writeFileSync(`${outDir}/merged-clean.pdf`, out);
  console.log('\nmerged', `${outDir}/merged-clean.pdf`, out.length);
}

console.log(`\nDONE ok=${ok} fail=${fail}`);
if (fail) process.exit(2);
