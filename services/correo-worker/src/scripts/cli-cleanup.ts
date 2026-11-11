import { parseArgs } from 'node:util';
import { loadConfig, writesBlockedMessage, writesEnabled } from '../config.js';
import { cancelOrder } from '../correo/orders.js';
import { printCliError } from '../errors.js';
import { listarPendientes, marcarCancelado } from '../registry.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      confirmar: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  loadConfig();
  const pendientes = await listarPendientes();

  if (pendientes.length === 0) {
    console.log('No hay envíos pendientes en artifacts/registry.json');
    return;
  }

  console.log(`Pendientes (${pendientes.length}):`);
  for (const entry of pendientes) {
    console.log(`  - ${entry.trackingNumber}  ${entry.destinatario}  ${entry.deliveryType}  ${entry.createdAt}`);
  }
  console.log('');

  const guard = writesEnabled(Boolean(values.confirmar));
  if (!guard.allowed) {
    console.log(writesBlockedMessage(guard.reason));
    console.log('Para cancelarlos: npm run cleanup -- --confirmar  (y CORREO_ALLOW_WRITES=true)');
    process.exit(0);
  }

  let failed = 0;
  for (const entry of pendientes) {
    try {
      const result = await cancelOrder(entry.trackingNumber);
      await marcarCancelado(entry.trackingNumber);
      console.log(`${entry.trackingNumber}  OK  ${result.mensaje}`);
    } catch (error) {
      failed += 1;
      console.error(`${entry.trackingNumber}  ERROR`);
      printCliError(error);
    }
  }

  if (failed > 0) {
    console.error(`Fallaron ${failed} de ${pendientes.length}`);
    process.exit(1);
  }

  console.log('Registry sin pendientes.');
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
