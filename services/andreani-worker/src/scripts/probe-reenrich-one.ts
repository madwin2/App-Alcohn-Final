import { readFileSync, writeFileSync } from 'node:fs';
import { enrichZebraLabelPdf } from '../pdf/enrich-zebra.js';

const tracking = process.argv[2] || '360003071742500';
const inputPath = process.argv[3] || `../../_enrich_verify/simple_fix/${tracking}.pdf`;
const outPath = process.argv[4] || `../../_enrich_verify/simple_fix/${tracking}.fixed.pdf`;
const input = new Uint8Array(readFileSync(inputPath));
const out = await enrichZebraLabelPdf(
  input,
  tracking,
  {
    id: '3444b701-a474-4f00-0000-000000000000',
    designNames: ['DS Telar'],
    caption: '',
    imageUrls: [],
  },
  undefined,
);
writeFileSync(outPath, out);
console.log('OK', outPath, out.length);
