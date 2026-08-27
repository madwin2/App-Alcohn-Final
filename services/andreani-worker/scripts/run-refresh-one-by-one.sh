#!/bin/bash
cd /opt/andreani-worker || exit 1
export ANDREANI_HEADLESS=true

# Ya OK en corrida anterior (página 1): no repetir
# Restantes:
TRACKS=(
  360003075514080
  360003074078400
  360003071742500
  360003075748280
  360003075381690
  360003077150050
  360003077504390
  360003077499130
  360003077561650
  360003071823090
  360003074327900
  360003074993550
  360003072876850
  360003073103070
  360003072758600
  360003072157470
  360003071659130
  360003071322780
  360003071941350
  360003074346750
)

ok=0
fail=0
for t in "${TRACKS[@]}"; do
  echo "===== ONE $t ====="
  if npx tsx src/scripts/refresh-trackings.ts "$t"; then
    ok=$((ok + 1))
    echo "RESULT $t OK"
  else
    fail=$((fail + 1))
    echo "RESULT $t FAIL"
  fi
  sleep 2
done
echo "DONE_ALL ok=$ok fail=$fail"
