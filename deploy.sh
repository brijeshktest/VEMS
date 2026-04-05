#!/usr/bin/env bash
# Shroom Agritech LLP — Vendor & Expense Management System
# Production-style deploy: install deps, build Next.js, seed MongoDB (if needed), start API + web in background.
#
# Prerequisites:
#   - Node.js and npm
#   - MongoDB reachable (default: mongodb://localhost:27017/vendor_expense)
#   - apps/api/.env — copy from apps/api/.env.example (MONGO_URL, JWT_SECRET, PORT, etc.)
#   - apps/web/.env.local — copy from apps/web/.env.example; set NEXT_PUBLIC_API_URL to your API URL
#     before build (e.g. http://localhost:4000 for same host).
# Optional for seedAdmin.mjs: ADMIN_EMAIL (default admin@shroomagritechllp.com), ADMIN_PASSWORD.
#
# Environment:
#   PORT       — API listen port (default 4000)
#   WEB_PORT   — Next.js listen port (default 3000)
#
# Logs: api.out.log and web.out.log in the repo root.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

API_PORT="${PORT:-4000}"
WEB_PORT_VAL="${WEB_PORT:-3000}"

ENV_FILE="$ROOT_DIR/apps/api/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "Loading API environment from apps/api/.env (for seed scripts)..."
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

echo "Installing dependencies..."
npm install

echo "Building web app..."
npm --workspace apps/web run build

echo "Seeding master data..."
node "$ROOT_DIR/apps/api/scripts/seedMasterData.mjs"

echo "Seeding admin user..."
node "$ROOT_DIR/apps/api/scripts/seedAdmin.mjs"

echo "Starting API (port $API_PORT) and Web (port $WEB_PORT_VAL) in background..."

PORT="$API_PORT" NODE_ENV=production \
  nohup npm --workspace apps/api run start > "$ROOT_DIR/api.out.log" 2>&1 &

PORT="$WEB_PORT_VAL" NODE_ENV=production \
  nohup npm --workspace apps/web run start > "$ROOT_DIR/web.out.log" 2>&1 &

echo "Deploy complete."
echo "  API:  http://localhost:$API_PORT"
echo "  Web:  http://localhost:$WEB_PORT_VAL"
echo "  API log: $ROOT_DIR/api.out.log"
echo "  Web log: $ROOT_DIR/web.out.log"
