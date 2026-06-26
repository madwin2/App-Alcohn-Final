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

export type SaveAfterImportResult = {
  importSuccess: boolean;
  saveSuccess: boolean;
  message: string;
};

async function pageHasImportSuccess(page: Page): Promise<boolean> {
  const body = await page.locator('body').innerText().catch(() => '');
  return /importaci[oó]n se realiz[oó] con [ée]xito|importaci[oó]n exitosa/i.test(body);
}

async function pageHasImportErrors(page: Page): Promise<boolean> {
  const body = await page.locator('body').innerText().catch(() => '');
  return /archivo contiene errores|error en el archivo|contiene errores/i.test(body);
}

async function waitForImportOutcome(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<'success' | 'error' | 'timeout'> {
  const deadline = Date.now() + Math.min(config.timeoutMs, 60_000);
  while (Date.now() < deadline) {
    if (await pageHasImportSuccess(page)) return 'success';
    if (await pageHasImportErrors(page)) return 'error';
    await page.waitForTimeout(800);
  }
  return 'timeout';
}

async function isGuardarEnvioModalVisible(page: Page): Promise<boolean> {
  const modal = page.locator('#guardarEnvio');
  if (!(await modal.isVisible().catch(() => false))) return false;
  return modal.evaluate<boolean>(`(el) => el.classList.contains('show')`);
}

async function pageShowsSaveSuccess(page: Page): Promise<boolean> {
  const body = await page.locator('body').innerText().catch(() => '');
  return /env[ií]os procesados con [ée]xito|guardado exitosamente|env[ií]o.*guardad|se guard[oó]/i.test(
    body,
  );
}

async function isPagarButtonEnabled(page: Page): Promise<boolean> {
  const pagarBtn = page.locator('#pagar').first();
  if (!(await pagarBtn.isVisible().catch(() => false))) return false;
  return !(await pagarBtn.isDisabled().catch(() => true));
}

/** Listo para pagar = mensaje de procesado + botón Pagar habilitado (como hacés manualmente). */
export async function isMassUploadReadyToPay(page: Page): Promise<boolean> {
  return (await pageShowsSaveSuccess(page)) && (await isPagarButtonEnabled(page));
}

async function waitForMassUploadReadyToPay(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isMassUploadReadyToPay(page)) {
      await page.waitForTimeout(2000);
      return await isPagarButtonEnabled(page);
    }
    await page.waitForTimeout(400);
  }
  return false;
}

async function clickElementByExactButtonText(page: Page, text: string): Promise<boolean> {
  return page.evaluate<boolean>(`((wantedText) => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const wanted = normalize(wantedText);
    const buttons = [...document.querySelectorAll('button, a[role="button"], [role="button"]')];
    const match = buttons.find((el) => normalize(el.textContent) === wanted);
    if (!match) return false;
    if (match.disabled) return false;
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })(${JSON.stringify(text)})`);
}

async function clickMainGuardarButton(page: Page): Promise<boolean> {
  const selectors = [
    page.locator('button.btn-ne-s:visible:has-text("Guardar")'),
    page.locator('button.btn-correo-primary:visible:has-text("Guardar")'),
    page.locator('[data-bs-target="#guardarEnvio"]:visible'),
    page.getByRole('button', { name: /^Guardar$/i }),
  ];

  for (const locator of selectors) {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const btn = locator.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      if (await btn.isDisabled().catch(() => false)) continue;

      const insideModal = await btn.evaluate<boolean>(`((el) => {
        return Boolean(
          el.closest('#guardarEnvio, #guardarCambios, #guardarInfo, #exampleModal'),
        );
      })()`);
      if (insideModal) continue;

      const text = (await btn.innerText().catch(() => '')).toLowerCase();
      if (text.includes('medida')) continue;

      console.log('[micorreo] → clic Guardar');
      await btn.scrollIntoViewIfNeeded().catch(() => undefined);
      await btn.click();
      await page.waitForTimeout(800);
      return true;
    }
  }

  return clickElementByExactButtonText(page, 'Guardar');
}

async function confirmGuardarEnvioModal(page: Page, config: WorkerConfig['micorreo']): Promise<boolean> {
  const modal = page.locator('#guardarEnvio');
  if (!(await modal.isVisible().catch(() => false))) return false;
  const isOpen = await modal.evaluate<boolean>(`(el) => el.classList.contains('show')`);
  if (!isOpen) return false;

  const confirmCandidates = [
    page.locator('#guardarEnvio.show button.btn-ne-s:has-text("Guardar")'),
    page.locator('#guardarEnvio.modal.show button.btn-ne-s:has-text("Guardar")'),
    page.locator('#guardarEnvio.show button:has-text("Guardar")'),
  ];

  for (const locator of confirmCandidates) {
    const btn = locator.first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (await btn.isDisabled().catch(() => false)) continue;
    console.log('[micorreo] → confirmar modal Guardar envío');
    await btn.click();
    await page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1200);
    return true;
  }

  return clickElementByExactButtonText(page, 'Guardar');
}

