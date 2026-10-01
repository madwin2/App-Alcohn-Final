/**
 * Login manual: abre el navegador, vos entrás (captcha/2FA si pide),
 * y guarda storageState para el worker.
 *
 * Uso:
 *   npm run login:manual
 *
 * Tiene que quedar en https://pymes.andreani.com/ con
 * “¡Todo listo para empezar!”.
 */
import { existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from '../config.js';
import { looksLoggedIn } from '../browser-helpers.js';

function isAuthFlow(url: string): boolean {
  return /b2clogin\.com|oauth2|authorize|transaccional-router-login/i.test(url);
}

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(path.dirname(config.storageStatePath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  const context = await browser.newContext({ locale: 'es-AR', viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const forceSavePath = path.join(path.dirname(config.storageStatePath), 'FORCE_SAVE');
  let forceSave = false;
  if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.on('data', () => {
      forceSave = true;
      console.log('[login:manual] Enter recibido — intentando guardar…');
    });
  }

  console.log('[login:manual] Abrí el navegador. Logueate hasta el home de Pymes.');
  console.log('[login:manual] Busco: pymes.andreani.com + “¡Todo listo para empezar!”');
  console.log('[login:manual] No cierres la ventana. Si hace falta: creá data/FORCE_SAVE.');
  await page.goto(config.andreani.homeUrl, { waitUntil: 'domcontentloaded' });

  const deadline = Date.now() + 12 * 60_000;
  let lastUrl = '';
  let pymesNudgeAt = 0;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error('Se cerró el navegador antes de guardar. Dejalo abierto hasta “Sesión guardada”.');
    }

    const url = page.url();
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[login:manual] url:', url);
    }

    if (existsSync(forceSavePath)) {
      forceSave = true;
      await unlink(forceSavePath).catch(() => undefined);
      console.log('[login:manual] FORCE_SAVE detectado');
    }

    // Solo después del login, si quedaste en /cuenta, pasar a Pymes (sin tocar B2C).
    if (
      !isAuthFlow(url) &&
      /andreani\.com\/cuenta/i.test(url) &&
      Date.now() - pymesNudgeAt > 8_000
    ) {
      pymesNudgeAt = Date.now();
      console.log('[login:manual] En /cuenta — abriendo Pymes…');
      await page.goto(config.andreani.homeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      continue;
    }

    if (await looksLoggedIn(page)) {
      await context.storageState({ path: config.storageStatePath });
      console.log('[login:manual] Sesión Pymes guardada en', config.storageStatePath);
      console.log('[login:manual] url final:', page.url());
      await browser.close();
      process.exit(0);
    }

    if (forceSave) {
      forceSave = false;
      if (!/pymes\.andreani\.com/i.test(page.url())) {
        console.warn('[login:manual] Todavía no estás en pymes.andreani.com — entrá al home Pymes.');
      } else {
        console.warn('[login:manual] Estás en Pymes pero no veo “Todo listo…”. Esperá a que cargue.');
      }
    }

    await page.waitForTimeout(1500);
  }

  console.error('[login:manual] Timeout sin home Pymes.');
  await browser.close();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
