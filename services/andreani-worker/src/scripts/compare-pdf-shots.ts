import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const files = [
  ['orig_071823090', '../../_enrich_verify/relayout_test/360003071823090.pdf'],
  ['final_071823090', '../../_enrich_verify/final_check/360003071823090.pdf'],
  ['orig_075514080', '../../_enrich_verify/relayout_test/360003075514080.pdf'],
  ['final_075514080', '../../_enrich_verify/final_check/360003075514080.pdf'],
  ['fixed_071823090', '../../_enrich_verify/relayout_test/fixed/360003071823090.pdf'],
  ['fixed_075514080', '../../_enrich_verify/relayout_test/fixed/360003075514080.pdf'],
];

const out = path.resolve('../../_enrich_verify/orig_shots');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const [name, f] of files) {
  const abs = path.resolve(f);
  const bytes = await readFile(abs);
  console.log(name, abs, bytes.length);
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
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
  const vp = pg.getViewport({ scale: 2 });
  const c = document.getElementById('c');
  c.width = vp.width; c.height = vp.height;
  await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  window.__done = true;
</script>`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
  await page.locator('#c').screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
}
await browser.close();
console.log('done');
