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
// npm workspaces also link every app into node_modules by its package name ("server/…" resolves to apps/server), and
// "@/../" or "./../" climb out as well. no-restricted-imports doesn't see import(), so no-restricted-syntax repeats
// the escapes for it (esquery regexes can't hold "/", hence \x2F).
const LEAVES = "Leaves apps/web: import from inside the app, or from @/shared.";
const boundary = (depth) => {
  const escapes = [`^(\\./)?(\\.\\./){${depth + 1},}`, "^@/\\.\\.(/|$)", "^(server|mobile-app)(/|$)"];
  return {
    files: [`${"*/".repeat(depth)}*.${SOURCES}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["@prisma/client", "prisma", "next-auth", "@ai-sdk/openai", "nodemailer", "bcryptjs", "sharp", "ffmpeg-static", "ffprobe-static", "jose", "twilio", "fflate"].map((name) => ({ name, message: SERVER_ONLY })),
          patterns: [
            { group: ["next-auth/*", "!next-auth/react", "@auth/*", "@aws-sdk/*", "@prisma/*", "@elevenlabs/*"], message: SERVER_ONLY },
            ...escapes.map((regex) => ({ regex, message: LEAVES })),
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: `ImportExpression[source.value=/${escapes.join("|").replaceAll("/", "\\x2F")}/]`, message: LEAVES },
      ],
    },
  };
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "react/no-danger": "error" } },
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
