#!/bin/bash
# reCAPTCHA v3 de MiCorreo rechaza Chromium headless (403 RecaptchaRejected).
# Misma mitigación que andreani-worker: Xvfb = pantalla virtual + HEADLESS=false.
set -euo pipefail
cd "$(dirname "$0")"
unset DISPLAY || true
export MICORREO_HEADLESS="${MICORREO_HEADLESS:-false}"
exec xvfb-run -a -s "-screen 0 1400x900x24 -ac" node dist/index.js
