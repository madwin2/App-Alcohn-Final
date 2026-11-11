/**
 * Renderiza todas las páginas de un PDF mergeado.
 * Uso: npx tsx src/scripts/render-merged.ts "C:/Users/Julian/Downloads/foo.pdf"
 */
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const abs = path.resolve(process.argv[2]);
const outDir = path.resolve('../../_enrich_verify/user_download');
await mkdir(outDir, { recursive: true });

const bytes = await readFile(abs);
const doc = await PDFDocument.load(bytes);
console.log('file', abs, 'pages', doc.getPageCount(), 'bytes', bytes.length);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
const b64 = bytes.toString('base64');
await page.setContent(
  `<!doctype html><body style="margin:0;background:#333;padding:8px" id="root"></body>
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
    const vp = pg.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.id = 'c' + i;
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.display = 'block';
    canvas.style.marginBottom = '8px';
    root.appendChild(canvas);
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
    metrics.push({
      page: i,
      firstInkPct: +(100 * first / height).toFixed(1),
      lastInkPct: +(100 * last / height).toFixed(1),
      maxWhiteGapPct: +(100 * maxGap / height).toFixed(1),
      maxWhiteGapStartPct: gapStart < 0 ? null : +(100 * gapStart / height).toFixed(1),
    });
  }
  window.__metrics = metrics;
  window.__done = true;
</script>`,
  { waitUntil: 'networkidle' },
);
await page.waitForFunction('window.__done === true', null, { timeout: 120000 });
const metrics = await page.evaluate('window.__metrics');
console.log(JSON.stringify(metrics, null, 2));
for (let i = 1; i <= doc.getPageCount(); i++) {
  const out = path.join(outDir, `p${i}.png`);
  await page.locator(`#c${i}`).screenshot({ path: out });
  console.log('PNG', out);
}
await browser.close();
