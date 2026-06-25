import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import {
  readPortalFeedback,
  saveArtifacts,
} from './browser-helpers.js';
import { loginMicorreo } from './login-micorreo.js';
import {
  navigateToMassUpload,
  waitForCsvFileInput,
  confirmCsvUpload,
  saveAfterSuccessfulImport,
  payWithAvailableBalance,
  type PayWithBalanceResult,
} from './navigate-mass-upload.js';

export type UploadCsvInput = {
  csvContent: string;
  filename: string;
  orderId?: string;
  payAfterUpload?: boolean;
};

export type UploadCsvOutput = {
  portalText: string;
  artifactDir?: string;
  rowCount: number;
  payment?: PayWithBalanceResult;
};

let browserSingleton: Browser | null = null;

async function getBrowser(config: WorkerConfig['micorreo']): Promise<Browser> {
  if (browserSingleton?.isConnected()) return browserSingleton;
  browserSingleton = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMoMs,
  });
  return browserSingleton;
}

export async function closeBrowser(): Promise<void> {
  if (browserSingleton) {
    await browserSingleton.close().catch(() => undefined);
    browserSingleton = null;
  }
}

async function login(page: Page, config: WorkerConfig['micorreo']): Promise<void> {
  await loginMicorreo(page, config);
}

async function uploadFileOnPage(
  page: Page,
  config: WorkerConfig['micorreo'],
  csvPath: string,
  payAfterUpload: boolean,
): Promise<string> {
  console.log('[micorreo] → enviosMasivos');
  await navigateToMassUpload(page, config);

  console.log('[micorreo] → buscando paso Carga de datos (CSV)');
  const fileSelector = await waitForCsvFileInput(page, config);

  console.log(`[micorreo] → subiendo archivo (${path.basename(csvPath)})`);
  await page.locator(fileSelector).first().setInputFiles(csvPath);
  await page.waitForTimeout(1500);

  await confirmCsvUpload(page, config);

  await saveAfterSuccessfulImport(page, config);

  if (payAfterUpload) {
    console.log('[micorreo] → pagando con saldo disponible');
    const payment = await payWithAvailableBalance(page, config);
    const feedback = await readPortalFeedback(page, config.timeoutMs);
    console.log(`[micorreo] ← pago: ${payment.status} ${payment.message.slice(0, 120)}…`);
    return `${feedback}\n\n[PAGO] ${payment.status}: ${payment.message}`;
  }

  await page.waitForTimeout(1000);
  const feedback = await readPortalFeedback(page, config.timeoutMs);
  console.log(`[micorreo] ← respuesta portal: ${feedback.slice(0, 120)}…`);
  return feedback;
}

export async function uploadCsvToMicorreo(
  workerConfig: WorkerConfig,
  input: UploadCsvInput,
): Promise<UploadCsvOutput> {
  const { micorreo: config, artifactsDir } = workerConfig;
  await mkdir(artifactsDir, { recursive: true });

  const tmpDir = path.join(artifactsDir, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const safeName = input.filename.replace(/[^\w.\-]+/g, '_') || 'carga.csv';
  const csvPath = path.join(tmpDir, safeName);
  await writeFile(csvPath, input.csvContent, 'utf8');

  const browser = await getBrowser(config);
  const context: BrowserContext = await browser.newContext({
    acceptDownloads: true,
    locale: 'es-AR',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);

  try {
    await login(page, config);
    const portalText = await uploadFileOnPage(page, config, csvPath, input.payAfterUpload === true);
    const paymentLine = portalText.match(/\[PAGO\]\s*(paid|payment_error|not_attempted):\s*([\s\S]*)$/i);
    return {
      portalText,
      rowCount: input.csvContent.split(/\r?\n/).filter((l) => l.trim()).length - 1,
      payment: paymentLine
        ? {
            status: paymentLine[1] as PayWithBalanceResult['status'],
            message: paymentLine[2]?.trim() || '',
          } as PayWithBalanceResult
        : undefined,
    };
  } catch (error) {
    const artifactDir = await saveArtifacts(page, artifactsDir, input.orderId || 'upload_error');
    const message = error instanceof Error ? error.message : String(error);
    const err = new Error(message) as Error & { artifactDir?: string };
    err.artifactDir = artifactDir;
    throw err;
  } finally {
    await context.close().catch(() => undefined);
  }
}
