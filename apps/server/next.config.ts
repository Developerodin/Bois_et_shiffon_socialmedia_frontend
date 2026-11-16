import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@espanda/shared"],
  // Reel joining runs ffmpeg (server/reels/join.ts) and story uploads run ffprobe (server/stories/probe.ts; Linux for deploys, Windows for local builds) and story frames need the bundled fonts (server/stories/render.ts); jobs run in any API route's after(), so every v1 route ships the binary (ponytail: ~75 MB per function; move rendering to one route if size bites).
  outputFileTracingIncludes: { "/api/v1/**/*": ["../../node_modules/ffmpeg-static/ffmpeg*", "../../node_modules/ffprobe-static/bin/linux/x64/*", "../../node_modules/ffprobe-static/bin/win32/x64/*", "./assets/fonts/*"] },
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
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
