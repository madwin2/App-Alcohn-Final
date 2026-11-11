/**
 * Enriquece etiquetas con layout UNIFORME (vector, sin rasterizar):
 * - Andreani embebido como PDF (nítido)
 * - pie Pedido siempre anclado abajo
 * - gap fijo bajo el stub para que no tape el final de la etiqueta
 *
 * Uso:
 *   npx tsx src/scripts/enrich-uniform-batch.ts <dir-pdfs> <tracking...>
 * Los PDF en dir deben llamarse {tracking}.pdf
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { enrichZebraLabelPdf, type EnrichOrderInput } from '../pdf/enrich-zebra.js';
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

const srcDir = process.argv[2];
const trackings = process.argv.slice(3);
if (!srcDir || !trackings.length) {
  console.error('Usage: enrich-uniform-batch.ts <dir> <tracking...>');
  process.exit(1);
}

async function loadOrder(tracking: string): Promise<EnrichOrderInput | undefined> {
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
const merged = await PDFDocument.create();

for (const tracking of trackings) {
  const pdfPath = path.join(srcDir, `${tracking}.pdf`);
  if (!existsSync(pdfPath)) throw new Error(`missing ${pdfPath}`);
  process.stdout.write(`[${tracking}] `);
  const input = new Uint8Array(readFileSync(pdfPath));
  const order = await loadOrder(tracking);
  const bytes = await enrichZebraLabelPdf(input, tracking, order, logoPath, {
    // Fuentes ya son 100×152 con pie Alcohn viejo → recortar zócalo y redibujar.
    discardBottomFrac: 0.135,
  });
  writeFileSync(`${outDir}/${tracking}.pdf`, Buffer.from(bytes));
  const { error: upErr } = await sb.storage
    .from('etiquetas-andreani')
    .upload(`${tracking}.pdf`, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw upErr;
  const d = await PDFDocument.load(bytes);
  const [page] = await merged.copyPages(d, [0]);
  merged.addPage(page);
  console.log(`OK order=${order ? order.designNames[0] || 'yes' : 'no'} bytes=${bytes.length}`);
}

const out = await merged.save();
writeFileSync(`${outDir}/merged-clean.pdf`, out);
console.log('merged', out.length);
