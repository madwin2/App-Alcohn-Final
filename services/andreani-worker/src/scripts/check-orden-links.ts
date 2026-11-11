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
const ts = [
  '360003075514080',
  '360003077561650',
  '360003071823090',
  '360003071742500',
  '360003072876850',
];
const { data, error } = await sb
  .from('envios_andreani_etiquetas')
  .select('tracking, orden_id, estado, ordenes(id, sellos(diseno))')
  .in('tracking', ts);
for (const row of data ?? []) {
  const orden = Array.isArray(row.ordenes) ? row.ordenes[0] : row.ordenes;
  const designs = (orden?.sellos ?? []).map((s: { diseno: string | null }) => s.diseno).filter(Boolean);
  console.log(row.tracking, 'orden=', row.orden_id?.slice(0, 14), 'diseños=', designs.join(' | '));
}
if (error) console.error(error);
