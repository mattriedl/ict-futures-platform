#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/ict_project/nextjs_space
SEC=$(grep '^AUTOTRADE_SECRET=' .env | cut -d= -f2- | tr -d '"')
# -w appends HTTP status on its own final line, which process_autotrade.py expects
RESP=$(curl -s --max-time 120 -w $'\n%{http_code}' -X POST -H "x-autotrade-secret: ${SEC}" http://localhost:3456/api/demo/autotrade)
printf '%s' "$RESP" | /usr/bin/python3 /home/ubuntu/process_autotrade.py
