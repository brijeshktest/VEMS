/**
 * Create apps/api/.env and apps/web/.env.local from *.example if missing.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function copyIfMissing(relExample, relDest) {
  const src = path.join(root, relExample);
  const dest = path.join(root, relDest);
  if (fs.existsSync(dest)) return false;
  if (!fs.existsSync(src)) {
    console.warn(`[ensure-local-env] Skip ${relDest}: missing ${relExample}`);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`[ensure-local-env] Created ${relDest}`);
  return true;
}

copyIfMissing("apps/api/.env.example", "apps/api/.env");
copyIfMissing("apps/web/.env.example", "apps/web/.env.local");
