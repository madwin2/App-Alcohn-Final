#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
KEY=$(grep -E '^WORKER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "'\" \r")
curl -sS -m 15 -x socks5h://127.0.0.1:11080 -o /dev/null -w 'socks:%{http_code}\n' https://pymes.andreani.com/ || echo socks_fail
echo "POST sync-labels..."
curl -sS -m 30 -X POST "http://127.0.0.1:8788/sync-labels" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
echo
sleep 2
curl -sS -H "Authorization: Bearer ${KEY}" "http://127.0.0.1:8788/jobs"
echo
