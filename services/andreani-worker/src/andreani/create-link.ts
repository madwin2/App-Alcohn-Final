import type { Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import { clickFirstMatch, saveArtifacts } from '../browser-helpers.js';

const LINK_RE = /https:\/\/pymes\.andreani\.com\/completa-tu-envio\/[A-Za-z0-9._\-]+/i;
const PYMES_HOST_RE = /pymes\.andreani\.com/i;

/** Evita el link del footer (`andreanionline.com` → corporativo). El CTA real es un button. */
async function clickHacerUnEnvio(page: Page, timeoutMs: number): Promise<void> {
  // Esperar home autenticado (el footer tiene el mismo texto y no sirve)
  await page
    .getByText(/todo listo para empezar/i)
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });

  const hero = page.getByRole('button', { name: /^hacer un env[ií]o$/i }).first();
  if (await hero.isVisible({ timeout: Math.min(timeoutMs, 8000) }).catch(() => false)) {
    await hero.click();
    return;
  }

  // Fallback: botón cerca del hero, nunca <a> externos
  const nearHero = page
    .locator('button')
    .filter({ hasText: /^hacer un env[ií]o$/i })
    .first();
  if (await nearHero.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nearHero.click();
    return;
  }

  throw new Error('No se encontró el botón "Hacer un envío" del portal Pymes (¿sesión?)');
}

async function assertStillOnPymes(page: Page): Promise<void> {
  const url = page.url();
  if (!PYMES_HOST_RE.test(url)) {
    throw new Error(
      `Se salió de pymes.andreani.com (ahora: ${url}). No usar links del footer (andreanionline/corporativo).`,
    );
  }
}

/** Modal opcional "Evitá demoras… / Entendido" (no siempre aparece). */
async function dismissOptionalModals(page: Page): Promise<void> {
  const entendido = page
    .getByRole('button', { name: /^entendido$/i })
    .or(page.locator('button:has-text("Entendido")'))
    .first();
  if (await entendido.isVisible({ timeout: 2000 }).catch(() => false)) {
    await entendido.click();
    console.log('[andreani] modal "Entendido" cerrado');
    await page.waitForTimeout(400);
  }
}

