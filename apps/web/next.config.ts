import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo root: npm workspaces hoist `next` into ../../node_modules.
    root: path.join(__dirname, "../.."),
  },
  // The mobile app's Expo web preview (dev only) calls this API cross-origin with a Bearer token.
  // Native apps need no CORS; production sends none of these headers.
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:8090" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, X-Workspace-Id" },
        ],
      },
    ];
  },
};

export default nextConfig;
