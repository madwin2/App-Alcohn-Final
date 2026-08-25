/**
 * Prueba local: regenera etiquetas 100×152 con el layout nuevo.
 * Uso: npx tsx src/scripts/probe-enrich-scale.ts ../../etiquetas_8_6_2026.pdf
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { enrichZebraLabelPdf } from '../pdf/enrich-zebra.js';

const input = process.argv[2];
if (!input) {
  console.error('Pasá un PDF de entrada');
  process.exit(1);
}

const abs = path.resolve(input);
const bytes = await readFile(abs);
const out = await enrichZebraLabelPdf(new Uint8Array(bytes), 'TESTTRACK', {
  id: '5805960b-1359-42aa-bbbb-cccccccccccc',
  designNames: ['Todo fibrofacil R'],
  caption: 'Todo fibrofacil R',
  imageUrls: [],
});
const outPath = abs.replace(/\.pdf$/i, '.enriched-probe.pdf');
await writeFile(outPath, out);
console.log('OK →', outPath);