async function extractLinkFromPage(page: Page): Promise<string | null> {
  // Input / textarea con el link
  const inputs = page.locator('input, textarea');
  const count = await inputs.count();
  for (let i = 0; i < count; i += 1) {
    const val = await inputs.nth(i).inputValue().catch(() => '');
    const m = val.match(LINK_RE);
    if (m) return m[0];
  }

  // Texto en body / anchors
  const href = await page
    .locator('a[href*="completa-tu-envio"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (href && LINK_RE.test(href)) return href.match(LINK_RE)![0];

  const body = await page.locator('body').innerText().catch(() => '');
  const m = body.match(LINK_RE);
  return m ? m[0] : null;
}

async function fillLabeledNumber(
  page: Page,
  labelRe: RegExp,
  value: number,
): Promise<void> {
  const byLabel = page.getByLabel(labelRe);
  if (await byLabel.first().isVisible({ timeout: 2500 }).catch(() => false)) {
    await byLabel.first().click({ clickCount: 3 }).catch(() => undefined);
    await byLabel.first().fill(String(value));
    return;
  }

  // Fallback: label text → sibling/parent input
  const label = page.getByText(labelRe).first();
  if (await label.isVisible().catch(() => false)) {
    const container = label.locator('xpath=ancestor::*[.//input][1]');
    const input = container.locator('input').first();
    if (await input.isVisible().catch(() => false)) {
      await input.click({ clickCount: 3 }).catch(() => undefined);
      await input.fill(String(value));
      return;
    }
  }
  throw new Error(`No se encontró campo para ${labelRe}`);
}

/**
 * Flujo: Home → Hacer un envío → Andreani envíos → sucursal → formulario → Finalizar → URL.
 * Ver fixtures/FLOW.md y capturas.
 */
export async function createOnePaymentLink(
  page: Page,
  config: WorkerConfig,
): Promise<string> {
  const { timeoutMs, sucursalDespacho, sucursalNombre, paquete, homeUrl } = config.andreani;

  try {
    // Si venimos de "Hacer otro envío" podemos estar mid-flow; si no, ir al home
    const bodyNow = await page.locator('body').innerText().catch(() => '');
    const midFlow = /qu[eé] vas a enviar|desde d[oó]nde|complet[aá] la informaci[oó]n|compart[ií] tu link/i.test(
      bodyNow,
    );
    if (!midFlow) {
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
      await assertStillOnPymes(page);
      await clickHacerUnEnvio(page, timeoutMs);
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
      await assertStillOnPymes(page);
    }

    // Si estamos en pantalla de éxito previa, ir a otro envío
    if (/compart[ií] tu link de env[ií]o/i.test(bodyNow)) {
      const otro = page.getByText(/hacer otro env[ií]o/i).first();
      if (await otro.isVisible().catch(() => false)) {
        await otro.click();
        await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
      }
    }

    // ¿Qué vas a enviar? → Andreani envíos
    const andreaniCard = page.getByText(/Andreani env[ií]os/i).first();
    if (await andreaniCard.isVisible({ timeout: 8000 }).catch(() => false)) {
      await andreaniCard.click();
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
    }

    await selectOrigenSucursal(page, {
      timeoutMs,
      searchText: sucursalDespacho,
      cardName: sucursalNombre,
    });

    // Puede aparecer modal "Evitá demoras…" al entrar al formulario
    await dismissOptionalModals(page);

    // Formulario de medidas
    const formTitle = page.getByText(/complet[aá] la informaci[oó]n de tu env[ií]o/i);
    await Promise.race([
      formTitle.waitFor({ state: 'visible', timeout: timeoutMs }),
      page.getByText(/evit[aá] demoras/i).waitFor({ state: 'visible', timeout: timeoutMs }),
    ]);
    await dismissOptionalModals(page);
    await formTitle.waitFor({ state: 'visible', timeout: timeoutMs });

    for (const [re, val] of [
      [/alto/i, paquete.alto],
      [/ancho/i, paquete.ancho],
      [/largo/i, paquete.largo],
      [/peso/i, paquete.peso],
      [/valor declarado/i, paquete.valorDeclarado],
    ] as const) {
      try {
        await fillLabeledNumber(page, re, val);
      } catch (err) {
        console.warn(`[andreani] campo ${re}:`, err instanceof Error ? err.message : err);
      }
    }

    if (paquete.codigoDescuento) {
      const discount = page.getByLabel(/c[oó]digo de descuento/i);
      if (await discount.first().isVisible().catch(() => false)) {
        await discount.first().fill(paquete.codigoDescuento);
      } else {
        const near = page.getByText(/c[oó]digo de descuento/i).locator('xpath=ancestor::*[.//input][1]').locator('input').first();
        if (await near.isVisible().catch(() => false)) {
          await near.fill(paquete.codigoDescuento);
        }
      }
    }

    await dismissOptionalModals(page);
    await clickFirstMatch(
      page,
      ['button:has-text("Finalizar")'],
      timeoutMs,
    );
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(2000);

    // Esperar pantalla del link
    await page
      .getByText(/compart[ií] tu link de env[ií]o/i)
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .catch(() => undefined);

    let link = await extractLinkFromPage(page);
    if (!link) {
      // Intentar vía clipboard del botón Copiar
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
      const copiar = page.getByRole('button', { name: /copiar/i }).first();
      if (await copiar.isVisible().catch(() => false)) {
        await copiar.click();
        await page.waitForTimeout(500);
        const clip = await page
          .evaluate(() => (navigator as unknown as { clipboard?: { readText: () => Promise<string> } }).clipboard?.readText() ?? '')
          .catch(() => '');
        const m = clip.match(LINK_RE);
        if (m) link = m[0];
      }
    }

    if (!link) {
      const dir = await saveArtifacts(page, config.artifactsDir, 'link-not-found');
      throw new Error(`No se pudo extraer el link de pago. Artifacts: ${dir}`);
    }

    return link;
  } catch (error) {
    await saveArtifacts(page, config.artifactsDir, 'create-link-error').catch(() => undefined);
    throw error;
  }
}

async function selectOrigenSucursal(
  page: Page,
  opts: { timeoutMs: number; searchText: string; cardName: string },
): Promise<void> {
  const { timeoutMs, searchText, cardName } = opts;
  const origenTitle = page.getByText(/desde d[oó]nde vas a hacer tus env[ií]os/i);
  if (!(await origenTitle.isVisible({ timeout: 10_000 }).catch(() => false))) {
    return;
  }

  const nameRe = new RegExp(cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  console.log(`[andreani] origen: buscando "${searchText}" → card "${cardName}"`);

  // Si la card ya está en lista (sesión previa), no hace falta rebuscar
  let nameHit = page.getByText(nameRe).first();
  if (!(await nameHit.isVisible({ timeout: 2500 }).catch(() => false))) {
    const searchBox = page
      .locator('input[type="search"], input[placeholder*="direcci" i], input[placeholder*="sucursal" i]')
      .or(page.getByPlaceholder(/direcci|sucursal|buscar/i))
      .first();
    const box = (await searchBox.isVisible({ timeout: 3000 }).catch(() => false))
      ? searchBox
      : page.locator('input:not([type="hidden"])').first();

    await box.click({ clickCount: 3 }).catch(() => undefined);
    await box.fill('');
    await box.fill(searchText);

    const searchBtn = box
      .locator('xpath=following::button[1]')
      .or(page.locator('button[aria-label*="buscar" i]').first());
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await box.press('Enter');
    }

    nameHit = page.getByText(nameRe).first();
    await nameHit.waitFor({ state: 'visible', timeout: timeoutMs });
  }

  // Click en la card (contenedor clickeable), no solo el texto
  const card = nameHit.locator(
    'xpath=ancestor::*[self::li or self::button or self::article or contains(@class,"MuiPaper") or contains(@class,"card") or contains(@class,"Card")][1]',
  );
  if (await card.isVisible().catch(() => false)) {
    await card.click({ force: true });
  } else {
    await nameHit.click({ force: true });
  }
  console.log(`[andreani] origen: card "${cardName}" clickeada`);
  await page.waitForTimeout(600);

  const siguiente = page
    .getByRole('button', { name: /siguiente/i })
    .or(page.locator('button:has-text("Siguiente")'))
    .first();
  await siguiente.waitFor({ state: 'visible', timeout: 10_000 });

  // Esperar a que deje de estar disabled (selección aplicada)
  for (let i = 0; i < 10; i += 1) {
    const disabled = await siguiente.isDisabled().catch(() => false);
    if (!disabled) break;
    if (i === 3 || i === 6) {
      // Re-click card si Siguiente no habilita
      if (await card.isVisible().catch(() => false)) await card.click({ force: true });
      else await nameHit.click({ force: true });
    }
    await page.waitForTimeout(400);
  }

  if (await siguiente.isDisabled().catch(() => false)) {
    throw new Error(
      `Sucursal no seleccionada (Siguiente deshabilitado). Card buscada: "${cardName}".`,
    );
  }

  await siguiente.click();
  console.log('[andreani] origen: Siguiente');
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForTimeout(1000);

  // Debe haber salido de paso=origen
  if (/paso=origen/i.test(page.url())) {
    throw new Error('Tras Siguiente seguimos en paso=origen — la selección no aplicó');
  }
}

/** Tras generar un link, vuelve al flujo para el siguiente. */
export async function goToAnotherShipment(page: Page, timeoutMs: number): Promise<void> {
  const otro = page.getByText(/hacer otro env[ií]o/i).first();
  if (await otro.isVisible({ timeout: 5000 }).catch(() => false)) {
    await otro.click();
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}
