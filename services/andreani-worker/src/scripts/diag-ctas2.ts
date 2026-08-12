import { loadConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';

async function main() {
  const config = loadConfig();
  const { page, context } = await openAuthenticatedPage(config);

  const info = await page.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    const nodes = Array.from(document.querySelectorAll('a, button'));
    for (const el of nodes) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text !== 'Hacer un envío') continue;
      const r = el.getBoundingClientRect();
      out.push({
        tag: el.tagName,
        href: (el as HTMLAnchorElement).href || el.getAttribute('href') || null,
        className: el.className?.toString?.().slice(0, 120) || '',
        id: el.id || null,
        type: el.getAttribute('type'),
        y: Math.round(r.y),
        x: Math.round(r.x),
        w: Math.round(r.width),
        h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0,
        parentText: (el.parentElement?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100),
      });
    }
    return out;
  });

  console.log(JSON.stringify(info, null, 2));

  // Probar click del botón principal (no el <a> externo)
  const hero = page
    .getByRole('button', { name: /^Hacer un envío$/i })
    .first();
  console.log('hero button visible?', await hero.isVisible().catch(() => false));

  await context.close();
  await closeBrowser();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
