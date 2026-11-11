/**
 * Renderiza PDFs ya enriquecidos (sin volver a enrich) y mide gaps.
 * Uso: npx tsx src/scripts/render-pdf-pages.ts ../../_enrich_verify/live/*.pdf
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Pasá uno o más PDFs');
  process.exit(1);
}

const outDir = path.resolve('../../_enrich_verify/live_shots');
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

let failed = 0;
for (const input of inputs) {
  const abs = path.resolve(input);
  const base = path.basename(abs, path.extname(abs));
  const bytes = await readFile(abs);
  const doc = await PDFDocument.load(bytes);
  console.log('\n' + base, 'pages', doc.getPageCount());
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    console.log(
      '  page',
      i,
      p.getWidth().toFixed(1) + 'x' + p.getHeight().toFixed(1),
      'mm',
      ((p.getWidth() * 25.4) / 72).toFixed(1) + 'x' + ((p.getHeight() * 25.4) / 72).toFixed(1),
    );
  }

  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  const b64 = bytes.toString('base64');
  await page.setContent(
    `<!doctype html><body style="margin:0;background:#333;padding:8px">
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
    const vp = pg.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas');
    canvas.id = 'c' + i;
    canvas.width = vp.width;
    canvas.height = vp.height;
    root.appendChild(canvas);
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const ctx = canvas.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
    let first = -1, last = -1, maxGap = 0, gapStart = -1, inGap = false, gapLen = 0;
    for (let y = 0; y < height; y++) {
      if (rowInk[y] > threshold) {
        if (first < 0) first = y;
        last = y;
        if (inGap) {
          if (gapLen > maxGap) { maxGap = gapLen; gapStart = y - gapLen; }
          inGap = false; gapLen = 0;
        }
      } else if (first >= 0) {
        if (!inGap) { inGap = true; gapLen = 1; } else gapLen++;
      }
    }
    metrics.push({
      page: i,
      firstInkPct: first < 0 ? null : +(100 * first / height).toFixed(1),
      lastInkPct: last < 0 ? null : +(100 * last / height).toFixed(1),
      maxWhiteGapPct: +(100 * maxGap / height).toFixed(1),
      maxWhiteGapStartPct: gapStart < 0 ? null : +(100 * gapStart / height).toFixed(1),
    });
  }
  window.__metrics = metrics;
  window.__done = true;
</script></body>`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done === true, null, {
    timeout: 60000,
  });
  const metrics = (await page.evaluate(
    () => (window as unknown as { __metrics: Array<Record<string, number>> }).__metrics,
  )) as Array<{
    page: number;
    firstInkPct: number;
    lastInkPct: number;
    maxWhiteGapPct: number;
  }>;
  console.log('  metrics', JSON.stringify(metrics));
  for (const m of metrics) {
    const outPng = path.join(outDir, `${base}.p${m.page}.png`);
    await page.locator(`#c${m.page}`).screenshot({ path: outPng });
    console.log('  PNG', outPng);
    // first ink should be near top; no huge mid gap (>12%)
    if (m.firstInkPct > 8 || m.maxWhiteGapPct > 12) {
      console.error('  FAIL', m);
      failed += 1;
    } else {
      console.log('  OK');
    }
  }
  await page.close();
}

await browser.close();
if (failed) process.exit(2);
console.log('\nALL OK');
