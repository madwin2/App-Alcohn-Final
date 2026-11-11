import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);
const sb = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
);
const ts = [
  '360003075514080',
  '360003077561650',
  '360003071823090',
  '360003071742500',
  '360003072876850',
];
const merged = await PDFDocument.create();
for (const t of ts) {
  let bytes: Buffer;
  const local = `/tmp/andreani-refresh/${t}.pdf`;
  if (existsSync(local)) {
    bytes = readFileSync(local);
    console.log('local', t, bytes.length);
  } else {
    const { data, error } = await sb.storage.from('etiquetas-andreani').download(`${t}.pdf`);
    if (error || !data) {
      console.log('miss', t, error?.message);
      continue;
    }
    bytes = Buffer.from(await data.arrayBuffer());
    console.log('storage', t, bytes.length);
  }
  const d = await PDFDocument.load(bytes);
  const [p] = await merged.copyPages(d, [0]);
  merged.addPage(p);
}
const out = await merged.save();
writeFileSync('/tmp/andreani-refresh/merged-clean.pdf', out);
console.log('merged', out.length);
