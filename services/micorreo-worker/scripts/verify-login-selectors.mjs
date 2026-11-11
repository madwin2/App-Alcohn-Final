import { chromium } from 'playwright';
import { MICORREO_LANDING_URL } from '../src/micorreo/login-micorreo.ts';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(MICORREO_LANDING_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

const email = page.locator('input[name="email"]').first();
const password = page.locator('input[name="password"][type="password"]').first();
await email.waitFor({ state: 'visible', timeout: 20_000 });

const legacy = await page.locator('#formLogin').isVisible().catch(() => false);
const form = page.locator('form').filter({ has: page.locator('input[name="password"]') }).first();
const formVisible = await form.isVisible().catch(() => false);
const emailVisible = await email.isVisible();
const passwordVisible = await password.isVisible();
const ingresar = form.locator('button[type="submit"]:has-text("Ingresar")').first();
const ingresarVisible = await ingresar.isVisible().catch(() => false);

console.log(
  JSON.stringify(
    {
      url: page.url(),
      legacyFormLogin: legacy,
      muiFormVisible: formVisible,
      emailVisible,
      passwordVisible,
      ingresarVisible,
      ok: formVisible && emailVisible && passwordVisible && ingresarVisible && !legacy,
    },
    null,
    2,
  ),
);

await browser.close();
if (!(formVisible && emailVisible && passwordVisible && ingresarVisible)) {
  process.exit(1);
}
