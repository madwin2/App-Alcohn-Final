import { parseArgs } from 'node:util';
import { printCliError } from '../errors.js';
import { checkAuth } from '../correo/auth.js';
import { loadConfig } from '../config.js';

async function main(): Promise<void> {
  parseArgs({ allowPositionals: true, strict: false });
  loadConfig();

  const result = await checkAuth();
  console.log(`OK  credenciales válidas (HTTP ${result.status})`);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
