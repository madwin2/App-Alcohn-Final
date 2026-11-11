/**
 * Rebuild desde páginas locales correctas (user_fixed page-N.pdf).
 * Args: dir con page-1.pdf..page-5.pdf y lista de trackings en orden.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { rebuildCleanLabelPdf } from '../pdf/rebuild-clean.js';
import { loadConfig } from '../config.js';

function loadEnv() {
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
const logoPath = existsSync(config.logoPath)
  ? config.logoPath
  : '/opt/andreani-worker/public/logo-alcohn.jpg';

const srcDir = process.argv[2] || '/tmp/andreani-user-pages';
const trackings = process.argv.slice(3);
if (trackings.length < 1) {
  console.error('Usage: rebuild-from-pages.ts <dir> <tracking...>');
  process.exit(1);
}

async function loadOrder(tracking: string) {
  const { data, error } = await sb
    .from('envios_andreani_etiquetas')
    .select(
      `orden_id, ordenes ( id, sellos ( diseno, archivo_base, archivo_vector_preview, item_type ) )`,
    )
    .eq('tracking', tracking)
    .maybeSingle();
  if (error) throw error;
  if (!data?.orden_id) return undefined;
  const ordenRaw = (data as { ordenes?: unknown }).ordenes;
  const orden = (Array.isArray(ordenRaw) ? ordenRaw[0] : ordenRaw) as {
    id: string;
    sellos: Array<{
      diseno: string | null;
      archivo_base: string | null;
      archivo_vector_preview: string | null;
    }> | null;
  } | null;
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

const outDir = '/tmp/andreani-clean';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const merged = await PDFDocument.create();

try {
  for (let i = 0; i < trackings.length; i++) {
    const tracking = trackings[i];
    const pagePath = path.join(srcDir, `page-${i + 1}.pdf`);
    if (!existsSync(pagePath)) throw new Error(`missing ${pagePath}`);
    process.stdout.write(`[${tracking}] from ${pagePath} `);
    const input = new Uint8Array(readFileSync(pagePath));
    const order = await loadOrder(tracking);
    const { bytes, metrics } = await rebuildCleanLabelPdf(input, tracking, order, {
      browser,
      logoPath: existsSync(logoPath) ? logoPath : undefined,
    });
    writeFileSync(`${outDir}/${tracking}.pdf`, Buffer.from(bytes));
    const { error: upErr } = await sb.storage
      .from('etiquetas-andreani')
      .upload(`${tracking}.pdf`, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;
    const d = await PDFDocument.load(bytes);
    const [page] = await merged.copyPages(d, [0]);
    merged.addPage(page);
    console.log(
      `OK order=${order ? order.designNames.join('|') || order.id.slice(0, 8) : 'no'} bottom=${metrics.andreaniBottomPct}%`,
    );
  }
} finally {
  await browser.close();
}

const out = await merged.save();
writeFileSync(`${outDir}/merged-clean.pdf`, out);
console.log('merged', out.length);
