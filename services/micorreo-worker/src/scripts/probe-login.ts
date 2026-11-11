/**
 * Prueba login MiCorreo (proxy + storageState). Uso VPS:
 *   npx tsx src/scripts/probe-login.ts
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig, workerRoot } from '../config.js';
import { saveArtifacts } from '../micorreo/browser-helpers.js';
import { loginMicorreo } from '../micorreo/login-micorreo.js';

const config = loadConfig();
const mic = config.micorreo;

const proxy = mic.proxyServer
  ? {
      server: mic.proxyServer,
      ...(mic.proxyUsername ? { username: mic.proxyUsername } : {}),
      ...(mic.proxyPassword ? { password: mic.proxyPassword } : {}),
    }
  : undefined;

console.log(`[probe] headless=${mic.headless} proxy=${proxy?.server || '(ninguno)'}`);
console.log(`[probe] loginUrl=${mic.loginUrl}`);

const browser = await chromium.launch({
  headless: mic.headless,
  slowMo: mic.slowMoMs || undefined,
  proxy,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});

const opts: Parameters<typeof browser.newContext>[0] = {
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
  viewport: { width: 1400, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};
if (existsSync(config.storageStatePath)) {
  opts.storageState = config.storageStatePath;
  console.log(`[probe] storageState=${config.storageStatePath}`);
}

const context = await browser.newContext(opts);
await context.addInitScript(`
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
`);
const page = await context.newPage();
page.setDefaultTimeout(mic.timeoutMs);

try {
  await loginMicorreo(page, mic);
  await mkdir(path.dirname(config.storageStatePath), { recursive: true });
  await context.storageState({ path: config.storageStatePath });
  console.log(`[probe] LOGIN OK — storageState → ${config.storageStatePath}`);
  console.log(`[probe] URL=${page.url()}`);
} catch (error) {
  const dir = await saveArtifacts(page, config.artifactsDir, 'probe-login-fail');
  console.error('[probe] LOGIN FAIL:', error instanceof Error ? error.message : error);
  console.error('[probe] artifacts:', dir);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

void workerRoot;
