import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(process.cwd(), "components/workspace/content-panels.tsx"), "utf8");

describe("content panels", () => {
  it("has no text below the 12 px floor", () => {
    expect(src).not.toContain("text-[11px]");
  });
  it("loads with skeletons, not bare text", () => {
    for (const t of ["Loading ideas…", "Loading calendar…", "Loading frames…"]) expect(src).not.toContain(t);
  });
  it("offers one Plan button per list, not one per idea", () => {
    expect((src.match(/Plan all/g) ?? []).length).toBeLessThanOrEqual(1);
  });
  it("names the idea action the same as Today does", () => {
    expect(src).toContain('withPrice("Get ideas"');
  });
  it("explains the month's colours in text", () => {
    expect(src).toContain("Awaiting approval");
  });
  it("says when campaigns or owners did not load", () => {
    expect(src).toContain("load campaigns");
    expect(src).toContain("load owners");
  });
});
