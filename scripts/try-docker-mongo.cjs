/**
 * If Docker is available, run `docker compose up -d` so Mongo is listening before PM2 starts the API.
 * No-op when Docker is missing or `docker compose` fails (Mongo may already be running elsewhere).
 */
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function dockerAvailable() {
  try {
    execSync("docker info", { stdio: "ignore", cwd: root });
    return true;
  } catch {
    return false;
  }
}

if (!dockerAvailable()) {
  console.log("[try-docker-mongo] Docker not available; using existing MongoDB or MONGO_URL.");
  process.exit(0);
}

try {
  console.log("[try-docker-mongo] Starting MongoDB (docker compose)…");
  try {
    execSync("docker compose up -d --wait", { stdio: "inherit", cwd: root });
  } catch {
    execSync("docker compose up -d", { stdio: "inherit", cwd: root });
  }
} catch (e) {
  console.warn("[try-docker-mongo] docker compose failed:", e && e.message ? e.message : e);
  process.exit(0);
}
