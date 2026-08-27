/**
 * Enriquece + renderiza a PNG para verificación visual.
 * Uso: npx tsx src/scripts/verify-enrich-layout.ts ../../etiquetas_8_6_2026.pdf
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { enrichZebraLabelPdf, splitPdfPages } from '../pdf/enrich-zebra.js';

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
const pages = await splitPdfPages(new Uint8Array(srcBytes));
console.log('source pages', pages.length);

const enrichedPages: Uint8Array[] = [];
for (let i = 0; i < pages.length; i += 1) {
  const srcDoc = await PDFDocument.load(pages[i]);
  const sp = srcDoc.getPage(0);
  console.log(
    `page ${i} source pt`,
    sp.getWidth().toFixed(1),
    'x',
    sp.getHeight().toFixed(1),
  );
  enrichedPages.push(
    await enrichZebraLabelPdf(pages[i], `TRACK${i}`, {
      id: `5805960b-1359-42aa-bbbb-ccccccccccc${i}`,
      designNames: i % 2 === 0 ? ['Todo fibrofacil R'] : ['Almacen PAMPA', 'Almacen PAMPA'],
      caption: i % 2 === 0 ? 'Todo fibrofacil R' : 'Almacen PAMPA',
      imageUrls: [],
    }),
  );
}

const merged = await PDFDocument.create();
for (const bytes of enrichedPages) {
  const d = await PDFDocument.load(bytes);
  const [p] = await merged.copyPages(d, [0]);
  merged.addPage(p);
}
const enriched = await merged.save();
const outPdf = path.join(outDir, `${base}.enriched.pdf`);
await writeFile(outPdf, enriched);
console.log('PDF', outPdf);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
const b64 = Buffer.from(enriched).toString('base64');

await page.setContent(
  `<!doctype html>
<html><body style="margin:0;background:#333;display:flex;flex-direction:column;gap:12px;padding:12px">
<div id="root"></div>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: u8 }).promise;
  const root = document.getElementById('root');
  const metrics = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const scale = 2.2;
    const vp = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.id = 'c' + i;
    canvas.width = vp.width;
    canvas.height = vp.height;
    root.appendChild(canvas);
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const ctx = canvas.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Buscar tinta (no blanco) por filas para medir huecos
    const rowInk = [];
    for (let y = 0; y < height; y++) {
      let ink = 0;
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (data[o] < 245 || data[o + 1] < 245 || data[o + 2] < 245) ink++;
      }
      rowInk.push(ink);
    }
    const threshold = width * 0.01;
    let first = -1;
    let last = -1;
    for (let y = 0; y < height; y++) {
      if (rowInk[y] > threshold) {
        if (first < 0) first = y;
        last = y;
      }
    }
    // Hueco grande en el medio: filas blancas entre bloques de tinta
    let maxGap = 0;
    let gapStart = -1;
    let inGap = false;
    let gapLen = 0;
    for (let y = first; y <= last; y++) {
      if (rowInk[y] <= threshold) {
        if (!inGap) {
          inGap = true;
          gapLen = 1;
        } else gapLen++;
      } else if (inGap) {
        if (gapLen > maxGap) {
          maxGap = gapLen;
          gapStart = y - gapLen;
        }
        inGap = false;
        gapLen = 0;
      }
    }
    metrics.push({
      page: i,
      firstInkPct: first < 0 ? null : +(100 * first / height).toFixed(1),
      lastInkPct: last < 0 ? null : +(100 * last / height).toFixed(1),
      maxWhiteGapPct: +(100 * maxGap / height).toFixed(1),
      maxWhiteGapStartPct: gapStart < 0 ? null : +(100 * gapStart / height).toFixed(1),
      w: width,
      h: height,
    });
  }
  window.__metrics = metrics;
  window.__done = true;
</script>
</body></html>`,
  { waitUntil: 'networkidle' },
);

await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, {
  timeout: 60000,
});
const metrics = await page.evaluate(
  () => (window as unknown as { __metrics: unknown }).__metrics,
);
console.log('metrics', JSON.stringify(metrics, null, 2));

for (let i = 1; i <= enrichedPages.length; i += 1) {
  const outPng = path.join(outDir, `${base}.p${i}.png`);
  await page.locator(`#c${i}`).screenshot({ path: outPng });
  console.log('PNG', outPng);
}
await browser.close();

const bad = (metrics as Array<{ firstInkPct: number; maxWhiteGapPct: number }>).filter(
  (m) => m.firstInkPct > 8 || m.maxWhiteGapPct > 8,
);
if (bad.length) {
  console.error('FAIL layout gaps', bad);
  process.exit(2);
}
console.log('OK layout checks passed');
