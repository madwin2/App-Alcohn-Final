import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shutdownWorker, runUploadJob } from '../upload-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, '../..');

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const fileArgIndex = args.findIndex((arg) => arg === '--file' || arg === '-f');
  const positionalPath = args.find((arg) => !arg.startsWith('-') && arg.endsWith('.csv'));
  const filePath =
    fileArgIndex >= 0
      ? args[fileArgIndex + 1]
      : positionalPath || path.join(workerRoot, 'fixtures', 'sample-sucursal.csv');

  if (!filePath) {
    console.error('Uso: npm run upload:test -- --file ruta/al/archivo.csv [--pay] [--order-id UUID]');
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), filePath);
  const csvContent = await readFile(absolutePath, 'utf8');
  const orderId = args.includes('--order-id')
    ? args[args.indexOf('--order-id') + 1]
    : undefined;
  const payAfterUpload = args.includes('--pay') || args.includes('--pagar');

  console.log(`[cli] Subiendo ${absolutePath} ...`);
  if (process.env.MICORREO_HEADLESS !== 'false') {
    console.log('[cli] Tip: usá npm run upload:watch para ver el navegador en tiempo real');
  } else {
    console.log('[cli] Navegador visible (MICORREO_HEADLESS=false)');
  }
  if (payAfterUpload) {
    console.log('[cli] Flujo completo: importar → Guardar → Pagar con saldo');
  }

  const result = await runUploadJob({
    csvContent,
    filename: path.basename(absolutePath),
    orderId,
    payAfterUpload,
  });

  console.log(JSON.stringify(result, null, 2));
  await shutdownWorker();
  process.exit(result.status === 'ok' ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await shutdownWorker();
  process.exit(1);
});
