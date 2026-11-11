import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('artifacts', 'probe-new-login');
await mkdir(outDir, { recursive: true });

const urls = [
  'https://www.correoargentino.com.ar/MiCorreo/public/',
  'https://micorreo.correoargentino.com.ar/landing',
  'https://micorreo.correoargentino.com.ar/login',
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'es-AR',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

const report = [];

for (const url of urls) {
  console.log('→', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
      const forms = [...document.querySelectorAll('form')].map((f) => ({
        id: f.id,
        name: f.getAttribute('name'),
        action: f.getAttribute('action'),
        className: f.className,
      }));
      const inputs = [...document.querySelectorAll('input')].map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        placeholder: i.placeholder,
        ariaLabel: i.getAttribute('aria-label'),
        className: i.className,
      }));
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')]
        .map((el) => ({
          tag: el.tagName,
          id: el.id,
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: el.getAttribute?.('href') || '',
          type: el.getAttribute?.('type') || '',
        }))
        .filter((b) => /ingresar|login|sesión|contrase|email|registr|masiv|env[ií]o/i.test(`${b.text} ${b.href} ${b.id}`))
        .slice(0, 40);
      return {
        title: document.title,
        url: location.href,
        bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500),
        hasFormLogin: Boolean(document.querySelector('#formLogin')),
        forms,
        inputs,
        buttons,
        rootHtmlLen: document.getElementById('root')?.innerHTML?.length || 0,
      };
    });

    const slug = url.replace(/https?:\/\//, '').replace(/[^\w]+/g, '_').slice(0, 80);
    await page.screenshot({ path: path.join(outDir, `${slug}.png`), fullPage: true });
    await writeFile(path.join(outDir, `${slug}.html`), await page.content(), 'utf8');
    report.push({ requested: url, ...info });
    console.log(JSON.stringify({ requested: url, final: info.url, hasFormLogin: info.hasFormLogin, forms: info.forms.length, inputs: info.inputs.length }, null, 2));
  } catch (err) {
    report.push({ requested: url, error: String(err) });
    console.error('FAIL', url, err);
  }
}

await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
await browser.close();
console.log('Wrote', path.join(outDir, 'report.json'));
