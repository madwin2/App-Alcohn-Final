import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workerRoot = path.resolve(__dirname, '..');

loadEnv({ path: path.join(workerRoot, '.env') });

const optionalString = z.string().optional().default('');

const envSchema = z.object({
  MICORREO_API_BASE_URL: z
    .string()
    .url('MICORREO_API_BASE_URL debe ser una URL válida')
    .default('https://apitest.correoargentino.com.ar/micorreo/v1'),
  MICORREO_ENV_LABEL: z.string().min(1).default('QA'),
  MICORREO_API_USER: z.string().min(1, 'MICORREO_API_USER es obligatorio'),
  MICORREO_API_PASSWORD: z.string().min(1, 'MICORREO_API_PASSWORD es obligatorio'),
  MICORREO_ACCOUNT_EMAIL: optionalString,
  MICORREO_ACCOUNT_PASSWORD: optionalString,
  MICORREO_CUSTOMER_ID: optionalString,
  MICORREO_ALLOW_IMPORT: z.string().optional().default('false'),
  MICORREO_ORIGIN_POSTAL_CODE: optionalString,
  MICORREO_TEST_WEIGHT_G: z.coerce.number().int().positive().max(25_000).default(100),
  MICORREO_TEST_HEIGHT_CM: z.coerce.number().int().min(0).max(255).default(5),
  MICORREO_TEST_WIDTH_CM: z.coerce.number().int().min(0).max(255).default(10),
  MICORREO_TEST_LENGTH_CM: z.coerce.number().int().min(0).max(255).default(15),
  MICORREO_TEST_DECLARED_VALUE: z.coerce.number().positive().default(1000),
  MICORREO_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type TestParcelConfig = {
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  declaredValue: number;
};

export type MiCorreoConfig = {
  apiBaseUrl: string;
  envLabel: string;
  apiUser: string;
  apiPassword: string;
  accountEmail: string;
  accountPassword: string;
  customerId: string;
  allowImport: boolean;
  originPostalCode: string;
  testParcel: TestParcelConfig;
  timeoutMs: number;
  artifactsDir: string;
};

let cached: MiCorreoConfig | null = null;

function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const field = issue.path.join('.') || 'env';
    return `  - ${field}: ${issue.message}`;
  });
  return [
    'Faltan o están mal las variables de entorno de API MiCorreo:',
    ...lines,
    '',
    'Copiá services/micorreo-api-worker/.env.example a .env y completá MICORREO_API_USER y MICORREO_API_PASSWORD.',
  ].join('\n');
}

export function loadConfig(): MiCorreoConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  const env = parsed.data;
  cached = {
    apiBaseUrl: env.MICORREO_API_BASE_URL.replace(/\/+$/, ''),
    envLabel: env.MICORREO_ENV_LABEL.trim(),
    apiUser: env.MICORREO_API_USER.trim(),
    apiPassword: env.MICORREO_API_PASSWORD,
    accountEmail: env.MICORREO_ACCOUNT_EMAIL.trim(),
    accountPassword: env.MICORREO_ACCOUNT_PASSWORD,
    customerId: env.MICORREO_CUSTOMER_ID.trim(),
    allowImport: env.MICORREO_ALLOW_IMPORT === 'true',
    originPostalCode: env.MICORREO_ORIGIN_POSTAL_CODE.trim(),
    testParcel: {
      weightG: env.MICORREO_TEST_WEIGHT_G,
      heightCm: env.MICORREO_TEST_HEIGHT_CM,
      widthCm: env.MICORREO_TEST_WIDTH_CM,
      lengthCm: env.MICORREO_TEST_LENGTH_CM,
      declaredValue: env.MICORREO_TEST_DECLARED_VALUE,
    },
    timeoutMs: env.MICORREO_TIMEOUT_MS,
    artifactsDir: path.join(workerRoot, 'artifacts'),
  };

  return cached;
}

export function envFileExists(): boolean {
  return existsSync(path.join(workerRoot, '.env'));
}

export function printEnvBanner(): void {
  const config = loadConfig();
  const host = new URL(config.apiBaseUrl).host;
  console.log(`[${config.envLabel}] ${host}`);
}

export function importEnabled(confirmar: boolean): { allowed: true } | { allowed: false; reason: string } {
  const config = loadConfig();
  if (!config.allowImport && !confirmar) {
    return { allowed: false, reason: 'falta --confirmar o MICORREO_ALLOW_IMPORT=true' };
  }
  if (!config.allowImport) {
    return { allowed: false, reason: 'MICORREO_ALLOW_IMPORT no es true' };
  }
  if (!confirmar) {
    return { allowed: false, reason: 'falta --confirmar' };
  }
  return { allowed: true };
}

export function importBlockedMessage(reason: string): string {
  return `⚠️ NO SE IMPORTÓ NADA (falta --confirmar o MICORREO_ALLOW_IMPORT=true)\n   Motivo: ${reason}`;
}
