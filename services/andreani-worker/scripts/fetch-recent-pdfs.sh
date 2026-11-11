#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
TRACKINGS="${*:-360003075514080 360003071823090 360003071742500 360003074993550 360003077908650}"
export TRACKINGS
node --input-type=module <<'EOF'
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);
const sb = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);
mkdirSync('/tmp/andreani-verify', { recursive: true });
const trackings = (process.env.TRACKINGS || '').trim().split(/\s+/).filter(Boolean);
for (const t of trackings) {
  const { data, error } = await sb.storage.from('etiquetas-andreani').download(`${t}.pdf`);
  if (error) {
    console.log('FAIL', t, error.message);
    continue;
  }
  writeFileSync(`/tmp/andreani-verify/${t}.pdf`, Buffer.from(await data.arrayBuffer()));
  console.log('ok', t);
}
EOF
