#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
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

// Map page N -> tracking from env MAP like "1:3600...,2:3600..."
const map = Object.fromEntries(
  (process.env.PAGE_MAP || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [a, b] = s.split(':');
      return [a, b];
    }),
);
const dir = process.env.FIXED_DIR || '/tmp/andreani-user-fixed';
console.log('map', map, 'dir', dir);
for (const [page, tracking] of Object.entries(map)) {
  const file = path.join(dir, `page-${page}.pdf`);
  const bytes = readFileSync(file);
  const name = `${tracking}.pdf`;
  const { error } = await sb.storage.from('etiquetas-andreani').upload(name, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) console.log('FAIL', name, error.message);
  else console.log('OK', name, bytes.length);
}
EOF
