#!/usr/bin/env bash
set -euo pipefail

cd /opt/micorreo-worker

cp -a .env /tmp/micorreo-worker.env.bak
tar -xzf /opt/micorreo-worker.tgz -C /opt/micorreo-worker
cp -a /tmp/micorreo-worker.env.bak .env

python3 - <<'PY'
from pathlib import Path
p = Path('/opt/micorreo-worker/.env')
text = p.read_text(encoding='utf-8')
lines = text.splitlines()
key = 'MICORREO_LOGIN_URL'
val = 'https://micorreo.correoargentino.com.ar/landing'
found = False
out = []
for line in lines:
    if line.startswith(key + '='):
        out.append(f'{key}={val}')
        found = True
    else:
        out.append(line)
if not found:
    out.append(f'{key}={val}')
p.write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'{key}={val}')
PY

echo '--- verifying patched sources ---'
grep -n 'MICORREO_LANDING\|auth/redirect\|input\[name="email"\]\|formLogin' \
  src/micorreo/login-micorreo.ts \
  src/micorreo/navigate-mass-upload.ts \
  src/config.ts | head -50

echo '--- npm install / build ---'
npm install --omit=dev
# tsc needed for build; prune afterwards
npm install --no-save typescript @types/node
npm run build
npm prune --omit=dev

echo '--- restart micorreo-worker only ---'
pm2 restart micorreo-worker --update-env
sleep 2
curl -sS http://127.0.0.1:8787/health
echo
pm2 list
