import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@skyarc/api-client", "@skyarc/shared"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    // Rewrites are baked at build time. Never fall back to loopback on Vercel —
    // that surfaces as DNS_HOSTNAME_RESOLVED_PRIVATE and breaks all /api data loads.
    const fromEnv = process.env.API_PROXY_TARGET?.trim();
    const apiTarget =
      fromEnv ||
      (process.env.VERCEL
        ? "http://srv1887077.hstgr.cloud:3001"
        : "http://127.0.0.1:3001");
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-854b1a1d4dc34a41b4777642ea2bb6c6.r2.dev",
        pathname: "/logos/**",
      },
      {
        protocol: "https",
        hostname: "pub-888bb96696e64393a828162bffaac0c8.r2.dev",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
