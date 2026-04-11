/**
 * SIGKILL listeners on VEMS default ports so PM2 / next start can bind.
 * macOS/Linux: lsof. Windows: no-op (run stop from Task Manager if needed).
 */
const { execSync } = require("node:child_process");

const PORTS = [3000, 4000];

function freePort(port) {
  if (process.platform === "win32") {
    return;
  }
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8" }).trim();
    if (!out) return;
    const pids = [...new Set(out.split(/\n/).filter(Boolean))];
    for (const pid of pids) {
      const n = Number(pid, 10);
      if (!Number.isFinite(n) || n <= 1) continue;
      try {
        process.kill(n, "SIGKILL");
      } catch (e) {
        if (e && e.code !== "ESRCH") throw e;
      }
    }
  } catch (e) {
    const status = e && e.status;
    if (status === 1) return;
  }
}

for (const port of PORTS) {
  freePort(port);
}
