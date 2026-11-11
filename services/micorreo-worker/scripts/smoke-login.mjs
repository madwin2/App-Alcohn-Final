/**
 * Smoke test: solo login (sin subir CSV). No imprime secretos.
 * Uso en VPS: xvfb-run -a node scripts/smoke-login.mjs
 */
import { chromium } from 'playwright';
import { loadConfig, assertRuntimeConfig } from '../dist/config.js';
import { loginMicorreo } from '../dist/micorreo/login-micorreo.js';

const config = loadConfig();
assertRuntimeConfig(config);

const browser = await chromium.launch({
  headless: config.micorreo.headless,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const context = await browser.newContext({
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
  viewport: { width: 1400, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
});
await context.addInitScript(`
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
`);
const page = await context.newPage();

try {
  console.log(`[smoke] headless=${config.micorreo.headless}`);
  await loginMicorreo(page, config.micorreo);
  const hasToken = await page.evaluate(() => Boolean(localStorage.getItem('auth_access_token')));
  console.log(JSON.stringify({ ok: true, hasToken, url: page.url() }));
  process.exit(hasToken ? 0 : 1);
} catch (err) {
  console.error('[smoke] FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}
