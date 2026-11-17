import type { NextConfig } from "next";

// The Server's address. In production the load balancer sends /api/* to the Server before it reaches this app, so the
// rewrite below only serves local dev; server components call SERVER_URL directly (lib/server-fetch.ts).
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3101";

const nextConfig: NextConfig = {
  env: { WEB_VERSION: process.env.npm_package_version ?? "dev" },
  output: "standalone",
  // This repo is its own project root. Pinned explicitly: while the folder still sits inside the old monorepo, Next
  // would otherwise pick the parent's lockfile and trace (and nest the standalone output) from there.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
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
