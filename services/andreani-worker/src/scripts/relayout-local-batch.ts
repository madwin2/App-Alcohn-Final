/**
 * Relayout local de PDFs de prueba.
 * Uso: npx tsx src/scripts/relayout-local-batch.ts ../../_enrich_verify/relayout_test
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { relayoutStoredLabelPdf } from '../pdf/relayout-stored.js';

const dir = path.resolve(process.argv[2] || '../../_enrich_verify/relayout_test');
const outDir = path.join(dir, 'fixed');
const shotDir = path.join(dir, 'shots');
await mkdir(outDir, { recursive: true });
await mkdir(shotDir, { recursive: true });

const files = (await readdir(dir)).filter((f) => f.endsWith('.pdf') && !f.includes('fixed'));
console.log('files', files);

const browser = await chromium.launch({ headless: true });
try {
  for (const file of files) {
    const tracking = file.replace(/\.pdf$/i, '');
    console.log('\n===', tracking, '===');
    const input = new Uint8Array(await readFile(path.join(dir, file)));
    const started = Date.now();
    const { bytes, metrics } = await relayoutStoredLabelPdf(input, { force: true, browser });
    console.log('metrics', metrics, `${Date.now() - started}ms`);
    await writeFile(path.join(outDir, `${tracking}.pdf`), bytes);
  }

  let failed = 0;
  for (const file of files) {
    const tracking = file.replace(/\.pdf$/i, '');
    const bytes = await readFile(path.join(outDir, `${tracking}.pdf`));
    const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
    const b64 = bytes.toString('base64');
    await page.setContent(
      `<!doctype html><canvas id="c"></canvas>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: u8 }).promise;
  const pg = await pdf.getPage(1);
  const vp = pg.getViewport({ scale: 2.2 });
  const canvas = document.getElementById('c');
  canvas.width = vp.width; canvas.height = vp.height;
  await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const thr = width * 0.01;
  let first = -1, last = -1, maxGap = 0, gapStart = -1, inGap = false, gapLen = 0;
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (data[o] < 245 || data[o+1] < 245 || data[o+2] < 245) ink++;
    }
    if (ink > thr) {
      if (first < 0) first = y;
      last = y;
      if (inGap) { if (gapLen > maxGap) { maxGap = gapLen; gapStart = y - gapLen; } inGap = false; gapLen = 0; }
    } else if (first >= 0) {
      if (!inGap) { inGap = true; gapLen = 1; } else gapLen++;
    }
  }
  window.__m = {
    firstInkPct: +(100 * first / height).toFixed(1),
    lastInkPct: +(100 * last / height).toFixed(1),
    maxWhiteGapPct: +(100 * maxGap / height).toFixed(1),
    maxWhiteGapStartPct: gapStart < 0 ? null : +(100 * gapStart / height).toFixed(1),
  };
  window.__done = true;
</script>`,
      { waitUntil: 'networkidle' },
    );
    await page.waitForFunction(() => (window as unknown as { __done?: boolean }).__done, null, {
      timeout: 60000,
    });
    const m = await page.evaluate(() => (window as unknown as { __m: Record<string, number> }).__m);
    await page.locator('#c').screenshot({ path: path.join(shotDir, `${tracking}.png`) });
    await page.close();
    const bad = m.firstInkPct > 6 || m.maxWhiteGapPct > 10;
    console.log(tracking, m, bad ? 'FAIL' : 'OK');
    if (bad) failed += 1;
  }
  if (failed) {
    console.error('FAILED', failed);
    process.exit(2);
  }
  console.log('ALL OK');
} finally {
  await browser.close();
}
