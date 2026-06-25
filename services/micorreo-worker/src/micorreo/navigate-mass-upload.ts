import type { Page } from 'playwright';
import type { WorkerConfig } from '../config.js';

export const MICORREO_MASS_UPLOAD_URL =
  'https://www.correoargentino.com.ar/MiCorreo/public/enviosMasivos';

async function dismissConfirmModals(page: Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const visibleModal = page.locator('.modal.show').first();
    if (!(await visibleModal.isVisible().catch(() => false))) break;

    const primary = modalPrimaryButton(visibleModal);
    if (await primary.first().isVisible().catch(() => false)) {
      await primary.first().click({ force: true });
      await page.waitForTimeout(600);
      continue;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

function modalPrimaryButton(modal: ReturnType<Page['locator']>) {
  return modal.locator(
    'button.btn-correo-primary, button:has-text("Continuar"), button:has-text("Aceptar"), button:has-text("Confirmar"), button:has-text("Sí")',
  );
}

async function pageHasOrigenStep(page: Page): Promise<boolean> {
  const body = await page.locator('body').innerText().catch(() => '');
  return /Nombre y apellido.*Raz[oó]n social/i.test(body) && /Siguiente/i.test(body);
}

async function pageHasCsvUploadStep(page: Page): Promise<boolean> {
  const body = await page.locator('body').innerText().catch(() => '');
  return /carga de datos/i.test(body);
}

/** Completa Origen en envíos masivos: modo Sucursal + provincia + sucursal de origen. */
export async function ensureOrigenReady(page: Page, config: WorkerConfig['micorreo']): Promise<void> {
  if (!(await pageHasOrigenStep(page))) return;

  console.log('[micorreo] → completando Origen (provincia + sucursal)');

  const checkSucursal = page.locator('#checkSucursal');
  if (await checkSucursal.isVisible().catch(() => false)) {
    if (!(await checkSucursal.isChecked().catch(() => false))) {
      await checkSucursal.check({ force: true });
      await page.waitForTimeout(900);
    }
  }

  const provSelect = page.locator('#sucursalProvinciaOrigen');
  if (await provSelect.isVisible().catch(() => false)) {
    const provVal = await provSelect.inputValue().catch(() => '');
    if (!provVal || provVal === '-1') {
      const provCode = process.env.MICORREO_ORIGEN_PROVINCIA || 'B';
      await provSelect.selectOption(provCode).catch(async () => {
        await provSelect.selectOption({ label: 'BUENOS AIRES' });
      });
      await page.waitForTimeout(1500);
    }
  }

  const sucSelect = page.locator('#sucursalOrigen');
  if (await sucSelect.isVisible().catch(() => false)) {
    const sucVal = await sucSelect.inputValue().catch(() => '');
    if (!sucVal || sucVal === '-1') {
      const labelHint = process.env.MICORREO_ORIGEN_SUCURSAL || 'MAR DEL PLATA UP 28';
      const matched = sucSelect.locator('option').filter({ hasText: new RegExp(labelHint, 'i') }).first();
      if ((await matched.count()) > 0) {
        const value = await matched.getAttribute('value');
        if (value) await sucSelect.selectOption(value);
      } else {
        const firstValid = sucSelect.locator('option[value]:not([value="-1"])').first();
        const value = await firstValid.getAttribute('value');
        if (value) await sucSelect.selectOption(value);
      }
      await page.waitForTimeout(600);
    }
  }

  await page.waitForTimeout(config.slowMoMs || 300);
}

async function getVisibleFileInput(page: Page) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  for (let i = 0; i < count; i += 1) {
    const input = inputs.nth(i);
    if (await input.isVisible().catch(() => false)) return input;
  }
  return null;
}

async function hasActiveCsvFileInput(page: Page): Promise<boolean> {
  if (!(await pageHasCsvUploadStep(page))) return false;
  return (await getVisibleFileInput(page)) !== null;
}

async function readStepError(page: Page): Promise<string | null> {
  const body = await page.locator('body').innerText().catch(() => '');
  const match = body.match(
    /Los campos provincia y sucursal son obligatorios|provincia y sucursal son obligatorios/i,
  );
  return match ? match[0] : null;
}

async function clickSiguienteIfPresent(page: Page, config: WorkerConfig['micorreo']): Promise<boolean> {
  const candidates = [
    page.locator('#next').first(),
    page.getByRole('button', { name: /^Siguiente$/i }).first(),
    page.locator('button.btn-correo-primary:has-text("Siguiente")').first(),
  ];

  for (const btn of candidates) {
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (await btn.isDisabled().catch(() => false)) continue;

    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1200);
    await dismissConfirmModals(page);
    return true;
  }

  return false;
}

