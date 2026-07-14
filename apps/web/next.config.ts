import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/connections/gateway",
        destination: "/connections",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
