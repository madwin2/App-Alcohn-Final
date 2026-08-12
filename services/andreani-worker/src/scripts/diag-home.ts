import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import {
  closeBrowser,
  openAuthenticatedPage,
  saveStorageState,
} from '../andreani/session.js';

async function main() {
  const config = loadConfig();
  await mkdir(config.artifactsDir, { recursive: true });
  const { page, context } = await openAuthenticatedPage(config);
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());
  const body = (await page.locator('body').innerText().catch(() => ''))
    .slice(0, 1200)
    .replace(/\s+/g, ' ');
  console.log('BODY:', body);
  await page.screenshot({
    path: path.join(config.artifactsDir, 'diag-home.png'),
    fullPage: true,
  });
  await saveStorageState(context, config);
  await context.close();
  await closeBrowser();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
