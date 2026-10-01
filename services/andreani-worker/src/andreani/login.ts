import type { Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import { isLoginPage, looksLoggedIn, saveArtifacts } from '../browser-helpers.js';

const LOGIN_MAX_ATTEMPTS = 3;

function emailField(page: Page) {
  // B2C actual: input#signInName type=text name=Email (NO type=email)
  return page
    .locator('#signInName')
    .or(page.getByLabel(/^email$/i))
    .or(page.locator('input[name="Email"]'))
    .or(page.locator('input[type="email"]'))
    .first();
}

function passwordField(page: Page) {
  return page
    .locator('#password')
    .or(page.getByLabel(/^contrase[nñ]a$/i))
    .or(page.locator('input[type="password"]'))
    .first();
}

async function waitForLoginForm(page: Page, timeoutMs: number): Promise<void> {
  await emailField(page).waitFor({ state: 'visible', timeout: timeoutMs });
}

async function enterLoginFromHome(page: Page, timeoutMs: number): Promise<void> {
  if (isLoginPage(page.url())) return;
  if (await emailField(page).isVisible().catch(() => false)) return;

  const ingresar = page
    .getByRole('button', { name: /^ingresar$/i })
    .or(page.getByRole('link', { name: /^ingresar$/i }))
    .or(page.getByText(/^ingresar$/i))
    .first();

  if (await ingresar.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ingresar.click();
  } else {
    const loginEntry = page
      .getByRole('button', { name: /iniciar sesi[oó]n/i })
      .or(page.getByRole('link', { name: /iniciar sesi[oó]n/i }));
    if (await loginEntry.first().isVisible().catch(() => false)) {
      await loginEntry.first().click();
    }
  }

  await Promise.race([
    page.waitForURL(/b2clogin\.com|transaccional-router-login|oauth2/i, { timeout: timeoutMs }),
    waitForLoginForm(page, timeoutMs),
  ]).catch(() => undefined);

  await waitForLoginForm(page, timeoutMs).catch(() => undefined);
}

async function attemptLoginOnce(page: Page, config: WorkerConfig): Promise<boolean> {
  const { user, password, loginUrl, timeoutMs, homeUrl } = config.andreani;

  await page.context().clearCookies();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForTimeout(2000);

  if (await looksLoggedIn(page)) return true;

  if (!isLoginPage(page.url())) {
    await enterLoginFromHome(page, timeoutMs);
  }

  if (!(await emailField(page).isVisible({ timeout: 8000 }).catch(() => false))) {
    await page.context().clearCookies();
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(3000);
    if (!(await looksLoggedIn(page))) {
      await enterLoginFromHome(page, timeoutMs);
    }
  }

  if (await looksLoggedIn(page)) return true;

  const email = emailField(page);
  const pass = passwordField(page);

  await email.waitFor({ state: 'visible', timeout: timeoutMs });
  await email.click();
  await email.fill('');
  await email.pressSequentially(user, { delay: 20 });

  await pass.waitFor({ state: 'visible', timeout: timeoutMs });
  await pass.click();
  await pass.fill('');
  await pass.pressSequentially(password, { delay: 20 });

  const submit = page
    .locator('button')
    .filter({ hasText: /^iniciar sesi[oó]n$/i })
    .last();
  await submit.click();

  await Promise.race([
    page.getByText(/todo listo para empezar/i).waitFor({ state: 'visible', timeout: timeoutMs }),
    page.waitForURL(/andreani\.com\/cuenta|pymes\.andreani\.com/i, { timeout: timeoutMs }),
  ]).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForTimeout(2500);

  if (await looksLoggedIn(page)) return true;

  await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
  await page
    .getByText(/todo listo para empezar/i)
    .first()
    .waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 45000) })
    .catch(() => undefined);
  await page.waitForTimeout(1500);

  return looksLoggedIn(page);
}

/**
 * Login Azure B2C Andreani con ANDREANI_USER / ANDREANI_PASS.
 */
export async function ensureLoggedIn(page: Page, config: WorkerConfig): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log(`[andreani] login intento ${attempt}/${LOGIN_MAX_ATTEMPTS}…`);
      const ok = await attemptLoginOnce(page, config);
      if (ok) {
        console.log(`[andreani] login OK (intento ${attempt})`);
        return;
      }
      lastError = new Error('Portal no mostró home autenticado tras submit');
      console.warn(`[andreani] login intento ${attempt} sin éxito — reintento…`);
    } catch (error) {
      lastError = error;
      console.warn(
        `[andreani] login intento ${attempt} error:`,
        error instanceof Error ? error.message : error,
      );
      await saveArtifacts(page, config.artifactsDir, `login-attempt-${attempt}`).catch(() => undefined);
    }

    if (attempt < LOGIN_MAX_ATTEMPTS) {
      await page.waitForTimeout(2000 * attempt);
    }
  }

  const body = await page.locator('body').innerText().catch(() => '');
  const dir = await saveArtifacts(page, config.artifactsDir, 'login-failed');
  const hint = /incorrect|inv[aá]lid|error|bloquead|captcha|verific/i.test(body)
    ? ` Mensaje portal: ${body.slice(0, 280).replace(/\s+/g, ' ')}`
    : '';
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  throw new Error(
    `Login Andreani falló tras ${LOGIN_MAX_ATTEMPTS} intentos. Artifacts: ${dir}. ${detail}${hint}`,
  );
}
