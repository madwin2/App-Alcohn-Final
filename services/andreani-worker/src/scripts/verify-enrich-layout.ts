/**
 * Enriquece + renderiza a PNG para verificación visual.
 * Uso: npx tsx src/scripts/verify-enrich-layout.ts ../../etiquetas_8_6_2026.pdf
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { enrichZebraLabelPdf } from '../pdf/enrich-zebra.js';

const input = process.argv[2];
if (!input) {
  console.error('Pasá un PDF');
  process.exit(1);
}

const abs = path.resolve(input);
const outDir = path.resolve('../../_enrich_verify');
await mkdir(outDir, { recursive: true });
const base = path.basename(abs, path.extname(abs));

const srcBytes = await readFile(abs);
const srcDoc = await PDFDocument.load(srcBytes);
const srcPage = srcDoc.getPage(0);
const sw = srcPage.getWidth();
const sh = srcPage.getHeight();
console.log('source pt', sw.toFixed(1), 'x', sh.toFixed(1), 'mm', ((sw * 25.4) / 72).toFixed(1), 'x', ((sh * 25.4) / 72).toFixed(1));

const enriched = await enrichZebraLabelPdf(new Uint8Array(srcBytes), '360003074993550', {
  id: '5805960b-1359-42aa-bbbb-cccccccccccc',
  designNames: ['Todo fibrofacil R'],
  caption: 'Todo fibrofacil R',
  imageUrls: [],
});

const outPdf = path.join(outDir, `${base}.enriched.pdf`);
await writeFile(outPdf, enriched);

const outDoc = await PDFDocument.load(enriched);
const op = outDoc.getPage(0);
console.log('out pt', op.getWidth().toFixed(1), 'x', op.getHeight().toFixed(1), 'mm', ((op.getWidth() * 25.4) / 72).toFixed(1), 'x', ((op.getHeight() * 25.4) / 72).toFixed(1));

// Render con pdf.js en Chromium → canvas → PNG
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 1600 } });
const b64 = Buffer.from(enriched).toString('base64');

await page.setContent(`<!doctype html>
<html><body style="margin:0;background:#333">
<canvas id="c"></canvas>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: u8 }).promise;
  const pg = await pdf.getPage(1);
  const scale = 2.5;
  const vp = pg.getViewport({ scale });
  const canvas = document.getElementById('c');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  window.__done = true;
  window.__w = canvas.width;
  window.__h = canvas.height;
</script>
</body></html>`, { waitUntil: 'networkidle' });

await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, {
  timeout: 30000,
});
const dims = await page.evaluate(() => ({
  w: (window as unknown as { __w: number }).__w,
  h: (window as unknown as { __h: number }).__h,
}));
const outPng = path.join(outDir, `${base}.enriched.png`);
await page.locator('#c').screenshot({ path: outPng });
await browser.close();
console.log('PNG', outPng, dims);
