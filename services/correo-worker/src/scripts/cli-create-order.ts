import { parseArgs } from 'node:util';
import { loadConfig, writesBlockedMessage, writesEnabled } from '../config.js';
import { createOrder } from '../correo/orders.js';
import { buildOrderPayload, DELIVERY_TYPES, type OrderInput } from '../domain/build-order.js';
import type { DeliveryType } from '../types.js';
import { printCliError } from '../errors.js';
import { registrarAlta } from '../registry.js';

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${value}`);
  return n;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tipo: { type: 'string', default: 'homeDelivery' },
      nombre: { type: 'string' },
      calle: { type: 'string' },
      altura: { type: 'string' },
      localidad: { type: 'string' },
      provincia: { type: 'string' },
      cp: { type: 'string' },
      piso: { type: 'string' },
      depto: { type: 'string' },
      email: { type: 'string' },
      tel: { type: 'string' },
      cel: { type: 'string' },
      'area-tel': { type: 'string' },
      'area-cel': { type: 'string' },
      obs: { type: 'string' },
      sucursal: { type: 'string' },
      peso: { type: 'string' },
      'peso-kg': { type: 'string' },
      alto: { type: 'string' },
      ancho: { type: 'string' },
      largo: { type: 'string' },
      valor: { type: 'string' },
      categoria: { type: 'string' },
      confirmar: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  loadConfig();

  const tipo = String(values.tipo ?? 'homeDelivery') as DeliveryType;
  if (!DELIVERY_TYPES.includes(tipo)) {
    throw new Error(`--tipo inválido (${tipo}). Usá: ${DELIVERY_TYPES.join(' | ')}`);
  }

  const nombre = String(values.nombre ?? '').trim();
  if (!nombre) {
    throw new Error('Falta --nombre (destinatario).');
  }

  if (tipo !== 'homeDelivery' && !String(values.sucursal ?? '').trim()) {
    throw new Error(`Con --tipo=${tipo} hace falta --sucursal=<agency_id>.`);
  }

  const input: OrderInput = {
    deliveryType: tipo,
    agencyId: values.sucursal as string | undefined,
    recipientName: nombre,
    street: values.calle as string | undefined,
    streetNumber: values.altura as string | undefined,
    city: values.localidad as string | undefined,
    state: values.provincia as string | undefined,
    zip: values.cp as string | undefined,
    floor: values.piso as string | undefined,
    department: values.depto as string | undefined,
    email: values.email as string | undefined,
    phone: values.tel as string | undefined,
    phoneArea: values['area-tel'] as string | undefined,
    cellphone: values.cel as string | undefined,
    cellphoneArea: values['area-cel'] as string | undefined,
    observation: values.obs as string | undefined,
    weightG: num(values.peso as string | undefined),
    weightKg: num(values['peso-kg'] as string | undefined),
    heightCm: num(values.alto as string | undefined),
    widthCm: num(values.ancho as string | undefined),
    depthCm: num(values.largo as string | undefined),
    declaredValue: num(values.valor as string | undefined),
    productCategory: values.categoria as string | undefined,
  };

  const payload = buildOrderPayload(input);

  console.log('Payload que se enviaría a POST /v1/orders:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  const guard = writesEnabled(Boolean(values.confirmar));
  if (!guard.allowed) {
    console.log(writesBlockedMessage(guard.reason));
    process.exit(0);
  }

  const created = await createOrder(payload);
  await registrarAlta({
    trackingNumber: created.trackingNumber,
    deliveryType: tipo,
    destinatario: nombre,
  });

  console.log('════════════════════════════════════════');
  console.log(`  TN  ${created.trackingNumber}`);
  console.log('════════════════════════════════════════');
  console.log(`Guardado en artifacts/registry.json`);
  console.log(`Para cancelarlo: npm run order:cancel -- --tn=${created.trackingNumber} --confirmar`);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
