import { parseArgs } from 'node:util';
import { loadConfig, printEnvBanner } from '../config.js';
import { printCliError } from '../errors.js';
import { resolveCustomerId } from '../micorreo/customer.js';
import { formatValidity, quoteRates } from '../micorreo/rates.js';
import type { DeliveryType } from '../types.js';

function num(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${value}`);
  return n;
}

function formatPrice(value: number | null): string {
  if (value === null) return 'n/d';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
}

async function main(): Promise<void> {
  printEnvBanner();
  const { values } = parseArgs({
    options: {
      'cp-destino': { type: 'string' },
      'cp-origen': { type: 'string' },
      tipo: { type: 'string' },
      peso: { type: 'string' },
      'peso-kg': { type: 'string' },
      alto: { type: 'string' },
      ancho: { type: 'string' },
      largo: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const config = loadConfig();
  const destino = String(values['cp-destino'] ?? '').trim();
  if (!destino) throw new Error('Falta --cp-destino');

  const origen = String(values['cp-origen'] ?? config.originPostalCode).trim();
  if (!origen) throw new Error('Falta --cp-origen o MICORREO_ORIGIN_POSTAL_CODE');

  const tipoRaw = values.tipo ? String(values.tipo).toUpperCase() : '';
  const tipo = tipoRaw === 'D' || tipoRaw === 'S' ? (tipoRaw as DeliveryType) : undefined;

  const weightKg = num(values['peso-kg'] as string | undefined);
  const weightG =
    num(values.peso as string | undefined) ??
    (weightKg !== undefined ? Math.round(weightKg * 1000) : config.testParcel.weightG);

  const customerId = await resolveCustomerId();
  const quoted = await quoteRates({
    customerId,
    postalCodeOrigin: origen,
    postalCodeDestination: destino,
    deliveredType: tipo,
    weightG,
    heightCm: num(values.alto as string | undefined, config.testParcel.heightCm) ?? config.testParcel.heightCm,
    widthCm: num(values.ancho as string | undefined, config.testParcel.widthCm) ?? config.testParcel.widthCm,
    lengthCm: num(values.largo as string | undefined, config.testParcel.lengthCm) ?? config.testParcel.lengthCm,
  });

  console.log(`Origen ${origen} → destino ${destino}  (${weightG} g)`);
  if (quoted.validTo) {
    console.log(`Cotización validTo ${quoted.validTo}${formatValidity(quoted.validToParsed)}`);
  }
  console.log('');
  if (quoted.rates.length === 0) {
    console.log('Sin tarifas para estos datos.');
    return;
  }
  for (const rate of quoted.rates) {
    const tipoLabel = rate.deliveredType === 'D' ? 'Domicilio' : rate.deliveredType === 'S' ? 'Sucursal' : rate.deliveredType;
    const eta =
      rate.deliveryTimeMin || rate.deliveryTimeMax
        ? `  ${rate.deliveryTimeMin ?? '?'}–${rate.deliveryTimeMax ?? '?'} días`
        : '';
    console.log(
      `  ${tipoLabel}  ${rate.productType ?? ''}  ${rate.productName ?? ''}  ${formatPrice(rate.price)}${eta}`,
    );
  }
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
