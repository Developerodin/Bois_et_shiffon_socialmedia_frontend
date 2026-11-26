import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(process.cwd(), "components/workspace/panel-layout.tsx"), "utf8");

describe("panel layout", () => {
  it("marks the active phone tab by shape, not colour alone, and says which is pressed", () => {
    expect(src).not.toContain("aria-current={activeMobile");
    expect(src).toContain("aria-pressed={activeMobile === id}");
    expect(src).toContain("border-t-2");
    expect(src).toContain("border-foreground font-medium");
  });
  it("starts a drag from the grip and title only, not from the header's buttons", () => {
    const header = src.slice(src.indexOf("<header"), src.indexOf("</header>"));
    const dragAt = header.indexOf("draggable");
    expect(dragAt).toBeGreaterThan(-1);
    expect(dragAt).toBeLessThan(header.indexOf("panel options"));
    // the draggable element closes before the options button
    const dragBlock = header.slice(dragAt, header.indexOf("</h2>"));
    expect(dragBlock).not.toContain("panel options");
  });
  it("titles each panel with a heading", () => {
    expect(src).toContain('<h2 className="min-w-0">');
  });
});
