/**
 * Lista trackings con PDF en Storage.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const raw = readFileSync('.env', 'utf8');
const env = Object.fromEntries(
  raw
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
const { data, error } = await sb
  .from('envios_andreani_etiquetas')
  .select('tracking')
  .not('pdf_path', 'is', null);
if (error) throw error;
const list = (data || []).map((r) => r.tracking).filter(Boolean);
console.log(list.join(' '));
console.error(`count=${list.length}`);
