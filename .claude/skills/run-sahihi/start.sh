#!/usr/bin/env bash
# Start Sahihi (api :4000, worker, web :3000) for driving with driver.mjs. Idempotent: re-running
# skips what's already up. Logs go to .run/logs/. Run from the repo root.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
mkdir -p .run/logs

# 1. Docker: cloud containers start with the daemon stopped.
if ! docker info >/dev/null 2>&1; then
  # A restarted container keeps /var/run from the last session: dockerd then trusts a stale
  # containerd.pid whose number now belongs to another process, and times out. Clear it.
  pidfile=/var/run/docker/containerd/containerd.pid
  if [ -f "$pidfile" ] && [ "$(ps -p "$(cat "$pidfile")" -o comm= 2>/dev/null)" != "containerd" ]; then
    sudo -n rm -f "$pidfile" /var/run/docker/containerd/*.sock* /var/run/docker.pid
  fi
  (sudo -n dockerd >.run/logs/dockerd.log 2>&1 &)
  timeout 60 bash -c 'until docker info >/dev/null 2>&1; do sleep 1; done'
fi

# 2. Postgres, Redis, MinIO (+ sahihi-documents and sahihi-customer buckets), Mailpit.
timeout 300 bun run infra:up >.run/logs/infra.log 2>&1
timeout 60 bash -c 'until docker exec sahihi-postgres-1 pg_isready -U sahihi >/dev/null 2>&1; do sleep 1; done'

# 3. Env, Prisma client, migrations.
[ -f .env ] || cp .env.example .env
# Lets Settings → Storage connect to the local sahihi-customer bucket (docs/storage.md).
grep -q '^STORAGE_ALLOW_PRIVATE_ENDPOINTS=' .env || printf '\nSTORAGE_ALLOW_PRIVATE_ENDPOINTS=true\n' >> .env
[ -d packages/db/src/generated ] || bun run db:generate >.run/logs/db.log 2>&1
(cd packages/db && bun --env-file=../../.env run migrate:deploy) >>.run/logs/db.log 2>&1

# 4. The three processes, each in its own session so stop.sh can kill the whole group.
#    PIDs go to .run/<name>.pid (process names alone can't tell api and worker apart).
alive() { [ -f ".run/$1.pid" ] && kill -0 "$(cat ".run/$1.pid")" 2>/dev/null; }
launch() { alive "$1" || { setsid nohup bun run "dev:$1" >".run/logs/$1.log" 2>&1 & echo $! >".run/$1.pid"; }; }
launch api
launch worker
launch web

timeout 120 bash -c 'until curl -sf http://localhost:4000/health >/dev/null; do sleep 1; done'
# Next compiles on first request; the first hit can take 30s+.
timeout 240 bash -c 'until curl -s -o /dev/null --max-time 60 http://localhost:3000/sign-in; do sleep 2; done'
echo "up: web http://localhost:3000 · api http://localhost:4000 · mailpit http://localhost:8025"
