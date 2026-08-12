import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, assertRuntimeConfig } from '../config.js';
import {
  closeBrowser,
  openAuthenticatedPage,
  saveStorageState,
} from '../andreani/session.js';
import { createOnePaymentLink } from '../andreani/create-link.js';

async function main() {
  const config = loadConfig();
  assertRuntimeConfig(config, { requireSupabase: false });
  await mkdir(config.artifactsDir, { recursive: true });

  const { page, context } = await openAuthenticatedPage(config);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log('[nav]', frame.url());
    }
  });

  console.log('[start]', page.url());
  try {
    const url = await createOnePaymentLink(page, config);
    console.log('[OK] link:', url);
    await page.screenshot({
      path: path.join(config.artifactsDir, 'link-ok.png'),
      fullPage: true,
    });
  } catch (err) {
    console.error('[FAIL]', err instanceof Error ? err.message : err);
    console.error('[url al fallar]', page.url());
    const body = (await page.locator('body').innerText().catch(() => ''))
      .slice(0, 600)
      .replace(/\s+/g, ' ');
    console.error('[body]', body);
    throw err;
  } finally {
    await saveStorageState(context, config).catch(() => undefined);
    await context.close().catch(() => undefined);
    await closeBrowser().catch(() => undefined);
  }
}

main().catch(() => process.exit(1));
