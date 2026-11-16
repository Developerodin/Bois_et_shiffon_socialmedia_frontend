import tsParser from "@typescript-eslint/parser";

// The shared package runs in both apps (the browser and the server): no database types, no zod, no Node built-ins.
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser },
    rules: {
      "no-restricted-imports": ["error", { paths: ["@prisma/client", "zod"], patterns: [{ group: ["node:*"], message: "Shared code must run in the browser." }] }],
      "no-restricted-globals": ["error", { name: "process", message: "Shared code must run in the browser." }],
    },
  },
];
