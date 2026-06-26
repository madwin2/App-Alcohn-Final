import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { extractMicorreoPortalMessage } from '../portal-messages.js';

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
    // ignore screenshot failures
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

export async function fillFirstMatch(
  page: Page,
  selectors: string[],
  value: string,
  timeoutMs: number,
): Promise<string> {
  const selector = await firstVisibleSelector(page, selectors, timeoutMs);
  if (!selector) {
    throw new Error(`No se encontró campo visible para selectores: ${selectors.join(' | ')}`);
  }
  await page.locator(selector).first().fill(value);
  return selector;
}

export async function clickFirstMatch(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<string> {
  const selector = await firstVisibleSelector(page, selectors, timeoutMs);
  if (!selector) {
    throw new Error(`No se encontró botón visible para selectores: ${selectors.join(' | ')}`);
  }
  await page.locator(selector).first().click();
  return selector;
}

export async function readPortalFeedback(page: Page, timeoutMs: number): Promise<string> {
  const domSnippet = await page
    .evaluate<string>(`(() => {
      const blocks = [
        ...document.querySelectorAll(
          '.alert-danger, .alert.alert-danger, .text-danger, [class*="error" i], [role="alert"]',
        ),
      ];
      for (const el of blocks) {
        const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (/archivo contiene errores|\\(Fila \\d+\\)/i.test(t) && t.length >= 20 && t.length <= 2000) {
          return t;
        }
      }
      const body = document.body?.innerText || '';
      const idx = body.search(/archivo contiene errores/i);
      if (idx >= 0) return body.slice(idx, idx + 1200);
      return '';
    })()`)
    .catch(() => '');

  if (domSnippet.trim()) {
    const extracted = extractMicorreoPortalMessage(domSnippet);
    if (extracted) return extracted;
  }

  const candidates = [
    '.alert-danger',
    '.alert.alert-danger',
    '[role="alert"]',
    '.alert',
    '.error',
    '.success',
    '.toast',
    '.notification',
    '.mensaje',
    '.message',
    '[class*="error" i]',
    '[class*="success" i]',
    '[class*="alert" i]',
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const text = (await locator.nth(i).innerText().catch(() => '')).trim();
      if (text.length < 8) continue;
      const extracted = extractMicorreoPortalMessage(text);
      if (extracted && extracted.length < 600) return extracted;
    }
  }

  await page.waitForTimeout(Math.min(timeoutMs, 3000));
  const body = (await page.locator('body').innerText({ timeout: 5000 })).trim();
  return extractMicorreoPortalMessage(body);
}

export function isLoginError(text: string): boolean {
  if (isTransientSessionError(text)) return false;
  return /credencial|contrase[nñ]a.*incorrect|usuario.*incorrect|inv[aá]lid.*contrase/i.test(text);
}

/** MiCorreo a veces falla el 1.er intento si ya hay sesión abierta en otro lado. */
export function isTransientSessionError(text: string): boolean {
  return (
    /sesi[oó]n.*(abierta|activa|otra|existe|iniciada|duplicada)/i.test(text) ||
    /tiene una sesi[oó]n activa|cerrar[aá] su sesi[oó]n anterior/i.test(text) ||
    /ya ten[eé]s una sesi[oó]n|sesi[oó]n en otro|usuario.*conectado|cerr[aá].*la otra sesi[oó]n/i.test(text) ||
    /error al (ingresar|iniciar|procesar)/i.test(text) ||
    /intent[aá].*nuevamente|reintent/i.test(text) ||
    /servicio no se encuentra disponible/i.test(text)
  );
}

export function isLikelyLoggedIn(url: string, bodyText: string): boolean {
  if (/login|ingres[aá]|public\/?$/i.test(url) && /ingres[aá] a tu cuenta/i.test(bodyText)) {
    return false;
  }
  return (
    /cerrar sesi[oó]n|mi cuenta|nuevo env[ií]o|env[ií]o masivo|hola,|dashboard/i.test(bodyText)
  );
}
