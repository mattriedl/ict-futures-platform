#!/usr/bin/env bash
# Deploy new commits of the test-site branch. Installed to
# /usr/local/bin/ict-staging-sync by setup-staging.sh (which fills in the vars).
#   ict-staging-sync            deploy only if GitHub has a new commit
#   ict-staging-sync --force    rebuild even if up to date
# Builds into .build-next and swaps it in only on success, so a broken commit
# never takes the test site down. Status: /var/log/ict-staging-sync.status
set -euo pipefail
BRANCH="staging"
APP="/opt/ict-staging/app"
RUN_USER="ictstage"
STATUS=/var/log/ict-staging-sync.status
FORCE=0; RESTART=1
for a in "$@"; do case "$a" in --force) FORCE=1;; --no-restart) RESTART=0;; esac; done

as_app() { runuser -u "$RUN_USER" -- env HOME=/opt/ict-staging "$@"; }
exec 9>/run/ict-staging-sync.lock; flock -n 9 || exit 0
cd "$APP"

as_app git fetch -q origin "$BRANCH" 2>/dev/null || { [ "$FORCE" = 1 ] || exit 0; }
LOCAL="$(as_app git rev-parse HEAD)"
REMOTE="$(as_app git rev-parse "origin/$BRANCH" 2>/dev/null || echo "$LOCAL")"
if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" = 0 ]; then exit 0; fi

echo "$(date -Is) deploying $BRANCH ${LOCAL:0:7} -> ${REMOTE:0:7}"
if [ "$LOCAL" != "$REMOTE" ]; then as_app git reset -q --hard "origin/$BRANCH"; fi
NEW="$(as_app git rev-parse --short HEAD)"

if ! as_app bash -c 'set -e; npm ci --no-audit --no-fund --loglevel=error && npx prisma generate >/dev/null \
      && rm -rf .build-next && NEXT_DIST_DIR=.build-next npx next build >/tmp/ict-staging-build.log 2>&1'; then
  echo "$(date -Is) FAILED build $NEW (site unchanged) — see /tmp/ict-staging-build.log" | tee "$STATUS"
  exit 1
fi
as_app bash -c 'set -a; . ./.env; set +a; npx prisma migrate deploy >/dev/null && npm run --silent seed >/dev/null'
as_app bash -c 'rm -rf .build-old; [ -d .build ] && mv .build .build-old; mv .build-next .build'
[ "$RESTART" = 1 ] && systemctl restart ict-staging.service
echo "$(date -Is) OK deployed $NEW" | tee "$STATUS"
