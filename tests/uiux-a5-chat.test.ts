import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("assistant drawer", () => {
  it("fills the phone width and only offers Expand from sm up", () => {
    const src = read("components/shell/assistant-panel.tsx");
    expect(src).toContain("w-full sm:w-80");
    expect(src).toContain('"hidden sm:grid"');
  });
  it("starting a new conversation can be undone", () => {
    expect(read("components/workspace/chat-pane.tsx")).toMatch(/label: "Undo"/);
  });
});
