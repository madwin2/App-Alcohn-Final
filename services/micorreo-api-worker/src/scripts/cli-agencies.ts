import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, printEnvBanner } from '../config.js';
import { CODIGOS_PROVINCIA, codigoProvincia, nombreProvincia } from '../domain/provinces.js';
import { printCliError } from '../errors.js';
import { listAgencies } from '../micorreo/agencies.js';
import { resolveCustomerId } from '../micorreo/customer.js';
import type { Agency } from '../types.js';

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + ' '.repeat(width - value.length);
}

function printTable(agencies: Agency[]): void {
  const colCode = 10;
  const colName = 28;
  const colCity = 22;
  const colZip = 12;
  const colPick = 8;
  const colRecv = 8;
  console.log(
    `${pad('Código', colCode)} ${pad('Nombre', colName)} ${pad('Localidad', colCity)} ${pad('CP', colZip)} ${pad('Retiro', colPick)} ${pad('Impos.', colRecv)}`,
  );
  console.log('-'.repeat(colCode + colName + colCity + colZip + colPick + colRecv + 5));
  for (const agency of agencies) {
    const retiro =
      agency.services?.pickupAvailability === true
        ? 'sí'
        : agency.services?.pickupAvailability === false
          ? 'no'
          : '?';
    const impos =
      agency.services?.packageReception === true
        ? 'sí'
        : agency.services?.packageReception === false
          ? 'no'
          : '?';
    console.log(
      `${pad(agency.code ?? '', colCode)} ${pad(agency.name ?? '', colName)} ${pad(agency.location?.address?.locality ?? agency.location?.address?.city ?? '', colCity)} ${pad(agency.location?.address?.postalCode ?? '', colZip)} ${pad(retiro, colPick)} ${pad(impos, colRecv)}`,
    );
  }
}

function summarize(agencies: Agency[]): void {
  const pickup = agencies.filter((a) => a.services?.pickupAvailability === true).length;
  console.log('');
  console.log(`Total: ${agencies.length} sucursales`);
  console.log(`Con retiro (pickupAvailability=true): ${pickup}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  printEnvBanner();
  const { values } = parseArgs({
    options: {
      provincia: { type: 'string' },
      servicio: { type: 'string' },
      todas: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const config = loadConfig();
  const customerId = await resolveCustomerId();
  const servicio =
    values.servicio === 'package_reception' || values.servicio === 'pickup_availability'
      ? values.servicio
      : undefined;

  const dir = path.join(config.artifactsDir, 'agencies');
  await mkdir(dir, { recursive: true });

  if (values.todas) {
    const all: Agency[] = [];
    for (const code of CODIGOS_PROVINCIA) {
      process.stdout.write(`  ${code} ${nombreProvincia(code)} … `);
      const list = await listAgencies({ customerId, provinceCode: code, services: servicio });
      all.push(...list);
      await writeFile(path.join(dir, `${code}.json`), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
      console.log(`${list.length}`);
      await sleep(400);
    }
    await writeFile(path.join(dir, '_all.json'), `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    printTable(all.slice(0, 40));
    if (all.length > 40) console.log(`… (${all.length - 40} más, ver artifacts/agencies/_all.json)`);
    summarize(all);
    return;
  }

  const provincia = values.provincia ? codigoProvincia(String(values.provincia)) : undefined;
  if (!provincia) {
    throw new Error('Pasá --provincia=B o --todas');
  }

  const agencies = await listAgencies({ customerId, provinceCode: provincia, services: servicio });
  await writeFile(path.join(dir, `${provincia}.json`), `${JSON.stringify(agencies, null, 2)}\n`, 'utf8');
  printTable(agencies);
  summarize(agencies);
  console.log(`JSON: artifacts/agencies/${provincia}.json`);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
