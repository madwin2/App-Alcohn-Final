#!/bin/bash
set -euo pipefail
for i in $(seq 1 24); do
  H=$(curl -sS http://127.0.0.1:8788/health)
  echo "$H"
  PHASE=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('job',{}).get('phase',''))" <<<"$H")
  DETAIL=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('job',{}).get('detail',''))" <<<"$H")
  echo "PHASE=$PHASE DETAIL=$DETAIL"
  if [ "$PHASE" = "idle" ]; then
    echo DONE
    tail -n 40 /root/.pm2/logs/andreani-worker-out-80.log
    exit 0
  fi
  sleep 20
done
echo TIMEOUT
tail -n 40 /root/.pm2/logs/andreani-worker-out-80.log
exit 1
