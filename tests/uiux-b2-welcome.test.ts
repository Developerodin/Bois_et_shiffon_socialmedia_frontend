import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(process.cwd(), "components/welcome/welcome-flow.tsx"), "utf8");

describe("welcome reading screen", () => {
  it("scrolls the log list, not the page", () => {
    expect(src).not.toContain("scrollIntoView");
    expect(src).toContain("scrollTop = ");
  });
  it("keeps the ticking clock out of the live region", () => {
    const start = src.indexOf('<p aria-live="polite"');
    const block = src.slice(start, src.indexOf("</p>", start));
    expect(block).not.toContain("clock(");
  });
  it("uses accessible placeholder contrast and no stale colour name", () => {
    expect(src).not.toContain("placeholder:text-muted-foreground/50");
    expect(src).not.toContain("brass");
  });
});
