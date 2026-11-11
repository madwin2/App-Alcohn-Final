import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { rebuildCleanLabelPdf } from '../pdf/rebuild-clean.js';
import { loadConfig } from '../config.js';

function loadEnv() {
  const raw = readFileSync(path.resolve('.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}

const env = loadEnv();
const sb = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
);
const config = loadConfig();
console.log('logoPath', config.logoPath, 'exists', existsSync(config.logoPath));

const tracking = process.argv[2] || '360003075514080';
const { data, error } = await sb.storage.from('etiquetas-andreani').download(`${tracking}.pdf`);
console.log('download', error?.message || 'ok', 'blob', !!data);
if (!data) process.exit(1);
const input = new Uint8Array(await data.arrayBuffer());
console.log('bytes', input.length);

const browser = await chromium.launch({ headless: true });
try {
  const r = await rebuildCleanLabelPdf(input, tracking, undefined, {
    browser,
    logoPath: existsSync(config.logoPath) ? config.logoPath : undefined,
  });
  console.log('metrics', r.metrics, 'out', r.bytes.length);
  writeFileSync(`/tmp/${tracking}.clean.pdf`, Buffer.from(r.bytes));
} catch (e) {
  console.error('ERR', e);
  process.exit(1);
} finally {
  await browser.close();
}
