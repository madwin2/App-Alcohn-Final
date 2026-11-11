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
  CORREO_API_BASE_URL: z
    .string()
    .url('CORREO_API_BASE_URL debe ser una URL válida')
    .default('https://api.correoargentino.com.ar/paqar'),
  CORREO_API_KEY: z.string().min(1, 'CORREO_API_KEY es obligatoria'),
  CORREO_AGREEMENT: z.string().min(1, 'CORREO_AGREEMENT es obligatorio'),
  CORREO_ALLOW_WRITES: z.string().optional().default('false'),
  CORREO_SERVICE_TYPE: z.string().min(1).max(2).default('CP'),
  CORREO_LABEL_FORMAT: z.string().optional().default('10x15'),
  CORREO_SENDER_NAME: optionalString,
  CORREO_SENDER_STREET: optionalString,
  CORREO_SENDER_NUMBER: optionalString,
  CORREO_SENDER_FLOOR: optionalString,
  CORREO_SENDER_DEPARTMENT: optionalString,
  CORREO_SENDER_CITY: optionalString,
  CORREO_SENDER_STATE: optionalString,
  CORREO_SENDER_ZIP: optionalString,
  CORREO_SENDER_PHONE_AREA: optionalString,
  CORREO_SENDER_PHONE: optionalString,
  CORREO_SENDER_EMAIL: optionalString,
  CORREO_TEST_WEIGHT_G: z.coerce.number().int().positive().max(99999).default(100),
  CORREO_TEST_HEIGHT_CM: z.coerce.number().int().positive().max(999).default(5),
  CORREO_TEST_WIDTH_CM: z.coerce.number().int().positive().max(999).default(10),
  CORREO_TEST_DEPTH_CM: z.coerce.number().int().positive().max(999).default(15),
  CORREO_TEST_DECLARED_VALUE: z.coerce.number().int().positive().default(1000),
  CORREO_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type SenderConfig = {
  businessName: string;
  streetName: string;
  streetNumber: string;
  floor: string;
  department: string;
  cityName: string;
  state: string;
  zipCode: string;
  areaCodePhone: string;
  phoneNumber: string;
  areaCodeCellphone: string;
  cellphoneNumber: string;
  email: string;
};

export type TestParcelConfig = {
  weightG: number;
  heightCm: number;
  widthCm: number;
  depthCm: number;
  declaredValue: number;
};

export type CorreoConfig = {
  apiBaseUrl: string;
  apiKey: string;
  agreement: string;
  allowWrites: boolean;
  serviceType: string;
  labelFormat: string;
  sender: SenderConfig;
  testParcel: TestParcelConfig;
  timeoutMs: number;
  artifactsDir: string;
};

let cached: CorreoConfig | null = null;

function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const field = issue.path.join('.') || 'env';
    return `  - ${field}: ${issue.message}`;
  });
  return [
    'Faltan o están mal las variables de entorno de Correo Argentino:',
    ...lines,
    '',
    'Copiá services/correo-worker/.env.example a .env y completá CORREO_API_KEY y CORREO_AGREEMENT.',
  ].join('\n');
}

export function loadConfig(): CorreoConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  const env = parsed.data;
  cached = {
    apiBaseUrl: env.CORREO_API_BASE_URL.replace(/\/+$/, ''),
    apiKey: env.CORREO_API_KEY.trim(),
    agreement: env.CORREO_AGREEMENT.trim(),
    allowWrites: env.CORREO_ALLOW_WRITES === 'true',
    serviceType: env.CORREO_SERVICE_TYPE.trim().toUpperCase(),
    labelFormat: env.CORREO_LABEL_FORMAT.trim(),
    sender: {
      businessName: env.CORREO_SENDER_NAME.trim(),
      streetName: env.CORREO_SENDER_STREET.trim(),
      streetNumber: env.CORREO_SENDER_NUMBER.trim(),
      floor: env.CORREO_SENDER_FLOOR.trim(),
      department: env.CORREO_SENDER_DEPARTMENT.trim(),
      cityName: env.CORREO_SENDER_CITY.trim(),
      state: env.CORREO_SENDER_STATE.trim().toUpperCase(),
      zipCode: env.CORREO_SENDER_ZIP.trim(),
      areaCodePhone: env.CORREO_SENDER_PHONE_AREA.trim(),
      phoneNumber: env.CORREO_SENDER_PHONE.trim(),
      areaCodeCellphone: env.CORREO_SENDER_PHONE_AREA.trim(),
      cellphoneNumber: env.CORREO_SENDER_PHONE.trim(),
      email: env.CORREO_SENDER_EMAIL.trim(),
    },
    testParcel: {
      weightG: env.CORREO_TEST_WEIGHT_G,
      heightCm: env.CORREO_TEST_HEIGHT_CM,
      widthCm: env.CORREO_TEST_WIDTH_CM,
      depthCm: env.CORREO_TEST_DEPTH_CM,
      declaredValue: env.CORREO_TEST_DECLARED_VALUE,
    },
    timeoutMs: env.CORREO_TIMEOUT_MS,
    artifactsDir: path.join(workerRoot, 'artifacts'),
  };

  return cached;
}

export function envFileExists(): boolean {
  return existsSync(path.join(workerRoot, '.env'));
}

/**
 * Doble candado de escritura: hace falta CORREO_ALLOW_WRITES=true Y --confirmar.
 * Si falta cualquiera, no se llama a la API.
 */
export function writesEnabled(confirmar: boolean): { allowed: true } | { allowed: false; reason: string } {
  const config = loadConfig();
  if (!config.allowWrites && !confirmar) {
    return { allowed: false, reason: 'falta --confirmar o CORREO_ALLOW_WRITES=true' };
  }
  if (!config.allowWrites) {
    return { allowed: false, reason: 'CORREO_ALLOW_WRITES no es true' };
  }
  if (!confirmar) {
    return { allowed: false, reason: 'falta --confirmar' };
  }
  return { allowed: true };
}

export function writesBlockedMessage(reason: string): string {
  return `⚠️ NO SE ENVIÓ NADA (falta --confirmar o CORREO_ALLOW_WRITES=true)\n   Motivo: ${reason}`;
}
