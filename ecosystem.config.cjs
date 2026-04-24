const path = require("path");

const root = __dirname;

try {
  require("dotenv").config({ path: path.join(root, "apps", "api", ".env") });
} catch (e) {
  if (e && e.code !== "MODULE_NOT_FOUND") throw e;
}

const apiPort = (() => {
  const n = parseInt(String(process.env.PORT || "4000"), 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
})();

const mongoUrl =
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/vendor_expense";
const jwtSecret = process.env.JWT_SECRET || "change-me-dev-only";

module.exports = {
  apps: [
    {
      name: "vems-api",
      cwd: path.join(root, "apps/api"),
      script: "src/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: String(apiPort),
        MONGO_URL: mongoUrl,
        JWT_SECRET: jwtSecret
      }
    },
    {
      name: "vems-web",
      cwd: path.join(root, "apps/web"),
      script: "npm",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        /** Same-origin `/api` in the browser; proxied by Next to API_PROXY_TARGET. */
        NEXT_PUBLIC_API_URL: "/api",
        API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`
      }
    }
  ]
};
