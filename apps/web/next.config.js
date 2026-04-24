/**
 * Browser `/api/*` is proxied by `app/api/[[...slug]]/route.js` (returns JSON 503 when vems-api is down).
 * `API_PROXY_TARGET` is read at runtime by that route (same default as before).
 */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shroomagritech.com",
        pathname: "/images/**"
      }
    ]
  }
};

module.exports = nextConfig;
