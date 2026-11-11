#!/usr/bin/env bash
set -euo pipefail
cd /opt/micorreo-worker

# Asegurar proxy oficina en .env
python3 - <<'PY'
from pathlib import Path
p = Path('.env')
lines = p.read_text().splitlines()
out = []
seen = False
for line in lines:
    if line.startswith('MICORREO_PROXY_SERVER='):
        out.append('MICORREO_PROXY_SERVER=socks5://127.0.0.1:11080')
        seen = True
    else:
        out.append(line)
if not seen:
    out.append('MICORREO_PROXY_SERVER=socks5://127.0.0.1:11080')
p.write_text('\n'.join(out) + '\n')
print('MICORREO_PROXY_SERVER=socks5://127.0.0.1:11080')
PY

npm run build
pm2 restart micorreo-worker --update-env
sleep 2
curl -sS http://127.0.0.1:8787/health
echo

echo "=== probe login (xvfb) ==="
export MICORREO_HEADLESS=false
# Heredar .env vía dotenv del script; forzar proxy
xvfb-run -a -s "-screen 0 1400x900x24 -ac" npx tsx src/scripts/probe-login.ts
