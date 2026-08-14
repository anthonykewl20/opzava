import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
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
