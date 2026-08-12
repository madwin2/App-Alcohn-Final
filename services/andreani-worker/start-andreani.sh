#!/bin/bash
# Andreani Pymes no renderiza bien el SPA en Chromium headless puro.
# Misma mitigación que whatsapp-hetzner-bot: Xvfb = pantalla virtual.
set -euo pipefail
cd "$(dirname "$0")"
unset DISPLAY || true
export ANDREANI_HEADLESS="${ANDREANI_HEADLESS:-false}"
exec xvfb-run -a -s "-screen 0 1400x900x24 -ac" node dist/index.js
