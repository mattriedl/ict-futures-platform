#!/usr/bin/env bash
# Runs one scheduled cycle (resolve open trades -> autotrade scan -> setup alerts)
# by POSTing to the app's autotrade endpoint with the shared secret.
#
# Env (optional): APP_DIR (default: repo root containing this script),
#                 APP_URL (default: http://127.0.0.1:${APP_PORT:-3456})
# Output goes to stdout/journal; the last line is the HTTP status code.
set -euo pipefail
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"
get_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
SEC="$(get_env AUTOTRADE_SECRET)"
PORT="${APP_PORT:-$(get_env APP_PORT)}"; PORT="${PORT:-3456}"
URL="${APP_URL:-http://127.0.0.1:${PORT}}"
if [ -z "$SEC" ]; then echo "AUTOTRADE_SECRET missing from $APP_DIR/.env" >&2; exit 1; fi
RESP="$(curl -s --max-time 290 -w $'\n%{http_code}' -X POST -H "x-autotrade-secret: ${SEC}" "${URL}/api/demo/autotrade")"
CODE="${RESP##*$'\n'}"
BODY="${RESP%$'\n'*}"
# Compact one-line summary for the journal.
printf '%s\n' "$BODY" | python3 -c 'import sys,json
try:
  j=json.load(sys.stdin)
  print("cycle ok=%s resolved=%s trades=%s alerts=%s errors=%d" % (j.get("ok"), j.get("resolved"), sum(u.get("created",0) for u in j.get("perUser",[])), (j.get("alerts") or {}).get("alertsCreated"), len(j.get("errors",[]))))
except Exception as e:
  print("unparseable response:", str(e))' || true
echo "$CODE"
[ "$CODE" = "200" ]
