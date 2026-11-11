#!/bin/bash
set -euo pipefail
sleep 2
curl -sS http://127.0.0.1:8788/health; echo
KEY=$(grep -E '^WORKER_API_KEY=' /opt/andreani-worker/.env | head -1 | cut -d= -f2- | tr -d "'\" \r")
curl -sS -m 15 -w "\nHTTP:%{http_code}\n" -X POST "http://127.0.0.1:8788/sync-labels" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
echo
sleep 8
tail -n 12 /root/.pm2/logs/andreani-worker-out-80.log
