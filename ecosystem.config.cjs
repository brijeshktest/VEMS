const path = require("path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "vems-api",
      cwd: path.join(root, "apps/api"),
      script: "src/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "vems-web",
      cwd: path.join(root, "apps/web"),
      script: "npm",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "/api",
      },
    },
  ],
};
