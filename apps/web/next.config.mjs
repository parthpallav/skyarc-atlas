import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@skyarc/api-client", "@skyarc/shared"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-854b1a1d4dc34a41b4777642ea2bb6c6.r2.dev",
        pathname: "/logos/**",
      },
    ],
  },
};

export default nextConfig;
