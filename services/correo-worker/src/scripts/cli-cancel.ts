import { parseArgs } from 'node:util';
import { loadConfig, writesBlockedMessage, writesEnabled } from '../config.js';
import { cancelOrder } from '../correo/orders.js';
import { printCliError } from '../errors.js';
import { marcarCancelado } from '../registry.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tn: { type: 'string' },
      confirmar: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  loadConfig();
  const tn = String(values.tn ?? '').trim();
  if (!tn) {
    throw new Error('Falta --tn=XXXX');
  }

  console.log(`Se cancelaría PATCH /v1/orders/${encodeURIComponent(tn)}/cancel`);

  const guard = writesEnabled(Boolean(values.confirmar));
  if (!guard.allowed) {
    console.log(writesBlockedMessage(guard.reason));
    process.exit(0);
  }

  const result = await cancelOrder(tn);
  await marcarCancelado(tn);

  console.log(`OK  ${result.mensaje}`);
  if (result.codigo !== null) console.log(`codigo=${result.codigo}`);
  console.log('Marcado como cancelado en artifacts/registry.json');
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
