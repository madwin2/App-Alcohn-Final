import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { getLabels } from '../correo/labels.js';
import { printCliError } from '../errors.js';
import type { LabelFormat } from '../types.js';

function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 4).toString('ascii') === '%PDF';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tn: { type: 'string', multiple: true },
      formato: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const config = loadConfig();
  const trackingNumbers = (values.tn ?? [])
    .filter((tn): tn is string => typeof tn === 'string')
    .map((tn) => tn.trim())
    .filter(Boolean);
  if (trackingNumbers.length === 0) {
    throw new Error('Pasá al menos un --tn=XXXX');
  }

  const formato = (values.formato as LabelFormat | undefined) ?? (config.labelFormat as LabelFormat);
  const results = await getLabels(trackingNumbers, formato);
  const dir = path.join(config.artifactsDir, 'labels');
  await mkdir(dir, { recursive: true });

  let failed = 0;
  for (const item of results) {
    if (!item.ok) {
      failed += 1;
      console.log(`${item.trackingNumber}  ERROR  ${item.result || 'sin detalle'}`);
      continue;
    }

    const b64 = item.fileBase64.replace(/\s+/g, '');
    if (!b64) {
      failed += 1;
      console.log(`${item.trackingNumber}  ERROR  result=OK pero fileBase64 vacío`);
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(b64, 'base64');
    } catch {
      failed += 1;
      console.log(`${item.trackingNumber}  ERROR  base64 inválido`);
      continue;
    }

    if (!isPdf(bytes)) {
      failed += 1;
      console.log(
        `${item.trackingNumber}  ERROR  el archivo no empieza con %PDF (base64 mal decodificado, no se guardó)`,
      );
      continue;
    }

    const filename = item.fileName?.endsWith('.pdf') ? item.fileName : `${item.trackingNumber}.pdf`;
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    const file = path.join(dir, safeName.includes(item.trackingNumber) ? safeName : `${item.trackingNumber}.pdf`);
    await writeFile(file, bytes);
    console.log(`${item.trackingNumber}  OK  ${file}  (${bytes.length} bytes)`);
  }

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  printCliError(error);
  process.exit(1);
});
