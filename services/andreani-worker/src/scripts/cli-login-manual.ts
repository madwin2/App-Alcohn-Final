/**
 * Login manual: abre el navegador, vos entrás (captcha/2FA si pide),
 * y guarda storageState para que generate:test reutilice la sesión.
 *
 * Uso:
 *   npm run login:manual
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from '../config.js';
import { looksLoggedIn } from '../browser-helpers.js';

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(path.dirname(config.storageStatePath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  const context = await browser.newContext({ locale: 'es-AR', viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('[login:manual] Abrí el navegador. Logueate en Andreani Pymes.');
  console.log('[login:manual] Cuando estés en el home, este script guarda la sesión solo.');
  await page.goto(config.andreani.homeUrl, { waitUntil: 'domcontentloaded' });

  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    if (await looksLoggedIn(page)) {
      await context.storageState({ path: config.storageStatePath });
      console.log('[login:manual] Sesión guardada en', config.storageStatePath);
      await browser.close();
      process.exit(0);
    }
    await page.waitForTimeout(1500);
  }

  console.error('[login:manual] Timeout 5 min sin detectar login.');
  await browser.close();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
