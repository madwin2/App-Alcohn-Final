import { chromium } from 'playwright';
import fs from 'node:fs';

async function ink(pngPath: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = fs.readFileSync(pngPath).toString('base64');
  await page.setContent(`<img id="i" src="data:image/png;base64,${b64}"/>`);
  const r = await page.evaluate(async () => {
    const img = document.getElementById('i') as HTMLImageElement;
    await new Promise<void>((res) => {
      if (img.complete) res();
      else img.onload = () => res();
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let top = c.height;
    let bottom = 0;
    let left = c.width;
    let right = 0;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] < 8) continue;
        if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return {
      fillW: (((right - left + 1) / c.width) * 100).toFixed(1),
      fillH: (((bottom - top + 1) / c.height) * 100).toFixed(1),
      topPct: ((top / c.height) * 100).toFixed(1),
      bottomPct: (((c.height - 1 - bottom) / c.height) * 100).toFixed(1),
      leftPct: ((left / c.width) * 100).toFixed(1),
      rightPct: (((c.width - 1 - right) / c.width) * 100).toFixed(1),
    };
  });
  await browser.close();
  console.log(pngPath.split(/[/\\]/).pop(), r);
}

await ink('../../_enrich_verify/etiquetas_8_19_2026.enriched.png');
await ink('../../_enrich_verify/etiquetas_8_6_2026.enriched.png');
