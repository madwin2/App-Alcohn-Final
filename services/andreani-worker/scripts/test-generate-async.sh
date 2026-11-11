#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
KEY=$(grep -E '^WORKER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "'\" \r")
echo "[test] POST /generate count=2 (expect 202)..."
curl -sS -m 30 -w "\nHTTP:%{http_code}\n" -X POST "http://127.0.0.1:8788/generate" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{"count":2}'
echo "esperando 100s..."
sleep 100
echo "---HEALTH---"
curl -sS http://127.0.0.1:8788/health
echo
echo "---LOG---"
tail -n 25 /root/.pm2/logs/andreani-worker-out-80.log
