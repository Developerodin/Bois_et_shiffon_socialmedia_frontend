import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("settings copy", () => {
  it("no permission keys in the members empty state", () => {
    expect(read("components/settings/members-tab.tsx")).not.toContain("members.read");
  });
  it("no CLI commands in visible AI model copy", () => {
    expect(noComments(read("components/settings/ai-models-tab.tsx"))).not.toContain("npm run");
  });
});
