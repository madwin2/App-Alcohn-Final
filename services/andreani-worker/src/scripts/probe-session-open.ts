import { loadConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';

const config = loadConfig();
config.andreani.headless = true;
try {
  const { page, context } = await openAuthenticatedPage(config);
  console.log('OK url=', page.url());
  await page.close();
  await context.close();
} finally {
  await closeBrowser();
}
