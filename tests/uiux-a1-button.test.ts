import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("touch size and motion classes", () => {
  it("Button grows on coarse pointers", () => {
    const src = read("components/ui/button.tsx");
    expect(src).toContain("pointer-coarse:min-h-11");
    expect(src).toContain("pointer-coarse:min-w-11");
  });

  it("inner boxes are rounder-than-nothing but below the 16 px card corner", () => {
    expect(read("app/globals.css")).not.toContain("--radius-xl: calc(var(--radius) + 4px)");
  });

  it("no motion classes that no plugin defines", () => {
    for (const f of ["dialog", "dropdown-menu", "sheet"]) {
      expect(read(`components/ui/${f}.tsx`)).not.toMatch(/animate-(in|out)|zoom-(in|out)-|slide-(in-from|out-to)-/);
    }
  });
});
