import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
for (const f of ['p1', 'p3', 'p5']) {
  const buf = await readFile(path.resolve(`../../_enrich_verify/user_download/${f}.png`));
  const page = await browser.newPage();
  const b64 = buf.toString('base64');
  await page.setContent(`<!doctype html><img id="i" src="data:image/png;base64,${b64}">`);
  await page.waitForSelector('#i');
  const m = await page.evaluate(() => {
    const img = document.getElementById('i') as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (data[o] < 240 || data[o + 1] < 240 || data[o + 2] < 240) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      width,
      height,
      x0pct: +(100 * minX / width).toFixed(1),
      x1pct: +(100 * maxX / width).toFixed(1),
      y0pct: +(100 * minY / height).toFixed(1),
      y1pct: +(100 * maxY / height).toFixed(1),
      wPct: +(100 * (maxX - minX + 1) / width).toFixed(1),
      hPct: +(100 * (maxY - minY + 1) / height).toFixed(1),
    };
  });
  console.log(f, m);
  await page.close();
}
await browser.close();
