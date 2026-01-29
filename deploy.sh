#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing dependencies..."
cd "$ROOT_DIR"
npm install

echo "Building web app..."
npm --workspace apps/web run build

echo "Seeding master data..."
node "$ROOT_DIR/apps/api/scripts/seedMasterData.mjs"

echo "Seeding admin user..."
node "$ROOT_DIR/apps/api/scripts/seedAdmin.mjs"

echo "Starting API and Web..."
PORT="${PORT:-4000}" \
NODE_ENV=production \
nohup npm --workspace apps/api run start > "$ROOT_DIR/api.out.log" 2>&1 &

PORT="${WEB_PORT:-3000}" \
NODE_ENV=production \
nohup npm --workspace apps/web run start > "$ROOT_DIR/web.out.log" 2>&1 &

echo "Deploy complete."
echo "API log: $ROOT_DIR/api.out.log"
echo "Web log: $ROOT_DIR/web.out.log"
