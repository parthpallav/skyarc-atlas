import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@skyarc/api-client", "@skyarc/shared"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async rewrites() {
    const apiTarget =
      process.env.API_PROXY_TARGET ?? "http://200.97.170.55:3001";
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
