#!/bin/bash
# Diagnóstico rápido: captura XHR al buscar sucursal de origen.
set -euo pipefail
cd /opt/andreani-worker
node --input-type=module <<'JS'
import { loadConfig } from './dist/config.js';
import { openAuthenticatedPage, closeBrowser } from './dist/andreani/session.js';

const config = loadConfig();
const seen = [];
const { page, context } = await openAuthenticatedPage(config);

page.on('response', async (res) => {
  const url = res.url();
  if (!/andreani|sucurs|agencia|punto|geo|place|nominatim|mapbox|google|leaflet|tile/i.test(url)) return;
  const status = res.status();
  let bodyPreview = '';
  try {
    const ct = res.headers()['content-type'] || '';
    if (/json|text|javascript/i.test(ct)) {
      bodyPreview = (await res.text()).slice(0, 180).replace(/\s+/g, ' ');
    }
  } catch {}
  seen.push({ status, url: url.slice(0, 180), bodyPreview });
  console.log(`[net] ${status} ${url.slice(0, 160)}`);
  if (bodyPreview) console.log(`      ${bodyPreview}`);
});

page.on('requestfailed', (req) => {
  const url = req.url();
  if (!/andreani|sucurs|agencia|punto|geo|place|nominatim|mapbox|google/i.test(url)) return;
  console.log(`[fail] ${req.failure()?.errorText || '?'} ${url.slice(0, 160)}`);
});

try {
  await page.goto(config.andreani.homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const hero = page.getByRole('button', { name: /^hacer un env[ií]o$/i }).first();
  await hero.click();
  await page.waitForTimeout(1500);
  const card = page.getByText(/Andreani env[ií]os/i).first();
  if (await card.isVisible({ timeout: 8000 }).catch(() => false)) {
    await card.click();
    await page.waitForTimeout(2000);
  }

  const box = page
    .locator('input[type="search"], input[placeholder*="direcci" i], input[placeholder*="sucursal" i]')
    .or(page.getByPlaceholder(/direcci|sucursal|buscar/i))
    .first();
  await box.waitFor({ state: 'visible', timeout: 20000 });
  await box.click({ clickCount: 3 });
  await box.fill('Alberti 1254, Mar Del Plata');
  await page.waitForTimeout(1500);

  // Intentar click en sugerencia autocomplete
  const suggestion = page.getByText(/Alberti 1254.*Mar del Plata/i).first();
  if (await suggestion.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('[probe] click sugerencia autocomplete');
    await suggestion.click();
  } else {
    console.log('[probe] sin sugerencia visible → Enter');
    await box.press('Enter');
  }

  await page.waitForTimeout(20000);
  const body = await page.locator('body').innerText();
  console.log('---BODY SNIP---');
  console.log(body.slice(0, 900));
  console.log('---Kiosko visible?', await page.getByText(/Kiosko wow/i).first().isVisible().catch(() => false));
  console.log('---skeleton?', await page.locator('.MuiSkeleton-root').first().isVisible().catch(() => false));
  console.log('---net count', seen.length);
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await closeBrowser().catch(() => {});
}
JS
