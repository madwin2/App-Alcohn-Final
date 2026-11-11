/**
 * Reescribe TODAS las etiquetas asignadas en Storage con layout etiqueta↑ + pie pegado.
 * Uso (VPS): npx tsx src/scripts/fix-all-stored-layouts.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { relayoutStoredLabelPdf } from '../pdf/relayout-stored.js';

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

const outDir = '/tmp/andreani-relayout';
mkdirSync(outDir, { recursive: true });

const { data: rows, error } = await sb
  .from('envios_andreani_etiquetas')
  .select('tracking, pdf_path, destinatario, estado')
  .eq('estado', 'asignada')
  .order('creado_en', { ascending: false });
if (error) throw error;

console.log('asignadas', rows?.length ?? 0);
let ok = 0;
let fail = 0;
let skipped = 0;

const browser = await chromium.launch({ headless: true });
try {
  for (const row of rows ?? []) {
    const pdfPath = row.pdf_path || `${row.tracking}.pdf`;
    process.stdout.write(`\n[${row.tracking}] ${row.destinatario} … `);
    try {
      const { data: file, error: dlErr } = await sb.storage.from('etiquetas-andreani').download(pdfPath);
      if (dlErr || !file) throw new Error(dlErr?.message || 'download failed');
      const input = new Uint8Array(await file.arrayBuffer());
      const { bytes, metrics } = await relayoutStoredLabelPdf(input, {
        force: false,
        browser,
      });
      if (!metrics.changed) {
        console.log(`SKIP reason=${metrics.reason} first=${metrics.firstInkPct}% gap=${metrics.gapPct}%`);
        skipped += 1;
        continue;
      }
      writeFileSync(`${outDir}/${row.tracking}.after.pdf`, Buffer.from(bytes));
      const { error: upErr } = await sb.storage.from('etiquetas-andreani').upload(pdfPath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upErr) throw upErr;
      console.log(
        `OK reason=${metrics.reason} first=${metrics.firstInkPct}% gap=${metrics.gapPct}% footer@${metrics.footerTopPct}%`,
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

console.log(`\nDONE ok=${ok} skipped=${skipped} fail=${fail}`);
if (fail) process.exit(2);