async function dismissSuccessModal(page: Page): Promise<void> {
  const guardarInfo = page.locator('#guardarInfo.show, #guardarInfo.modal.show');
  if (await guardarInfo.first().isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

/** Tras «La importación se realizó con éxito», confirmar con Guardar y verificar guardado real. */
export async function saveAfterSuccessfulImport(
  page: Page,
  config: WorkerConfig['micorreo'],
): Promise<SaveAfterImportResult> {
  const importOutcome = await waitForImportOutcome(page, config);
  if (importOutcome === 'error') {
    const body = await page.locator('body').innerText().catch(() => '');
    return {
      importSuccess: false,
      saveSuccess: false,
      message: body.slice(0, 500) || 'MiCorreo rechazó el CSV.',
    };
  }
  if (importOutcome !== 'success') {
    return {
      importSuccess: false,
      saveSuccess: false,
      message: 'No apareció confirmación de importación exitosa en MiCorreo.',
    };
  }

  console.log('[micorreo] → importación OK, clic en Guardar');

  if (await isMassUploadReadyToPay(page)) {
    return {
      importSuccess: true,
      saveSuccess: true,
      message: 'Envío guardado en MiCorreo.',
    };
  }

  const deadline = Date.now() + Math.min(config.timeoutMs, 40_000);
  while (Date.now() < deadline) {
    if (await isMassUploadReadyToPay(page)) {
      await dismissSuccessModal(page);
      return {
        importSuccess: true,
        saveSuccess: true,
        message: 'Envío guardado en MiCorreo.',
      };
    }

    if (await isGuardarEnvioModalVisible(page)) {
      await confirmGuardarEnvioModal(page, config);
      const ready = await waitForMassUploadReadyToPay(page, 12_000);
      if (ready) {
        await dismissSuccessModal(page);
        return {
          importSuccess: true,
          saveSuccess: true,
          message: 'Envío guardado en MiCorreo.',
        };
      }
    }

    const clicked = await clickMainGuardarButton(page);
    if (clicked) {
      await confirmGuardarEnvioModal(page, config);
      const ready = await waitForMassUploadReadyToPay(page, 12_000);
      if (ready) {
        await dismissSuccessModal(page);
        return {
          importSuccess: true,
          saveSuccess: true,
          message: 'Envío guardado en MiCorreo.',
        };
      }
    }

    await page.waitForTimeout(600);
  }

  const body = await page.locator('body').innerText().catch(() => '');
  console.warn('[micorreo] importación OK pero no se confirmó guardado en MiCorreo');
  return {
    importSuccess: true,
    saveSuccess: false,
    message:
      body.slice(0, 500) ||
      'La importación fue exitosa, pero no se pudo guardar el envío en MiCorreo.',
  };
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
    const url = page.url();
    if (/checkout/i.test(url)) return true;

    const body = await page.locator('body').innerText().catch(() => '');
    if (/realiz[aá].*pago|seleccion[aá].*medio de pago|saldo disponible|tarjeta de cr[eé]dito|mercado pago/i.test(body)) {
      return true;
    }
    await page.waitForTimeout(700);
  }
  return false;
}

async function clickMassUploadPagar(page: Page, config: WorkerConfig['micorreo']): Promise<boolean> {
  const ready = await waitForMassUploadReadyToPay(page, Math.min(config.timeoutMs, 25_000));
  if (!ready) {
    console.warn('[micorreo] #pagar no quedó habilitado tras Guardar');
    return false;
  }

  console.log('[micorreo] → abrir checkout (#pagar / formPago)');
  const triggered = await page.evaluate<boolean>(`(() => {
    const btn = document.querySelector('#pagar');
    if (btn && btn.disabled) return false;
    if (typeof formPago === 'function') {
      formPago();
      return true;
    }
    if (btn instanceof HTMLElement) {
      btn.click();
      return true;
    }
    return false;
  })()`);

  if (!triggered) {
    const pagarBtn = page.locator('#pagar').first();
    if (!(await isPagarButtonEnabled(page))) return false;
    await pagarBtn.scrollIntoViewIfNeeded().catch(() => undefined);
    await pagarBtn.click();
  }

  const navigated = await page
    .waitForURL(/checkout/i, { timeout: Math.min(config.timeoutMs, 35_000) })
    .then(() => true)
    .catch(() => false);

  if (navigated) return true;

  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  return waitForPaymentScreen(page, Math.min(config.timeoutMs, 15_000));
}

async function selectBalancePayment(page: Page): Promise<boolean> {
  const saldoRadio = page.getByRole('radio', { name: /^Saldo$/i }).first();
  if (await saldoRadio.isVisible().catch(() => false)) {
    await saldoRadio.check({ force: true }).catch(async () => {
      await saldoRadio.click({ force: true });
    });
    await page.waitForTimeout(500);
    return true;
  }

  const labelOption = page.getByLabel(/^Saldo$/i).first();
  if (await labelOption.isVisible().catch(() => false)) {
    await labelOption.check({ force: true }).catch(async () => {
      await labelOption.click({ force: true });
    });
    await page.waitForTimeout(500);
    return true;
  }

  const clickedText = await clickFirstVisibleLocator(
    [
      page.locator('label').filter({ hasText: /^Saldo$/i }),
      page.getByText(/^Saldo$/i),
    ],
    3000,
  );
  if (clickedText) return true;

  return page.evaluate<boolean>(`(() => {
    const labels = [...document.querySelectorAll('label')];
    const saldoLabel = labels.find((label) => /^saldo$/i.test((label.textContent || '').trim()));
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
    const saldoRadio = radios.find((radio) => /^saldo$/i.test((radio.value || '').trim()));
    if (saldoRadio) {
      saldoRadio.checked = true;
      saldoRadio.dispatchEvent(new Event('input', { bubbles: true }));
      saldoRadio.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  })()`);
}

async function clickCheckoutConfirmPagar(page: Page, config: WorkerConfig['micorreo']): Promise<boolean> {
  const clicked = await clickFirstVisibleLocator(
    [
      page.locator('button.btn-ne-s:has-text("Pagar")'),
      page.locator('button.btn-correo-primary:has-text("Pagar")'),
      page.locator('form button:has-text("Pagar")'),
      page.getByRole('button', { name: /^Pagar$/i }),
      page.locator('input[type="submit"][value*="Pagar" i]'),
      ...config.selectors.confirmPayment.map((selector) => page.locator(selector)),
    ],
    Math.min(config.timeoutMs, 30_000),
  );
  if (clicked) return true;

  return page.evaluate<boolean>(`(() => {
    const buttons = [...document.querySelectorAll('button, input[type="submit"]')];
    const payBtn = buttons.find((el) => {
      const text = (el.textContent || el.value || '').trim().toLowerCase();
      return text === 'pagar' && !el.disabled;
    });
    if (!payBtn) return false;
    payBtn.click();
    return true;
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

  const clickedPay = await clickMassUploadPagar(page, config);
  if (!clickedPay) {
    const pagarDisabled = await page.locator('#pagar').first().isDisabled().catch(() => true);
    return {
      status: 'payment_error',
      message: pagarDisabled
        ? 'El envío no quedó guardado en MiCorreo (botón Pagar deshabilitado).'
        : 'No se pudo abrir la pantalla de pago en MiCorreo.',
    };
  }

  let onPaymentScreen = await waitForPaymentScreen(page, Math.min(config.timeoutMs, 30_000));
  if (!onPaymentScreen) {
    const body = await page.locator('body').innerText().catch(() => '');
    return {
      status: 'payment_error',
      message: body.slice(0, 500) || 'Se hizo click en Pagar, pero no apareció la pantalla de pago.',
    };
  }

  console.log('[micorreo] → seleccionar medio de pago Saldo');
  const selectedBalance = await selectBalancePayment(page);
  if (!selectedBalance) {
    return {
      status: 'payment_error',
      message: 'No se pudo seleccionar el medio de pago Saldo.',
    };
  }
  await page.waitForTimeout(800);

  console.log('[micorreo] → confirmar pago con Saldo');
  const clickedConfirm = await clickCheckoutConfirmPagar(page, config);
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

  if (
    /pago.*(realiz[oó]|exitoso|confirmado)|abonad|pagad|operaci[oó]n exitosa|gracias por tu compra/i.test(
      afterText,
    )
  ) {
    return { status: 'paid', message: 'Etiqueta pagada con saldo disponible.' };
  }

  return {
    status: 'payment_error',
    message: afterText.slice(0, 500) || 'No se pudo confirmar si el pago con saldo fue exitoso.',
  };
}
