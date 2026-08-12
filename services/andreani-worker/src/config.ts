import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workerRoot = path.resolve(__dirname, '..');

loadEnv({ path: path.join(workerRoot, '.env') });

export function loadConfig() {
  const artifactsDir = path.resolve(
    workerRoot,
    process.env.ANDREANI_ARTIFACTS_DIR?.trim() || './artifacts',
  );
  const storageStatePath = path.resolve(
    workerRoot,
    process.env.ANDREANI_STORAGE_STATE_PATH?.trim() || './data/storage-state.json',
  );

  return {
    port: Number(process.env.PORT || 8788),
    apiKey: process.env.WORKER_API_KEY?.trim() || '',
    supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
    andreani: {
      user: stripQuotes(process.env.ANDREANI_USER),
      password: stripQuotes(process.env.ANDREANI_PASS),
      homeUrl: process.env.ANDREANI_HOME_URL?.trim() || 'https://pymes.andreani.com/',
      loginUrl: process.env.ANDREANI_LOGIN_URL?.trim() || 'https://pymes.andreani.com/',
      sucursalDespacho:
        stripQuotes(process.env.ANDREANI_SUCURSAL_DESPACHO) || 'Alberti 1254, Mar Del Plata',
      sucursalNombre:
        stripQuotes(process.env.ANDREANI_SUCURSAL_NOMBRE) || 'Kiosko wow',
      paquete: {
        alto: Number(process.env.ANDREANI_PAQUETE_ALTO || 25),
        ancho: Number(process.env.ANDREANI_PAQUETE_ANCHO || 8),
        largo: Number(process.env.ANDREANI_PAQUETE_LARGO || 8),
        peso: Number(process.env.ANDREANI_PAQUETE_PESO || 1000),
        valorDeclarado: Number(process.env.ANDREANI_VALOR_DECLARADO || 40_000),
        codigoDescuento: process.env.ANDREANI_CODIGO_DESCUENTO?.trim() || 'ANDREANI20',
      },
      headless: (process.env.ANDREANI_HEADLESS ?? 'true').toLowerCase() !== 'false',
      timeoutMs: Number(process.env.ANDREANI_TIMEOUT_MS || 60_000),
      slowMoMs: Number(process.env.ANDREANI_SLOW_MO_MS || 0),
      /**
       * Obligatorio en Hetzner (EU): Andreani bloquea IPs de datacenter.
       * Playwright sale por proxy residencial AR. Ej: http://host:port
       */
      proxyServer: stripQuotes(process.env.ANDREANI_PROXY_SERVER),
      proxyUsername: stripQuotes(process.env.ANDREANI_PROXY_USERNAME),
      proxyPassword: stripQuotes(process.env.ANDREANI_PROXY_PASSWORD),
    },
    artifactsDir,
    storageStatePath,
  };
}

function stripQuotes(value: string | undefined): string {
  const v = (value ?? '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

export type WorkerConfig = ReturnType<typeof loadConfig>;

export function assertRuntimeConfig(
  config: WorkerConfig,
  options: { requireSupabase?: boolean } = {},
): void {
  const requireSupabase = options.requireSupabase !== false;
  if (!config.apiKey) {
    throw new Error('WORKER_API_KEY no configurada');
  }
  if (!config.andreani.user || !config.andreani.password) {
    throw new Error('ANDREANI_USER y ANDREANI_PASS son obligatorias');
  }
  if (requireSupabase && (!config.supabaseUrl || !config.supabaseServiceRoleKey)) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias');
  }
}

export function envFileExists(): boolean {
  return existsSync(path.join(workerRoot, '.env'));
}
