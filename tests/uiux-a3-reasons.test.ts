import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

// No logic to exercise here: these pin that the reason is visible text, not a title a disabled button never shows.
describe("disabled buttons say why in visible text", () => {
  it("Approve is linked to a visible reason, not a title", () => {
    const src = read("components/workspace/release-panel.tsx");
    expect(src).toContain('id="approve-why"');
    expect(src).not.toContain('title="Fix the quality blockers first"');
    expect(src).not.toContain("(needed to");
  });
  it("Draft post / Create post explains what is missing", () => {
    const src = read("components/workspace/new-post-dialog.tsx");
    expect(src).toContain("Choose a photo to draft the post.");
    expect(src).not.toContain("aria-required");
    expect(src).toContain('id="new-post-problem"');
    expect(src).toContain('aria-describedby={problem ? "new-post-problem" : undefined}');
  });
});
