/**
 * Renderiza la 1ª página de un PDF a PNG con Chromium (para verificar layout).
 * Uso: npx tsx src/scripts/pdf-page-to-png.ts entrada.pdf salida.png
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('Uso: tsx pdf-page-to-png.ts entrada.pdf salida.png');
  process.exit(1);
}
const absIn = path.resolve(input);
const absOut = path.resolve(output);
if (!existsSync(absIn)) {
  console.error('No existe', absIn);
  process.exit(1);
}

// 100×152 mm @ ~2.5x → ~945×1437 CSS px
const W = 945;
const H = 1437;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:0;background:#ddd;width:${W}px;height:${H}px;overflow:hidden}
  embed,iframe,object{border:0;width:100%;height:100%}
</style></head>
<body>
  <embed src="${pathToFileURL(absIn).href}" type="application/pdf" width="${W}" height="${H}"/>
</body></html>`;

await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: absOut, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log('OK', absOut);
