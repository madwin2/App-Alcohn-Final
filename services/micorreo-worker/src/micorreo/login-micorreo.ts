import type { Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import {
  isLikelyLoggedIn,
  isLoginError,
  isTransientSessionError,
  saveArtifacts,
} from './browser-helpers.js';

const DEFAULT_LOGIN_ATTEMPTS = 3;

function loginAttemptsFromEnv(): number {
  const n = Number(process.env.MICORREO_LOGIN_MAX_RETRIES || DEFAULT_LOGIN_ATTEMPTS);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5) : DEFAULT_LOGIN_ATTEMPTS;
}

/** MiCorreo muestra este texto en la misma pantalla de login; el 2.º intento cierra la sesión anterior. */
export function isActiveSessionConflictMessage(text: string): boolean {
  return /tiene una sesi[oó]n activa/i.test(text) && /intente nuevamente|intenta nuevamente/i.test(text);
}

/** Cierra modales Bootstrap que bloquean el formulario de login. */
async function dismissBlockingModals(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visibleModal = page.locator('.modal.show').first();
    if (!(await visibleModal.isVisible().catch(() => false))) break;

    const closeBtn = visibleModal.locator(
      'button.btn-close, button[data-bs-dismiss="modal"], .close, [aria-label="Close"]',
    );
    if (await closeBtn.first().isVisible().catch(() => false)) {
      await closeBtn.first().click({ force: true });
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }
}

async function isLoginFormVisible(page: Page): Promise<boolean> {
  return page.locator('#formLogin').isVisible().catch(() => false);
}

async function submitLoginForm(page: Page, config: WorkerConfig['micorreo']): Promise<void> {
  await dismissBlockingModals(page);

  const loginForm = page.locator('#formLogin');
  await loginForm.waitFor({ state: 'visible', timeout: config.timeoutMs });

  const emailField = loginForm.locator('input[name="email"]').first();
  const passwordField = loginForm.locator('input[name="password"]').first();

  await emailField.scrollIntoViewIfNeeded();
  await emailField.waitFor({ state: 'visible', timeout: config.timeoutMs });
  await emailField.fill(config.user);

  await passwordField.waitFor({ state: 'visible', timeout: config.timeoutMs });
  await passwordField.fill(config.password);

  const submitBtn = loginForm.locator('button[type="submit"]:has-text("Ingresar")').first();
  await submitBtn.scrollIntoViewIfNeeded();
  await submitBtn.click();
}

async function waitAfterLoginSubmit(page: Page, config: WorkerConfig['micorreo']): Promise<string> {
  await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
  await page.waitForTimeout(2000);
  return page.locator('body').innerText().catch(() => '');
}

export async function loginMicorreo(page: Page, config: WorkerConfig['micorreo']): Promise<void> {
  const maxAttempts = loginAttemptsFromEnv();
  await page.setViewportSize({ width: 1400, height: 900 });

  // Carga inicial única; los reintentos por sesión activa son en la misma página.
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);

  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.warn(
        `[micorreo] Login intento ${attempt}/${maxAttempts} en la misma página (sesión activa → volver a ingresar).`,
      );
      await page.waitForTimeout(1000);
    }

    const bodyBefore = await page.locator('body').innerText().catch(() => '');
    if (isLikelyLoggedIn(page.url(), bodyBefore)) {
      return;
    }

    if (!(await isLoginFormVisible(page))) {
      throw new Error(
        'No está visible el formulario de login (#formLogin). MiCorreo cambió la pantalla o redirigió.',
      );
    }

    await submitLoginForm(page, config);
    const bodyAfter = await waitAfterLoginSubmit(page, config);

    if (isLikelyLoggedIn(page.url(), bodyAfter)) {
      return;
    }

    if (isLoginError(bodyAfter)) {
      throw new Error('Login rechazado: credenciales inválidas');
    }

    if (/captcha|recaptcha|robot/i.test(bodyAfter)) {
      throw new Error(
        'MiCorreo muestra captcha o verificación extra. Completá login manual una vez o pedí URL directa post-login.',
      );
    }

    const sessionConflict =
      isActiveSessionConflictMessage(bodyAfter) || isTransientSessionError(bodyAfter);

    if (sessionConflict && attempt < maxAttempts) {
      lastError = 'sesión activa en otro dispositivo';
      await page.waitForTimeout(2500);
      continue;
    }

    if (sessionConflict) {
      lastError = 'sesión activa en otro dispositivo';
      break;
    }

    lastError = 'login sin confirmar pantalla autenticada';
    if ((await isLoginFormVisible(page)) && attempt < maxAttempts) {
      continue;
    }
  }

  throw new Error(
    lastError
      ? `Login falló tras ${maxAttempts} intentos (${lastError}). Revisá artifacts/ o cerrá sesiones MiCorreo en otros dispositivos.`
      : `Login incierto tras ${maxAttempts} intentos. Revisá capturas en artifacts/.`,
  );
}

export async function loginMicorreoWithArtifacts(
  page: Page,
  config: WorkerConfig['micorreo'],
  artifactsDir: string,
  label: string,
): Promise<void> {
  try {
    await loginMicorreo(page, config);
  } catch (error) {
    await saveArtifacts(page, artifactsDir, label);
    throw error;
  }
}
