import { loadConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';

async function main() {
  const config = loadConfig();
  const { page, context } = await openAuthenticatedPage(config);

  const links = await page.evaluate(() => {
    const out: Array<{ text: string; href: string; tag: string }> = [];
    const nodes = Array.from(
      document.querySelectorAll('a, button, [role="button"]'),
    );
    for (const el of nodes) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/hacer un env[ií]o/i.test(text) && !/env[ií]o/i.test(text)) continue;
      const href =
        (el as HTMLAnchorElement).href ||
        el.getAttribute('href') ||
        el.getAttribute('data-href') ||
        '';
      out.push({
        text: text.slice(0, 80),
        href,
        tag: el.tagName.toLowerCase(),
      });
    }
    return out;
  });

  console.log(JSON.stringify(links, null, 2));
  console.log('URL ahora:', page.url());

  await context.close();
  await closeBrowser();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
