import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import path from 'node:path';

const files = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

for (const file of files) {
  const abs = path.resolve(file);
  const b64 = (await readFile(abs)).toString('base64');
  const ext = abs.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  await page.setContent(`<!doctype html><canvas id="c"></canvas>
<script>
const img = new Image();
img.onload = () => {
  const c = document.getElementById('c');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img,0,0);
  const {data,width:w,height:h} = ctx.getImageData(0,0,c.width,c.height);
  const thr = w * 0.008;
  const segs = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    let ink = 0;
    if (y < h) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (data[o] < 240 || data[o+1] < 240 || data[o+2] < 240) ink++;
      }
    }
    const has = y < h && ink > thr;
    if (has && start < 0) start = y;
    if ((!has || y === h) && start >= 0) { segs.push([start, y - 1]); start = -1; }
  }
  window.__out = { w, h, segs, gaps: segs.slice(0,-1).map((s,i)=>({after:i, rows: segs[i+1][0]-s[1]-1, pct: +((100*(segs[i+1][0]-s[1]-1)/h).toFixed(1))})) };
};
img.src = 'data:image/${ext};base64,${b64}';
</script>`);
  await page.waitForFunction(() => (window as unknown as { __out?: unknown }).__out);
  const out = await page.evaluate(() => (window as unknown as { __out: unknown }).__out) as {
    w: number; h: number; segs: number[][]; gaps: { after: number; rows: number; pct: number }[];
  };
  console.log('\n' + abs);
  console.log('size', out.w, out.h);
  for (const [a, b] of out.segs) {
    console.log(
      '  ink',
      a,
      '-',
      b,
      `(${((100 * a) / out.h).toFixed(1)}%-${((100 * b) / out.h).toFixed(1)}%)`,
      'rows',
      b - a + 1,
    );
  }
  for (const g of out.gaps) {
    console.log('  GAP after seg', g.after, g.rows, 'rows', `${g.pct}%`);
  }
}
await browser.close();
