import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(p) {
  try {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}
load(path.join(root, '.env.local'));
load(path.join(root, 'services', 'andreani-worker', '.env'));
const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const uid = 'c15d2ab1-61cd-497b-ab18-d8e8f7e47058';
const { data, error } = await sb
  .from('economia_gastos_mensuales')
  .select('months, legacy_fixed_scalar, updated_at')
  .eq('user_id', uid)
  .single();
if (error) throw error;
const keys = Object.keys(data.months || {}).sort();
console.log('updated_at', data.updated_at);
console.log('legacy', data.legacy_fixed_scalar);
console.log('meses', keys.length, keys.join(', '));
for (const k of keys.slice(0, 8).concat(keys.filter((x) => x.startsWith('2025-0') || x.startsWith('2024') || x === '2025-09' || x === '2026-03' || x === '2026-09'))) {
  const b = data.months[k];
  if (!b) continue;
  const sueldos = (b.fixed?.sueldos || []).filter((s) => Number(s.monto) > 0).length;
  console.log(
    k,
    `fuente=${b.fuente || '-'} gr=${b.gastos_reales ?? '-'} fact=${b.ventas_resumen ?? '-'} pub=${b.extras?.publicidad ?? 0} usd=${b.extras?.compra_dolares ?? 0} inv=${b.extras?.inversiones_empresa ?? 0} sueldos=${sueldos}`,
  );
}