/** Wizard envíos masivos: Origen → Carga de datos (CSV). */
export async function advanceToCsvUploadStep(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<void> {
  const maxSteps = 6;

  for (let step = 0; step < maxSteps; step += 1) {
    if (await hasActiveCsvFileInput(page)) return;

    if (await pageHasOrigenStep(page)) {
      await ensureOrigenReady(page, config);
      const stepError = await readStepError(page);
      if (stepError) {
        console.warn(`[micorreo] aviso Origen: ${stepError} — reintentando selección`);
        await ensureOrigenReady(page, config);
      }
    }

    const clicked = await clickSiguienteIfPresent(page, config);
    if (clicked) {
      console.log(`[micorreo] → clic Siguiente (paso ${step + 1})`);
    }

    const afterError = await readStepError(page);
    if (afterError && !(await pageHasCsvUploadStep(page))) {
      if (step < maxSteps - 1) {
        await ensureOrigenReady(page, config);
        continue;
      }
      throw new Error(`${afterError} (paso Origen en envíos masivos).`);
    }

    if (await hasActiveCsvFileInput(page)) return;
    if (!clicked) break;
  }

  if (!(await hasActiveCsvFileInput(page))) {
    if (await pageHasOrigenStep(page)) {
      throw new Error(
        'Quedó en Origen sin avanzar a Carga de datos. Revisá provincia/sucursal de origen en MiCorreo.',
      );
    }
  }
}

async function navigateEnviosMasivosWithRetry(
  page: Page,
  config: WorkerConfig['micorreo'],
  targetUrl: string,
): Promise<void> {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.warn(`[micorreo] /enviosMasivos no disponible — reintento ${attempt}/${maxAttempts}`);
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1000);

    const bodyText = await page.locator('body').innerText().catch(() => '');
    const serviceDown =
      /error al procesar|servicio no se encuentra disponible|intentá nuevamente en unos minutos/i.test(
        bodyText,
      );

    if (!serviceDown) return;

    const retryBtn = page.getByRole('link', { name: /Reintentar/i }).or(
      page.getByRole('button', { name: /Reintentar/i }),
    );
    if (await retryBtn.first().isVisible().catch(() => false)) {
      await retryBtn.first().click();
      await page.waitForTimeout(2500);
      const afterRetry = await page.locator('body').innerText().catch(() => '');
      if (!/servicio no se encuentra disponible/i.test(afterRetry)) return;
    }

    await page.waitForTimeout(2000 * attempt);
  }

  throw new Error(
    'MiCorreo /enviosMasivos respondió con error de servicio. Probá de nuevo en unos minutos o subí el CSV a mano.',
  );
}

export async function navigateToMassUpload(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<void> {
  const targetUrl = config.uploadUrl || MICORREO_MASS_UPLOAD_URL;

  await navigateEnviosMasivosWithRetry(page, config, targetUrl);

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/error al procesar|servicio no se encuentra disponible/i.test(bodyText)) {
    throw new Error(
      'MiCorreo /enviosMasivos respondió con error de servicio. Probá de nuevo en unos minutos o subí el CSV a mano.',
    );
  }

  if (!page.url().includes('enviosMasivos')) {
    const masivoHref = page.locator('a[href*="enviosMasivos"]').first();
    if (await masivoHref.isVisible().catch(() => false)) {
      await masivoHref.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
    }
  }

  await advanceToCsvUploadStep(page, config);
}

export async function waitForCsvFileInput(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<string> {
  await advanceToCsvUploadStep(page, config);

  const activeInput = await getVisibleFileInput(page);
  if (activeInput) {
    return 'input[type="file"]';
  }

  // Fallback: input oculto pero presente en Carga de datos
  if (await pageHasCsvUploadStep(page)) {
    const hidden = page.locator('input[type="file"]').first();
    if ((await hidden.count()) > 0) return 'input[type="file"]';
  }

  throw new Error(
    'No se encontró input de archivo en el paso Carga de datos. Revisá artifacts/ o completá Origen manualmente una vez.',
  );
}

export async function confirmCsvUpload(page: Page, config: WorkerConfig['micorreo']): Promise<void> {
  const buttons = [
    'button:has-text("Importar")',
    'button:has-text("Cargar")',
    'button:has-text("Procesar")',
    'button:has-text("Validar")',
    'button:has-text("Subir")',
    ...config.selectors.submitUpload,
  ];

  for (const selector of buttons) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible().catch(() => false)) {
      if (await btn.isDisabled().catch(() => false)) continue;
      console.log(`[micorreo] → confirmar carga (${selector})`);
      await btn.click();
      await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(2000);
      return;
    }
  }
}

