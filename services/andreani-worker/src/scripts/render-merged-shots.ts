/**
 * Renderiza páginas de un PDF mergeado a PNG para verificación visual.
 * Uso: npx tsx src/scripts/render-merged-shots.ts /tmp/andreani-clean/merged-clean.pdf /tmp/andreani-clean/shots
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const pdfPath = process.argv[2] || '/tmp/andreani-clean/merged-clean.pdf';
const outDir = process.argv[3] || '/tmp/andreani-clean/shots';
mkdirSync(outDir, { recursive: true });

const b64 = readFileSync(pdfPath).toString('base64');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
await page.setContent(
  `<!doctype html><div id="root"></div>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: u8 }).promise;
  window.__n = pdf.numPages;
  const root = document.getElementById('root');
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const vp = pg.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas');
    canvas.id = 'p' + i;
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.display = 'block';
    canvas.style.marginBottom = '20px';
    root.appendChild(canvas);
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }
  window.__done = true;
</script>`,
  { waitUntil: 'networkidle' },
);
await page.waitForFunction('window.__done === true', null, { timeout: 120000 });
const n = (await page.evaluate('window.__n')) as number;
for (let i = 1; i <= n; i++) {
  const el = await page.$(`#p${i}`);
  if (!el) continue;
  await el.screenshot({ path: `${outDir}/p${i}.png` });
  console.log('shot', `p${i}.png`);
}
await browser.close();
console.log('done', n, outDir);
