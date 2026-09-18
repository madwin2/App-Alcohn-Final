import { loadConfig, printEnvBanner } from '../config.js';
import { printCliError } from '../errors.js';
import { validateCustomer } from '../micorreo/customer.js';

async function main(): Promise<void> {
  printEnvBanner();
  const config = loadConfig();
  if (config.customerId) {
    console.log(`customerId ya está en .env: ${config.customerId}`);
    console.log('(borralo de MICORREO_CUSTOMER_ID si querés volver a resolverlo)');
  }
  const result = await validateCustomer();
  console.log(`OK  customerId ${result.customerId}`);
  if (result.createdAt) console.log(`    createdAt ${result.createdAt}`);
  console.log(`Guardalo en MICORREO_CUSTOMER_ID=${result.customerId} para no repetir /users/validate.`);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