/** Tras «La importación se realizó con éxito», confirmar con Guardar. */
export async function saveAfterSuccessfulImport(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<void> {
  const successTimeout = Math.min(config.timeoutMs, 45_000);
  const successMsg = page.getByText(/importaci[oó]n se realiz[oó] con [ée]xito/i).first();
  try {
    await successMsg.waitFor({ state: 'visible', timeout: successTimeout });
  } catch {
    const body = await page.locator('body').innerText().catch(() => '');
    if (!/importaci[oó]n se realiz[oó] con [ée]xito/i.test(body)) {
      return;
    }
  }

  console.log('[micorreo] → importación OK, clic en Guardar');

  const guardarCandidates = [
    page.locator('#guardarEnvio button:has-text("Guardar")'),
    page.locator('.modal.show button:has-text("Guardar")'),
    page.locator('button.btn-correo-primary:has-text("Guardar")'),
    page.getByRole('button', { name: /^Guardar$/i }),
  ];

  const deadline = Date.now() + Math.min(config.timeoutMs, 30_000);
  while (Date.now() < deadline) {
    for (const locator of guardarCandidates) {
      const btn = locator.first();
      if (!(await btn.isVisible().catch(() => false))) continue;
      if (await btn.isDisabled().catch(() => false)) continue;
      const text = (await btn.innerText().catch(() => '')).toLowerCase();
      if (text.includes('medida')) continue;

      await btn.scrollIntoViewIfNeeded();
      await btn.click({ force: true });
      await page.waitForTimeout(1000);
      await dismissConfirmModals(page);

      const modalGuardar = page.locator('.modal.show button.btn-correo-primary:has-text("Guardar")');
      if (await modalGuardar.first().isVisible().catch(() => false)) {
        console.log('[micorreo] → confirmar modal Guardar');
        await modalGuardar.first().click({ force: true });
        await page.waitForTimeout(1200);
      }

      await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
      return;
    }
    await page.waitForTimeout(800);
  }

  console.warn('[micorreo] no se encontró botón Guardar habilitado tras importación exitosa');
}

export type PayWithBalanceResult =
  | { status: 'paid'; message: string }
  | { status: 'payment_error'; message: string }
  | { status: 'not_attempted'; message: string };

async function clickFirstVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.isVisible().catch(() => false))) continue;
    if (await locator.isDisabled().catch(() => false)) continue;
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1000);
    return true;
  }
  return false;
}

async function clickFirstVisibleLocator(
  locators: Array<ReturnType<Page['locator']>>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const target = locator.first();
      if (!(await target.isVisible().catch(() => false))) continue;
      if (await target.isDisabled().catch(() => false)) continue;
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ force: true });
      await target.page().waitForLoadState('networkidle').catch(() => undefined);
      await target.page().waitForTimeout(1000);
      return true;
    }
    await locators[0]?.page().waitForTimeout(600);
  }
  return false;
}

async function clickElementByExactText(page: Page, text: string): Promise<boolean> {
  return page.evaluate<boolean>(`((wantedText) => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const wanted = normalize(wantedText);
    const elements = [...document.querySelectorAll('button, a, [role="button"], input, div, span')];
    const match = elements.find((el) => {
      if (el instanceof HTMLInputElement) return normalize(el.value) === wanted;
      return normalize(el.textContent) === wanted;
    });
    if (!match) return false;

    const clickable = match.closest('button, a, [role="button"]') || match.closest('[onclick]') || match;
    clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  })(${JSON.stringify(text)})`);
}

async function waitForPaymentScreen(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await page.locator('body').innerText().catch(() => '');
    if (/realiz[aá].*pago|seleccion[aá].*medio de pago|saldo disponible|tarjeta de cr[eé]dito|mercado pago/i.test(body)) {
      return true;
    }
    await page.waitForTimeout(700);
  }
  return false;
}

