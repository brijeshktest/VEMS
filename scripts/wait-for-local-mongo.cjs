/**
 * If MONGO_URL / MONGODB_URI points at local Mongo (127.0.0.1 or localhost), wait until TCP accepts
 * connections so vems-api does not fail serverSelectionTimeout on first PM2 start.
 * Skips for mongodb+srv (Atlas) and other hosts.
 */
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

try {
  require("dotenv").config({ path: path.join(root, "apps", "api", ".env") });
} catch (e) {
  if (e && e.code !== "MODULE_NOT_FOUND") throw e;
}

const raw =
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/vendor_expense";

function localTarget(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (u.startsWith("mongodb+srv://")) return null;
  if (!/^mongodb:\/\//i.test(u)) return null;
  let rest = u.replace(/^mongodb:\/\//i, "");
  const at = rest.lastIndexOf("@");
  if (at !== -1) rest = rest.slice(at + 1);
  const slash = rest.indexOf("/");
  const beforePath = slash === -1 ? rest : rest.slice(0, slash);
  const first = beforePath.split(",")[0].trim();
  if (!first) return null;
  const lastColon = first.lastIndexOf(":");
  let hostRaw;
  let portRaw = "";
  if (lastColon > 0 && /^\d+$/.test(first.slice(lastColon + 1))) {
    hostRaw = first.slice(0, lastColon);
    portRaw = first.slice(lastColon + 1);
  } else {
    hostRaw = first;
  }
  const host = (hostRaw || "").toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") return null;
  const port = portRaw ? parseInt(portRaw, 10) : 27017;
  if (!Number.isFinite(port) || port <= 0) return null;
  const connectHost = host === "localhost" || host === "::1" ? "127.0.0.1" : hostRaw;
  return { host: connectHost, port };
}

function waitForPort(host, port, { maxMs = 90000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    function tryOnce() {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.setTimeout(3000, () => {
        socket.destroy();
        retry();
      });
      socket.on("error", () => {
        socket.destroy();
        retry();
      });
    }
    function retry() {
      if (Date.now() >= deadline) {
        reject(
          new Error(
            `MongoDB is not accepting connections on ${host}:${port} after ${maxMs / 1000}s.\n` +
              "  • With Docker: npm run docker:up\n" +
              "  • Or install/start mongod locally, then retry."
          )
        );
        return;
      }
      setTimeout(tryOnce, intervalMs);
    }
    tryOnce();
  });
}

(async () => {
  const target = localTarget(raw);
  if (!target) {
    console.log("[wait-for-local-mongo] Non-local Mongo URL; skipping TCP wait.");
    process.exit(0);
  }
  console.log(`[wait-for-local-mongo] Waiting for ${target.host}:${target.port}…`);
  try {
    await waitForPort(target.host, target.port);
    console.log("[wait-for-local-mongo] Mongo port is open.");
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();
