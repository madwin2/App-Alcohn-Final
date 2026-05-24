import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workerRoot = path.resolve(__dirname, '..');

loadEnv({ path: path.join(workerRoot, '.env') });

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSelectorList(value: string | undefined, fallback: string): string[] {
  return parseList(value, fallback.split(',').map((s) => s.trim()));
}

export function loadConfig() {
  const artifactsDir = path.resolve(
    workerRoot,
    process.env.MICORREO_ARTIFACTS_DIR?.trim() || './artifacts',
  );

  return {
    port: Number(process.env.PORT || 8787),
    apiKey: process.env.WORKER_API_KEY?.trim() || '',
    micorreo: {
      user: process.env.MICORREO_USER?.trim() || '',
      password: process.env.MICORREO_PASSWORD?.trim() || '',
      loginUrl: process.env.MICORREO_LOGIN_URL?.trim() || 'https://www.correoargentino.com.ar/MiCorreo/public/',
      uploadUrl:
        process.env.MICORREO_UPLOAD_URL?.trim() ||
        'https://www.correoargentino.com.ar/MiCorreo/public/enviosMasivos',
      headless: (process.env.MICORREO_HEADLESS ?? 'true').toLowerCase() !== 'false',
      timeoutMs: Number(process.env.MICORREO_TIMEOUT_MS || 60_000),
      slowMoMs: Number(process.env.MICORREO_SLOW_MO_MS || 0),
      selectors: {
        user: parseSelectorList(
          process.env.MICORREO_SELECTOR_USER,
          'input[type="email"], input[name*="mail" i], #email, #username',
        ),
        password: parseSelectorList(process.env.MICORREO_SELECTOR_PASSWORD, 'input[type="password"]'),
        loginButton: parseSelectorList(
          process.env.MICORREO_SELECTOR_LOGIN_BUTTON,
          'button:has-text("Ingresar"), input[type="submit"]',
        ),
        fileInput: parseSelectorList(process.env.MICORREO_SELECTOR_FILE_INPUT, 'input[type="file"]'),
        submitUpload: parseSelectorList(
          process.env.MICORREO_SELECTOR_SUBMIT_UPLOAD,
          'button:has-text("Cargar"), button:has-text("Importar"), button:has-text("Procesar"), button:has-text("Subir"), button:has-text("Enviar")',
        ),
      },
      navLinks: parseList(process.env.MICORREO_NAV_LINKS, [
        'Envío masivo',
        'Masivo',
        'Nuevo Envío',
        'Envío de paquete',
      ]),
    },
    artifactsDir,
  };
}

export type WorkerConfig = ReturnType<typeof loadConfig>;

export function assertRuntimeConfig(config: WorkerConfig): void {
  if (!config.apiKey) {
    throw new Error('WORKER_API_KEY no configurada');
  }
  if (!config.micorreo.user || !config.micorreo.password) {
    throw new Error('MICORREO_USER y MICORREO_PASSWORD son obligatorias para subir CSV');
  }
}

export function envFileExists(): boolean {
  return existsSync(path.join(workerRoot, '.env'));
}
