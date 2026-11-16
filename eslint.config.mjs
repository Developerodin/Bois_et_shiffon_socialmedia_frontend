import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const SERVER_ONLY = "Server-only: the website reaches the Server through its API.";
const SOURCES = "{ts,tsx,js,jsx,mjs}";

// The website has no database, secrets or server code: it reaches the Server over HTTP. npm hoists the Server's
// packages into the root node_modules, so they resolve from here too; ban them by name. A relative import that climbs
// out of apps/web is banned too: one block per folder depth, since how many "../" leave the app depends on where the
// file sits (ESLint keeps only the last matching block's options for a rule, so each block carries the full list).
const boundary = (depth) => ({
  files: [`${"*/".repeat(depth)}*.${SOURCES}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: ["@prisma/client", "prisma", "next-auth", "@ai-sdk/openai", "nodemailer", "bcryptjs", "sharp", "ffmpeg-static", "ffprobe-static", "jose"].map((name) => ({ name, message: SERVER_ONLY })),
        patterns: [
          { group: ["next-auth/*", "!next-auth/react", "@auth/*", "@aws-sdk/*", "@prisma/*"], message: SERVER_ONLY },
          { regex: `^(\\.\\./){${depth + 1},}`, message: "Leaves apps/web: import from inside the app, or from @espanda/shared." },
        ],
      },
    ],
  },
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...Array.from({ length: 12 }, (_, depth) => boundary(depth)),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
