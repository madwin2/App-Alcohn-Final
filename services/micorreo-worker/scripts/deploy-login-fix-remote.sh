#!/usr/bin/env bash
set -euo pipefail

cd /opt/micorreo-worker

cp -a .env /tmp/micorreo-worker.env.bak
tar -xzf /opt/micorreo-worker-login-fix.tgz -C /opt/micorreo-worker
cp -a /tmp/micorreo-worker.env.bak .env

python3 <<'PY'
from pathlib import Path
p = Path('/opt/micorreo-worker/.env')
lines = p.read_text(encoding='utf-8').splitlines()
out, found = [], False
for line in lines:
    if line.startswith('MICORREO_HEADLESS='):
        out.append('MICORREO_HEADLESS=false')
        found = True
    else:
        out.append(line)
if not found:
    out.append('MICORREO_HEADLESS=false')
p.write_text('\n'.join(out) + '\n', encoding='utf-8')
print('MICORREO_HEADLESS=false')
PY

chmod +x start-micorreo.sh

echo '--- verifying sources ---'
grep -n 'RecaptchaRejected\|disable-blink-features\|pressSequentially\|MICORREO_HEADLESS' \
  src/micorreo/login-micorreo.ts \
  src/micorreo/upload-csv.ts \
  src/micorreo/browser-helpers.ts \
  start-micorreo.sh \
  ecosystem.config.cjs | head -40

echo '--- npm install / build ---'
npm install --omit=dev
npm install --no-save typescript @types/node
npm run build
npm prune --omit=dev

echo '--- restart with xvfb wrapper ---'
pm2 delete micorreo-worker || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 2
curl -sS http://127.0.0.1:8787/health
echo
pm2 show micorreo-worker | sed -n '1,30p'
