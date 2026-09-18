import { printEnvBanner } from '../config.js';
import { printCliError } from '../errors.js';
import { getAuthToken, maskToken } from '../micorreo/auth.js';

async function main(): Promise<void> {
  printEnvBanner();
  const info = await getAuthToken(true);
  console.log(`OK  token ${maskToken(info.token)}`);
  console.log(`    vence  ${info.expiresAt.toISOString()}  (raw: ${info.expiresRaw || 'n/d'})`);
  console.log(`    duración aparente ${info.ttlMinutes.toFixed(1)} minutos`);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
