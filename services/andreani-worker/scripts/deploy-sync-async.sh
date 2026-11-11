#!/bin/bash
set -euo pipefail
cp /tmp/index.ts /opt/andreani-worker/src/index.ts
cp /tmp/sync-labels-service.ts /opt/andreani-worker/src/sync-labels-service.ts
cd /opt/andreani-worker
npm run build
pm2 restart andreani-worker
sleep 2
KEY=$(grep -E '^WORKER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "'\" \r")
echo "=== sync-labels expect 202 ==="
curl -sS -m 15 -w "\nHTTP:%{http_code}\n" -X POST "http://127.0.0.1:8788/sync-labels" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
echo
curl -sS http://127.0.0.1:8788/health
echo
