import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` is only needed for the sandbox's self-hosted start script.
  // Vercel builds its own output — enabling it there is unnecessary.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
