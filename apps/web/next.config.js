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
