import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("settings screens", () => {
  it("the tab strip scrolls instead of running off a phone", () => {
    const s = read("components/settings/settings-board.tsx");
    expect(s).toContain("overflow-x-auto");
    expect(s).toContain("max-w-full");
    expect(s).toContain('"shrink-0 rounded-full');
  });
  it("shows the connect result above the list, and says why a provider is not set up", () => {
    const s = read("components/settings/connections-tab.tsx");
    expect(s.indexOf("{banner && (")).toBeLessThan(s.indexOf("<PageSection"));
    expect(s).toContain("Needs app keys on the server");
  });
  it("members: plain copy, result line before the table, Undo on a role change", () => {
    const s = read("components/settings/members-tab.tsx");
    expect(s).not.toContain("members.read");
    expect(s).not.toContain("Your role doesn't include");
    expect(s).toContain("Your role can't see the member list.");
    expect(s.indexOf('aria-live="polite"')).toBeLessThan(s.indexOf("<PageSection"));
    expect(s).toContain('label: "Undo"');
  });
  it("no CLI commands in visible AI model copy", () => {
    expect(noComments(read("components/settings/ai-models-tab.tsx"))).not.toContain("npm run");
  });
  it("role dialog leads with the description; the key is only a title", () => {
    const s = read("components/settings/role-dialog.tsx");
    expect(s).not.toContain("{p.key}</span>");
    expect(s).toContain("title={p.key}");
  });
});
