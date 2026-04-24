/**
 * Start vems-api first, wait until it listens on PORT (default 4000), then start vems-web.
 * Avoids ECONNREFUSED when Next proxies to the API before MongoDB connect + app.listen().
 */
const http = require("node:http");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ecosystemPath = path.join(root, "ecosystem.config.cjs");

try {
  require("dotenv").config({ path: path.join(root, "apps", "api", ".env") });
} catch (e) {
  if (e && e.code !== "MODULE_NOT_FOUND") throw e;
}
const apiPort = (() => {
  const n = parseInt(String(process.env.PORT || "4000"), 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
})();
const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;

function pm2(args) {
  execSync(`npx pm2 ${args}`, { stdio: "inherit", cwd: root, env: process.env });
}

function waitForApiReady({ maxMs = 120000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    function ping() {
      const req = http.get(healthUrl, (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const j = JSON.parse(body);
              if (j && j.ok) return resolve();
            } catch {
              /* fall through */
            }
          }
          retry();
        });
      });
      req.on("error", () => retry());
      req.setTimeout(5000, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() >= deadline) {
        return reject(
          new Error(
            `vems-api did not respond on ${healthUrl} within ${maxMs / 1000}s.\n` +
              "  • Start MongoDB: npm run docker:up\n" +
              "  • Ensure MONGO_URL in apps/api/.env (see apps/api/.env.example)\n" +
              "  • Logs: npx pm2 logs vems-api"
          )
        );
      }
      setTimeout(ping, intervalMs);
    }

    ping();
  });
}

(async () => {
  try {
    pm2(`start "${ecosystemPath}" --only vems-api`);
    await waitForApiReady();
    pm2(`start "${ecosystemPath}" --only vems-web`);
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
})();
