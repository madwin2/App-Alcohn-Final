import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';

export async function saveArtifacts(
  page: Page,
  artifactsDir: string,
  label: string,
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(artifactsDir, `${stamp}_${label}`);
  await mkdir(dir, { recursive: true });

  try {
    await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true });
  } catch {
    // ignore
  }

  try {
    const html = await page.content();
    await writeFile(path.join(dir, 'page.html'), html, 'utf8');
  } catch {
    // ignore
  }

  try {
    const text = await page.locator('body').innerText({ timeout: 5000 });
    await writeFile(path.join(dir, 'body.txt'), text, 'utf8');
  } catch {
    // ignore
  }

  return dir;
}

export async function firstVisibleSelector(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 8000) });
      return selector;
    } catch {
      continue;
    }
  }
  return null;
}

export async function clickFirstMatch(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<string> {
  const selector = await firstVisibleSelector(page, selectors, timeoutMs);
  if (!selector) {
    throw new Error(`No se encontró botón/elemento visible: ${selectors.join(' | ')}`);
  }
  await page.locator(selector).first().click();
  return selector;
}

export async function fillFirstMatch(
  page: Page,
  selectors: string[],
  value: string,
  timeoutMs: number,
): Promise<string> {
  const selector = await firstVisibleSelector(page, selectors, timeoutMs);
  if (!selector) {
    throw new Error(`No se encontró campo visible: ${selectors.join(' | ')}`);
  }
  const loc = page.locator(selector).first();
  await loc.click({ clickCount: 3 }).catch(() => undefined);
  await loc.fill(value);
  return selector;
}

export function isLoginPage(url: string): boolean {
  return /b2clogin\.com|login|signin|oauth/i.test(url);
}

export async function looksLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (isLoginPage(url)) return false;
  if (!/pymes\.andreani\.com/i.test(url)) return false;

  const ingresar = page.getByRole('button', { name: /^ingresar$/i }).or(
    page.getByRole('link', { name: /^ingresar$/i }),
  );
  if (await ingresar.first().isVisible({ timeout: 1500 }).catch(() => false)) {
    return false;
  }

  const body = await page.locator('body').innerText().catch(() => '');
  // No usar "Hacer un envío": también está en el footer público
  return /todo listo para empezar|historial de env[ií]os/i.test(body);
}
