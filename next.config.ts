import path from "node:path";
import type { NextConfig } from "next";

// The Server's address. In production the load balancer sends /api/* to the Server before it reaches this app, so the
// rewrite below only serves local dev; server components call SERVER_URL directly (lib/server-fetch.ts).
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3101";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@espanda/shared"],
  turbopack: {
    // Monorepo root: npm workspaces hoist `next` into ../../node_modules.
    root: path.join(__dirname, "../.."),
  },
  experimental: {
    // The dev proxy otherwise cuts a request after 30 s; chat streams and agent runs take up to 300 s.
    proxyTimeout: 330_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${SERVER_URL}/api/:path*` }];
  },
};

export default nextConfig;
