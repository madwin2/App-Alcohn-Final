#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
KEY=$(grep -E '^WORKER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "'\" \r")
COUNT="${1:-3}"
echo "[test] POST /generate count=${COUNT} ..."
curl -sS -m 600 -X POST "http://127.0.0.1:8788/generate" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"count\":${COUNT}}"
echo
echo "---LOG---"
tail -n 40 /root/.pm2/logs/andreani-worker-out-80.log
echo "---HEALTH---"
curl -sS http://127.0.0.1:8788/health
echo
