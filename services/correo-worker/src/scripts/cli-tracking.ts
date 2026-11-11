import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { getTracking } from '../correo/tracking.js';
import { printCliError } from '../errors.js';

function formatDate(value: Date | null, fallback: string | null): string {
  if (value) {
    return value.toISOString().replace('T', ' ').slice(0, 19);
  }
  return fallback ?? '';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tn: { type: 'string', multiple: true },
      extClient: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  loadConfig();
  const trackingNumbers = (values.tn ?? [])
    .filter((tn): tn is string => typeof tn === 'string')
    .map((tn) => tn.trim())
    .filter(Boolean);
  if (trackingNumbers.length === 0) {
    throw new Error('Pasá al menos un --tn=XXXX');
  }

  const result = await getTracking(trackingNumbers, values.extClient as string | undefined);
  console.log(`Variante HTTP que funcionó: ${result.variant}`);
  if (result.attempts.length > 1) {
    console.log(
      `Intentos: ${result.attempts.map((a) => `${a.variant}=${a.status}`).join(', ')}`,
    );
  }
  console.log('');

  for (const item of result.items) {
    console.log(`TN ${item.trackingNumber}`);
    if (item.empty) {
      console.log('  sin movimientos todavía');
      console.log('');
      continue;
    }
    console.log(`  ${item.quantity} evento(s)`);
    for (const event of item.events) {
      const when = formatDate(event.dateParsed, event.date);
      const status = event.status ?? event.statusId ?? '?';
      const where = event.facility ?? event.facilityId ?? '';
      const sign = event.sign ? `  firma=${event.sign}` : '';
      console.log(`  - ${when}  [${event.statusId ?? ''}] ${status}  ${where}${sign}`);
    }
    console.log('');
  }
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
