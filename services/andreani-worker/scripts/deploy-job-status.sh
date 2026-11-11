#!/bin/bash
set -euo pipefail
cd /opt/andreani-worker
for f in job-status.ts job-queue.ts index.ts generate-service.ts sync-labels-service.ts; do
  case "$f" in
    job-status.ts|job-queue.ts) cp "/tmp/$f" "src/$f" ;;
    *) cp "/tmp/$f" "src/$f" 2>/dev/null || cp "/tmp/$f" "src/$(basename $f)" ;;
  esac
done
# paths explícitos
cp /tmp/job-status.ts src/job-status.ts
cp /tmp/job-queue.ts src/job-queue.ts
cp /tmp/index.ts src/index.ts
cp /tmp/generate-service.ts src/generate-service.ts
cp /tmp/sync-labels-service.ts src/sync-labels-service.ts
npm run build
pm2 restart andreani-worker
sleep 3
curl -sS http://127.0.0.1:8788/health; echo
KEY=$(grep -E '^WORKER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "'\" \r")
curl -sS -m 10 -H "Authorization: Bearer ${KEY}" http://127.0.0.1:8788/jobs; echo
