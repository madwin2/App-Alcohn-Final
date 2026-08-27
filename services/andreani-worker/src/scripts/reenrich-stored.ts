/**
 * Re-enriquece PDFs ya en Storage/local con el layout actual de enrich-zebra
 * (pie fino abajo, sin tapar stub). Descarta pie Alcohn viejo si existe.
 *
 *   npx tsx src/scripts/reenrich-stored.ts [tracking...]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { enrichZebraLabelPdf } from '../pdf/enrich-zebra.js';
import { loadConfig } from '../config.js';
import { loadEnrichInputByTracking, updateEtiquetaPdfPath, uploadEtiquetaPdf } from '../supabase.js';

function loadEnv() {
  const raw = readFileSync('.env', 'utf8');
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
const trackings =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : (
        await sb
          .from('envios_andreani_etiquetas')
          .select('tracking')
          .not('pdf_path', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(80)
      ).data?.map((r: { tracking: string }) => r.tracking).filter(Boolean) ?? [];

if (!trackings.length) {
  console.error('Sin trackings (pasá argv o hay que tener pdf_path en DB)');
  process.exit(1);
}
console.log(`Reenrich ${trackings.length} etiquetas…`);

const outDir = '/tmp/andreani-refresh';
mkdirSync(outDir, { recursive: true });
const merged = await PDFDocument.create();

for (const tracking of trackings) {
  process.stdout.write(`[${tracking}] `);
  let input: Uint8Array | null = null;
  const local = `${outDir}/${tracking}.pdf`;
  // Preferir storage (fuente actual) — ya enriquecido → discard pie viejo
  const { data, error } = await sb.storage.from('etiquetas-andreani').download(`${tracking}.pdf`);
  if (!error && data) {
    input = new Uint8Array(await data.arrayBuffer());
  } else if (existsSync(local)) {
    input = new Uint8Array(readFileSync(local));
  }
  if (!input) {
    console.log('MISS');
    continue;
  }

  const order = await loadEnrichInputByTracking(tracking);
  const enrichInput = order
    ? {
        id: order.ordenId,
        designNames: order.designNames,
        caption: order.caption,
        imageUrls: order.imageUrls,
      }
    : undefined;

  // Auto-detecta pie Pedido viejo/duplicado y lo recorta; redibuja un solo pie fino.
  const enriched = await enrichZebraLabelPdf(input, tracking, enrichInput, config.logoPath);
  writeFileSync(local, Buffer.from(enriched));
  const pdfPath = await uploadEtiquetaPdf(tracking, enriched);
  await updateEtiquetaPdfPath(tracking, pdfPath);
  const d = await PDFDocument.load(enriched);
  const [p] = await merged.copyPages(d, [0]);
  merged.addPage(p);
  console.log(`OK bytes=${enriched.length}`);
}

const out = await merged.save();
writeFileSync(`${outDir}/merged-clean.pdf`, out);
console.log('merged', out.length);
