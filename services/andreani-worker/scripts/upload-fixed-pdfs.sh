#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
# Args: local fixed dir synced via scp to /tmp/andreani-fixed
node --input-type=module <<'EOF'
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

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
const dir = process.env.FIXED_DIR || '/tmp/andreani-fixed';
const files = readdirSync(dir).filter((f) => f.endsWith('.pdf'));
console.log('uploading', files.length, 'from', dir);
for (const f of files) {
  const bytes = readFileSync(path.join(dir, f));
  const { error } = await sb.storage.from('etiquetas-andreani').upload(f, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) console.log('FAIL', f, error.message);
  else console.log('OK', f, bytes.length);
}
EOF
