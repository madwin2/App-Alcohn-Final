/**
 * Toma el PDF mergeado que bajó el usuario, reescribe CADA página y:
 * 1) genera un PDF listo en Downloads
 * 2) sube cada página a Storage (si se puede leer el tracking del nombre previo)
 *
 * Uso:
 *   npx tsx src/scripts/fix-user-merged.ts "C:/Users/Julian/Downloads/etiquetas-andreani-2026-08-26 (7).pdf"
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { relayoutStoredLabelPdf, LABEL_W_PT, LABEL_H_PT } from '../pdf/relayout-stored.js';

const inputPath = path.resolve(process.argv[2]);
if (!inputPath) {
  console.error('Pasá el PDF mergeado');
  process.exit(1);
}

const outDir = path.resolve('../../_enrich_verify/user_fixed');
await mkdir(outDir, { recursive: true });

const srcBytes = await readFile(inputPath);
const src = await PDFDocument.load(srcBytes);
const n = src.getPageCount();
console.log('pages', n);

const browser = await chromium.launch({ headless: true });
const fixedPages: Uint8Array[] = [];
const metricsAll = [];

try {
  for (let i = 0; i < n; i++) {
    const one = await PDFDocument.create();
    const [p] = await one.copyPages(src, [i]);
    one.addPage(p);
    const pageBytes = await one.save();
    console.log(`\n=== page ${i + 1} ===`);
    const { bytes, metrics } = await relayoutStoredLabelPdf(pageBytes, {
      force: true,
      browser,
    });
    console.log(metrics);
    metricsAll.push(metrics);
    await writeFile(path.join(outDir, `page-${i + 1}.pdf`), bytes);
    fixedPages.push(bytes);
  }
} finally {
  await browser.close();
}

const merged = await PDFDocument.create();
for (const b of fixedPages) {
  const d = await PDFDocument.load(b);
  const [p] = await merged.copyPages(d, [0]);
  // Asegurar tamaño
  if (Math.abs(p.getWidth() - LABEL_W_PT) > 0.5 || Math.abs(p.getHeight() - LABEL_H_PT) > 0.5) {
    p.setSize(LABEL_W_PT, LABEL_H_PT);
  }
  merged.addPage(p);
}
const outMerged = await merged.save();
const downloadsOut = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  `etiquetas-andreani-FIXED-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`,
);
await writeFile(downloadsOut, outMerged);
await writeFile(path.join(outDir, 'merged-fixed.pdf'), outMerged);
console.log('\nOK →', downloadsOut);

// Render verify
const browser2 = await chromium.launch({ headless: true });
const page = await browser2.newPage({ viewport: { width: 700, height: 1100 } });
const b64 = Buffer.from(outMerged).toString('base64');
await page.setContent(
  `<!doctype html><body style="margin:0;background:#222;padding:8px" id="root"></body>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) u8[i]=raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({data:u8}).promise;
  const root = document.getElementById('root');
  const metrics = [];
  for (let i=1;i<=pdf.numPages;i++) {
    const pg = await pdf.getPage(i);
    const vp = pg.getViewport({scale:2});
    const canvas = document.createElement('canvas');
    canvas.id = 'c'+i;
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.display='block'; canvas.style.marginBottom='8px';
    root.appendChild(canvas);
    await pg.render({canvasContext:canvas.getContext('2d'), viewport:vp}).promise;
    const ctx = canvas.getContext('2d');
    const {data,width,height} = ctx.getImageData(0,0,canvas.width,canvas.height);
    let minX=width,maxX=0,minY=height,maxY=0;
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const o=(y*width+x)*4;
      if (data[o]<240||data[o+1]<240||data[o+2]<240) {
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
      }
    }
    metrics.push({
      page:i,
      wPct:+(100*(maxX-minX+1)/width).toFixed(1),
      hPct:+(100*(maxY-minY+1)/height).toFixed(1),
      y0:+(100*minY/height).toFixed(1),
      y1:+(100*maxY/height).toFixed(1),
    });
  }
  window.__m = metrics; window.__done = true;
</script>`,
  { waitUntil: 'networkidle' },
);
await page.waitForFunction('window.__done===true', null, { timeout: 120000 });
const verify = await page.evaluate('window.__m');
console.log('verify', JSON.stringify(verify, null, 2));
let failed = 0;
for (let i = 1; i <= n; i++) {
  await page.locator(`#c${i}`).screenshot({ path: path.join(outDir, `p${i}.png`) });
  const m = (verify as Array<{ wPct: number; hPct: number; y0: number }>)[i - 1];
  const bad = m.wPct < 90 || m.y0 > 8;
  console.log(`page ${i}`, m, bad ? 'FAIL' : 'OK');
  if (bad) failed += 1;
}
await browser2.close();
if (failed) {
  console.error('FAILED pages', failed);
  process.exit(2);
}
console.log('ALL PAGES OK');
