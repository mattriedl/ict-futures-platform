#!/usr/bin/env bash
# Deploy new commits of the test-site branch. Installed to
# /usr/local/bin/ict-staging-sync by setup-staging.sh (which fills in the vars).
#   ict-staging-sync               deploy only if GitHub has a new commit
#   ict-staging-sync --force       rebuild even if up to date
#   ict-staging-sync --no-restart  build + switch, but don't restart the service
#
# Each version is built in its own folder under releases/ (dependencies AND
# build output), then the `current` symlink is switched and the service
# restarted. The running site is never touched while a build is in progress,
# and a failed build leaves it unchanged. Status: /var/log/ict-staging-sync.status
set -euo pipefail
BRANCH="staging"
APP="/opt/ict-staging/app"          # git checkout + .env (source of truth)
RUN_USER="ictstage"
BASE="$(dirname "$APP")"
RELEASES="$BASE/releases"
CURRENT="$BASE/current"
STATUS=/var/log/ict-staging-sync.status
FORCE=0; RESTART=1
for a in "$@"; do case "$a" in --force) FORCE=1;; --no-restart) RESTART=0;; esac; done

as_app() { runuser -u "$RUN_USER" -- env HOME="$BASE" "$@"; }
exec 9>/run/ict-staging-sync.lock; flock -n 9 || exit 0
cd "$APP"

as_app git fetch -q origin "$BRANCH" 2>/dev/null || { [ "$FORCE" = 1 ] || exit 0; }
LOCAL="$(as_app git rev-parse HEAD)"
REMOTE="$(as_app git rev-parse "origin/$BRANCH" 2>/dev/null || echo "$LOCAL")"
if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" = 0 ]; then exit 0; fi

echo "$(date -Is) deploying $BRANCH ${LOCAL:0:7} -> ${REMOTE:0:7}"
if [ "$LOCAL" != "$REMOTE" ]; then as_app git reset -q --hard "origin/$BRANCH"; fi
NEW="$(as_app git rev-parse --short HEAD)"
REL="$RELEASES/$NEW-$(date +%s)"

mkdir -p "$RELEASES"; chown "$RUN_USER:$RUN_USER" "$RELEASES"
as_app mkdir -p "$REL"
as_app git archive HEAD | as_app tar -x -C "$REL"
as_app ln -s "$APP/.env" "$REL/.env"
if ! as_app bash -c "set -e; cd '$REL'; npm ci --no-audit --no-fund --loglevel=error && npx prisma generate >/dev/null \
      && NEXT_DIST_DIR=.build npx next build" > /tmp/ict-staging-build.log 2>&1; then
  echo "$(date -Is) FAILED build $NEW (site unchanged) — see /tmp/ict-staging-build.log" | tee "$STATUS"
  rm -rf "$REL"
  exit 1
fi
as_app bash -c "cd '$REL' && npx prisma migrate deploy >/dev/null && npm run --silent seed >/dev/null"
ln -sfn "$REL" "$CURRENT.new" && mv -T "$CURRENT.new" "$CURRENT"
[ "$RESTART" = 1 ] && systemctl restart ict-staging.service
# Keep the 3 newest releases.
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
echo "$(date -Is) OK deployed $NEW" | tee "$STATUS"
