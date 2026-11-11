import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { listAgencies } from '../correo/agencies.js';
import { codigoDesdeIsoOLetra, isoStateId } from '../domain/provinces.js';
import { CorreoApiError, printCliError } from '../errors.js';
import type { CorreoAgency } from '../types.js';

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`Valor booleano inválido: ${value} (usá true o false)`);
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + ' '.repeat(width - value.length);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provincia: { type: 'string' },
      retiro: { type: 'string' },
      imposicion: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const config = loadConfig();
  const stateId = values.provincia ? isoStateId(String(values.provincia)) : undefined;
  const pickup = parseBool(values.retiro as string | undefined);
  const reception = parseBool(values.imposicion as string | undefined);

  let usedStateId = stateId;
  let agencies: CorreoAgency[] = [];
  try {
    agencies = await listAgencies({
      stateId,
      pickupAvailability: pickup,
      packageReception: reception,
    });
  } catch (error) {
    if (stateId && error instanceof CorreoApiError && error.status === 400) {
      const letter = codigoDesdeIsoOLetra(String(values.provincia));
      usedStateId = letter;
      console.error(`stateId=${stateId} fue rechazado; reintento con ${letter}`);
      agencies = await listAgencies({
        stateId: letter,
        pickupAvailability: pickup,
        packageReception: reception,
      });
    } else {
      throw error;
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(config.artifactsDir, 'agencies');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `agencies-${stamp}.json`);
  await writeFile(file, `${JSON.stringify(agencies, null, 2)}\n`, 'utf8');
  await writeFile(path.join(dir, 'latest.json'), `${JSON.stringify(agencies, null, 2)}\n`, 'utf8');

  const colId = 8;
  const colName = 28;
  const colCity = 24;
  const colZip = 12;
  const colPickup = 8;

  console.log(
    `${pad('ID', colId)} ${pad('Nombre', colName)} ${pad('Localidad', colCity)} ${pad('CP', colZip)} ${pad('Retiro', colPickup)}`,
  );
  console.log('-'.repeat(colId + colName + colCity + colZip + colPickup + 4));

  for (const agency of agencies) {
    const id = agency.agency_id ?? '';
    const name = agency.agency_name ?? '';
    const city = agency.location?.city_name ?? '';
    const zip = agency.location?.zip_code ?? '';
    const retiro = agency.pickup_availability === true ? 'sí' : agency.pickup_availability === false ? 'no' : '?';
    console.log(
      `${pad(id, colId)} ${pad(name, colName)} ${pad(city, colCity)} ${pad(zip, colZip)} ${pad(retiro, colPickup)}`,
    );
  }

  const withPickup = agencies.filter((a) => a.pickup_availability === true).length;
  console.log('');
  console.log(`Total: ${agencies.length} sucursales`);
  console.log(`Con retiro (pickup_availability=true): ${withPickup}`);
  if (usedStateId) console.log(`Filtro stateId: ${usedStateId}`);
  console.log(`JSON guardado en ${file}`);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
