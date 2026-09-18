import { parseArgs } from 'node:util';
import { importBlockedMessage, importEnabled, loadConfig, printEnvBanner } from '../config.js';
import { buildImportPayload, DELIVERY_TYPES } from '../domain/build-import.js';
import { printCliError } from '../errors.js';
import { resolveCustomerId } from '../micorreo/customer.js';
import { formatValidity, quoteRates } from '../micorreo/rates.js';
import { importShipping } from '../micorreo/shipping.js';
import { registrarImport } from '../registry.js';
import type { DeliveryType } from '../types.js';

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
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
      tipo: { type: 'string', default: 'D' },
      nombre: { type: 'string' },
      email: { type: 'string' },
      tel: { type: 'string' },
      cel: { type: 'string' },
      calle: { type: 'string' },
      altura: { type: 'string' },
      ciudad: { type: 'string' },
      provincia: { type: 'string' },
      cp: { type: 'string' },
      piso: { type: 'string' },
      depto: { type: 'string' },
      sucursal: { type: 'string' },
      'con-direccion': { type: 'boolean', default: false },
      peso: { type: 'string' },
      'peso-kg': { type: 'string' },
      alto: { type: 'string' },
      ancho: { type: 'string' },
      largo: { type: 'string' },
      valor: { type: 'string' },
      confirmar: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const config = loadConfig();
  const tipo = String(values.tipo ?? 'D').toUpperCase() as DeliveryType;
  if (!DELIVERY_TYPES.includes(tipo)) {
    throw new Error(`--tipo inválido (${tipo}). Usá D o S.`);
  }

  const nombre = String(values.nombre ?? '').trim();
  const email = String(values.email ?? '').trim();
  if (!nombre) throw new Error('Falta --nombre');
  if (!email) throw new Error('Falta --email');
  if (tipo === 'S' && !String(values.sucursal ?? '').trim()) {
    throw new Error('Con --tipo=S hace falta --sucursal=<code>');
  }

  const customerId = await resolveCustomerId();
  const destinoCp = String(values.cp ?? '').trim() || config.originPostalCode;
  const weightKg = num(values['peso-kg'] as string | undefined);
  const weightG =
    num(values.peso as string | undefined) ??
    (weightKg !== undefined ? Math.round(weightKg * 1000) : undefined);

  const payload = buildImportPayload({
    customerId,
    deliveryType: tipo,
    recipientName: nombre,
    recipientEmail: email,
    phone: values.tel as string | undefined,
    cellPhone: values.cel as string | undefined,
    street: values.calle as string | undefined,
    streetNumber: values.altura as string | undefined,
    city: values.ciudad as string | undefined,
    province: values.provincia as string | undefined,
    postalCode: values.cp as string | undefined,
    floor: values.piso as string | undefined,
    apartment: values.depto as string | undefined,
    agency: values.sucursal as string | undefined,
    addressNullForSucursal: tipo === 'S' && !values['con-direccion'],
    weightG,
    heightCm: num(values.alto as string | undefined),
    widthCm: num(values.ancho as string | undefined),
    lengthCm: num(values.largo as string | undefined),
    declaredValue: num(values.valor as string | undefined),
  });

  const origen = config.originPostalCode;
  if (origen && destinoCp) {
    try {
      const quoted = await quoteRates({
        customerId,
        postalCodeOrigin: origen,
        postalCodeDestination: destinoCp,
        deliveredType: tipo,
        weightG: payload.shipping.weight,
        heightCm: payload.shipping.height,
        widthCm: payload.shipping.width,
        lengthCm: payload.shipping.length,
      });
      console.log('Cotización previa:');
      for (const rate of quoted.rates) {
        console.log(
          `  ${rate.deliveredType}  ${rate.productType ?? ''}  ${rate.productName ?? ''}  ${formatPrice(rate.price)}`,
        );
      }
      if (quoted.validTo) {
        console.log(`  validTo ${quoted.validTo}${formatValidity(quoted.validToParsed)}`);
      }
      console.log('');
    } catch (error) {
      console.error('No se pudo cotizar antes de importar:');
      printCliError(error);
      console.log('');
    }
  } else {
    console.log('Sin CP de origen/destino: se saltea la cotización previa.\n');
  }

  console.log(`extOrderId generado: ${payload.extOrderId}`);
  console.log('Payload que se enviaría a POST /shipping/import:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  const guard = importEnabled(Boolean(values.confirmar));
  if (!guard.allowed) {
    console.log(importBlockedMessage(guard.reason));
    process.exit(0);
  }

  console.log('⚠️  Este import NO se puede deshacer por API. Hay que darlo de baja a mano en el portal.');
  const created = await importShipping(payload);
  await registrarImport({
    extOrderId: payload.extOrderId,
    orderNumber: payload.orderNumber,
    createdAt: created.createdAt,
    deliveryType: tipo,
    agency: payload.shipping.agency,
    destinatario: nombre,
    env: config.envLabel,
  });

  console.log('════════════════════════════════════════');
  console.log(`  importado  ${payload.extOrderId}`);
  console.log(`  createdAt  ${created.createdAt}`);
  console.log('════════════════════════════════════════');
  console.log('Para darlo de baja hay que entrar al portal de MiCorreo.');
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
