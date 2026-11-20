import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("agents, photoshoot and studio pages", () => {
  it("agent loading placeholders are grey, not card-coloured", () => {
    const line = read("components/agents/agents-board.tsx").split("\n").find((l) => l.includes("animate-pulse")) ?? "";
    expect(line).toContain("bg-border");
    expect(line).not.toContain("bg-card");
  });
  it("the shoot summary is headed plainly", () => {
    const s = read("components/photoshoot/shoot-detail.tsx");
    expect(s).toContain("Shoot details");
    expect(s).not.toContain("Staging summary");
  });
  it("Studio has a way back", () => {
    expect(read("app/(shell)/studio/page.tsx")).toContain('backHref="/"');
  });
  it("agents and performance empty states are the page heading", () => {
    expect(read("app/(shell)/agents/page.tsx")).toContain('headingLevel="h1"');
    expect(read("app/(shell)/performance/page.tsx")).toContain('headingLevel="h1"');
  });
});
