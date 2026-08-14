import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import { looksLoggedIn, saveArtifacts } from '../browser-helpers.js';
import { ensureLoggedIn } from './login.js';

let browser: Browser | null = null;

function launchProxy(config: WorkerConfig): { server: string; username?: string; password?: string } | undefined {
  const server = config.andreani.proxyServer;
  if (!server) return undefined;
  const proxy: { server: string; username?: string; password?: string } = { server };
  if (config.andreani.proxyUsername) proxy.username = config.andreani.proxyUsername;
  if (config.andreani.proxyPassword) proxy.password = config.andreani.proxyPassword;
  return proxy;
}

export async function getBrowser(config: WorkerConfig): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  if (browser) {
    console.warn('[andreani] Browser desconectado — relanzando Chromium');
    await browser.close().catch(() => undefined);
    browser = null;
  }
  const proxy = launchProxy(config);
  if (proxy) {
    console.log(`[andreani] Playwright proxy: ${proxy.server}`);
  } else {
    console.warn(
      '[andreani] Sin ANDREANI_PROXY_SERVER — en Hetzner (EU) Andreani suele bloquear pymes-api (Sitio Bloqueado)',
    );
  }
  browser = await chromium.launch({
    headless: config.andreani.headless,
    slowMo: config.andreani.slowMoMs || undefined,
    proxy,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  browser.on('disconnected', () => {
    console.warn('[andreani] Chromium se desconectó');
    browser = null;
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = null;
  }
}

async function newContext(config: WorkerConfig): Promise<BrowserContext> {
  const opts: Parameters<Browser['newContext']>[0] = {
    locale: 'es-AR',
    viewport: { width: 1400, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
  if (existsSync(config.storageStatePath)) {
    opts.storageState = config.storageStatePath;
  }

  try {
    const b = await getBrowser(config);
    return await b.newContext(opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/has been closed|Target closed|Browser closed/i.test(message)) throw error;
    console.warn('[andreani] newContext falló con browser cerrado — retry con relanzamiento');
    await closeBrowser();
    const b = await getBrowser(config);
    return b.newContext(opts);
  }
}

export async function saveStorageState(
  context: BrowserContext,
  config: WorkerConfig,
): Promise<void> {
  await mkdir(path.dirname(config.storageStatePath), { recursive: true });
  await context.storageState({ path: config.storageStatePath });
}

/**
 * Abre una página ya autenticada (reusa storageState; re-login si expiró).
 * El caller debe cerrar `page` + `context`.
 */
export async function openAuthenticatedPage(config: WorkerConfig): Promise<{
  page: Page;
  context: BrowserContext;
}> {
  const context = await newContext(config);
  const page = await context.newPage();
  page.setDefaultTimeout(config.andreani.timeoutMs);

  try {
    await page.goto(config.andreani.homeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.andreani.timeoutMs,
    });
    await page.waitForLoadState('networkidle', { timeout: config.andreani.timeoutMs }).catch(() => undefined);
    // La SPA a veces pinta el shell vacío; esperar hero autenticado o login
    await Promise.race([
      page.getByText(/todo listo para empezar/i).first().waitFor({ state: 'visible', timeout: config.andreani.timeoutMs }),
      page.getByRole('button', { name: /^ingresar$/i }).first().waitFor({ state: 'visible', timeout: config.andreani.timeoutMs }),
      page.getByRole('link', { name: /^ingresar$/i }).first().waitFor({ state: 'visible', timeout: config.andreani.timeoutMs }),
    ]).catch(() => undefined);
    await page.waitForTimeout(1000);

    if (!(await looksLoggedIn(page))) {
      console.warn('[andreani] Sesión inválida o expirada — re-login');
      await ensureLoggedIn(page, config);
      await saveStorageState(context, config);
      console.log('[andreani] storageState guardado en', config.storageStatePath);
    }

    return { page, context };
  } catch (error) {
    await saveArtifacts(page, config.artifactsDir, 'session-open-error').catch(() => undefined);
    await context.close().catch(() => undefined);
    throw error;
  }
}
