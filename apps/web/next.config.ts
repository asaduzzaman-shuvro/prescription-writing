import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rx/core", "@rx/db"],
  serverExternalPackages: ["playwright", "postgres"],
  // Medicine CSV imports are posted to a server action (the full catalogue is ~4 MB).
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  // Browsers still request /favicon.ico by default; serve the existing brand SVG.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

export default nextConfig;
