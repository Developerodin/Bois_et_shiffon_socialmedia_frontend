import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { restoreThread } from "@/lib/chat-undo";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("restoreThread", () => {
  const prev = { base: "/a", thread: "old with later messages" };
  it("brings the old thread back for the same business", () => {
    expect(restoreThread({ base: "/a", thread: "new" }, prev)).toBe(prev);
  });
  it("leaves the current thread when the business changed", () => {
    const cur = { base: "/b", thread: "other business" };
    expect(restoreThread(cur, prev)).toBe(cur);
    expect(restoreThread(null, prev)).toBeNull();
  });
});

describe("assistant drawer", () => {
  it("fills the phone width and only offers Expand from sm up", () => {
    const src = read("components/shell/assistant-panel.tsx");
    expect(src).toContain("w-full sm:w-80");
    expect(src).toContain('"hidden sm:grid"');
  });
});
