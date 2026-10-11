import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for hosts without Docker or pnpm (shared cPanel, see README "Deploy").
  // Traced from the monorepo root so the workspace packages (TS source in packages/) are included.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
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
