import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const want = [
  '360003075514080',
  '360003077561650',
  '360003071823090',
  '360003071742500',
  '360003072876850',
];

function walk(dir: string, out: string[], depth = 0) {
  if (depth > 4) return;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out, depth + 1);
    else if (name.endsWith('.pdf') && st.size > 2000) out.push(p);
  }
}

const files: string[] = [];
walk('/tmp', files);
walk('/opt/andreani-worker/artifacts', files);

const found: Record<string, string[]> = Object.fromEntries(want.map((t) => [t, []]));

for (const file of files) {
  try {
    const bytes = readFileSync(file);
    // pdf-lib no extrae texto; buscar tracking en bytes raw (suele estar en streams)
    const ascii = bytes.toString('latin1');
    for (const t of want) {
      if (ascii.includes(t)) found[t].push(`${file} (${bytes.length})`);
    }
  } catch {
    /* skip */
  }
}

for (const t of want) {
  console.log(t);
  const uniq = [...new Set(found[t])].slice(0, 12);
  if (!uniq.length) console.log('  NONE');
  else uniq.forEach((x) => console.log(' ', x));
}
