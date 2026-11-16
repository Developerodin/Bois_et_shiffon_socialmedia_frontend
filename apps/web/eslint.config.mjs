import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // The browser side (pages, components, lib) must not reach server code or server-only packages; it goes through
  // the API. Files still doing so are marked "converted in task N" and are fixed as the split proceeds.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["@prisma/client", "prisma", "next-auth", "@ai-sdk/openai", "nodemailer", "bcryptjs", "sharp", "ffmpeg-static", "ffprobe-static", "jose"].map((name) => ({ name, message: "Server-only: reach it through the API." })),
          patterns: [
            { group: ["@/server", "@/server/**", "@/auth*"], message: "Server-only: reach it through the API." },
            { group: ["next-auth/*", "!next-auth/react", "@auth/*", "@aws-sdk/*"], message: "Server-only: reach it through the API." },
          ],
        },
      ],
    },
  },
  // These tests fake Prisma with in-memory tables whose rows and where-clauses have no fixed shape.
  {
    files: ["tests/stories-by-hand.test.ts", "tests/stories-publish.test.ts", "tests/stories-save.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
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