async function selectBalancePayment(page: Page): Promise<boolean> {
  const labelOption = page.getByLabel(/saldo/i).first();
  if (await labelOption.isVisible().catch(() => false)) {
    await labelOption.check({ force: true }).catch(async () => {
      await labelOption.click({ force: true });
    });
    await page.waitForTimeout(500);
    return true;
  }

  const clickedText = await clickFirstVisibleLocator(
    [
      page.getByText(/^Saldo$/i),
      page.getByText(/Saldo disponible/i),
      page.locator('label:has-text("Saldo")'),
    ],
    3000,
  );
  if (clickedText) return true;

  return page.evaluate<boolean>(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const saldoLabel = labels.find((label) => /saldo/i.test(label.textContent || ''));
    if (saldoLabel) {
      const forId = saldoLabel.getAttribute('for');
      const input = forId ? document.getElementById(forId) : saldoLabel.querySelector('input');
      if (input && 'checked' in input) {
        input.checked = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        saldoLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      }
      saldoLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }

    const radios = [...document.querySelectorAll('input[type="radio"]')];
    const saldoRadio = radios.find((radio) => /saldo/i.test(radio.value || radio.id || radio.name || ''));
    if (saldoRadio) {
      saldoRadio.checked = true;
      saldoRadio.dispatchEvent(new Event('input', { bubbles: true }));
      saldoRadio.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  })()`);
}

/**
 * Intenta pagar el envío con saldo disponible.
 *
 * MiCorreo cambia textos/selectores seguido; por eso se usan selectores y textos amplios.
 * Si no encuentra una ruta clara para pagar, devuelve `payment_error` para que la app
 * no marque la etiqueta como lista/pagada por error.
 */
export async function payWithAvailableBalance(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<PayWithBalanceResult> {
  const beforeText = await page.locator('body').innerText().catch(() => '');
  if (/saldo insuficiente|no posee saldo|sin saldo|saldo disponible insuficiente/i.test(beforeText)) {
    return { status: 'payment_error', message: 'Saldo disponible insuficiente en MiCorreo.' };
  }

  const clickedPay = await clickFirstVisibleLocator(
    [
      page.getByRole('button', { name: /^Pagar$/i }),
      page.getByRole('link', { name: /^Pagar$/i }),
      page.locator('button:has-text("Pagar")'),
      page.locator('a:has-text("Pagar")'),
      page.locator('[role="button"]:has-text("Pagar")'),
      page.locator('.btn:has-text("Pagar"), .btn-correo-primary:has-text("Pagar")'),
      page.locator('input[type="button"][value*="Pagar" i]'),
      page.locator('input[type="submit"][value*="Pagar" i]'),
      page.getByText(/^Pagar$/i),
      ...config.selectors.payWithBalance.map((selector) => page.locator(selector)),
    ],
    Math.min(config.timeoutMs, 45_000),
  );
  if (!clickedPay) {
    return {
      status: 'payment_error',
      message: 'Etiqueta generada, pero no se encontró el botón para pagar con saldo disponible.',
    };
  }

  let onPaymentScreen = await waitForPaymentScreen(page, Math.min(config.timeoutMs, 30_000));
  if (!onPaymentScreen) {
    console.warn('[micorreo] click normal en Pagar no abrió pago; probando fallback por texto');
    const clickedFallback = await clickElementByExactText(page, 'Pagar');
    if (clickedFallback) {
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1500);
      onPaymentScreen = await waitForPaymentScreen(page, Math.min(config.timeoutMs, 30_000));
    }
  }
  if (!onPaymentScreen) {
    const body = await page.locator('body').innerText().catch(() => '');
    return {
      status: 'payment_error',
      message: body.slice(0, 500) || 'Se hizo click en Pagar, pero no apareció la pantalla de pago.',
    };
  }

  const selectedBalance = await selectBalancePayment(page);
  if (!selectedBalance) {
    return {
      status: 'payment_error',
      message: 'No se pudo seleccionar el medio de pago Saldo.',
    };
  }
  await page.waitForTimeout(800);

  const clickedConfirm = await clickFirstVisibleLocator(
    [
      page.getByRole('button', { name: /^Pagar$/i }),
      page.getByRole('button', { name: /Confirmar/i }),
      page.getByRole('button', { name: /Finalizar/i }),
      page.locator('button:has-text("Pagar")'),
      page.locator('button:has-text("Confirmar")'),
      page.locator('button:has-text("Finalizar")'),
      page.locator('.modal.show button.btn-correo-primary'),
      ...config.selectors.confirmPayment.map((selector) => page.locator(selector)),
    ],
    Math.min(config.timeoutMs, 30_000),
  );
  if (!clickedConfirm) {
    return {
      status: 'payment_error',
      message: 'Se seleccionó Saldo, pero no se encontró el botón final para confirmar el pago.',
    };
  }

  const successTimeout = Math.min(config.timeoutMs, 45_000);
  await page.waitForTimeout(2500);
  const afterText = await page.locator('body').innerText({ timeout: successTimeout }).catch(() => '');

  if (/saldo insuficiente|no posee saldo|sin saldo|rechazad|no se pudo.*pago/i.test(afterText)) {
    return {
      status: 'payment_error',
      message: afterText.slice(0, 500) || 'No se pudo pagar con saldo disponible.',
    };
  }

  if (/pago.*(realiz[oó]|exitoso|confirmado)|abonad|pagad|operaci[oó]n exitosa/i.test(afterText)) {
    return { status: 'paid', message: 'Etiqueta pagada con saldo disponible.' };
  }

  return {
    status: 'payment_error',
    message: afterText.slice(0, 500) || 'No se pudo confirmar si el pago con saldo fue exitoso.',
  };
}
