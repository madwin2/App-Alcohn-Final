import { loadConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';

async function main() {
  const config = loadConfig();
  const { page, context } = await openAuthenticatedPage(config);

  console.log('[home]', page.url());
  const hero = page.getByRole('button', { name: /^hacer un env[ií]o$/i }).first();
  await hero.click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  console.log('[after click]', page.url());
  const body = (await page.locator('body').innerText())
    .slice(0, 500)
    .replace(/\s+/g, ' ');
  console.log('[body]', body);

  await context.close();
  await closeBrowser();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
