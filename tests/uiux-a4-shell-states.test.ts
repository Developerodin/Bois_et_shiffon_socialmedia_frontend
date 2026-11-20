import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("loading and failure states in the shell", () => {
  it("the route skeleton keeps PageSkeleton for pages other than the Overview", () => {
    const src = read("app/(shell)/loading.tsx");
    expect(src).toContain("usePathname");
    expect(src).toContain("PageSkeleton");
  });
  it("switch failures are shown, not swallowed", () => {
    expect(read("components/shell/workspace-switcher.tsx")).toContain("Couldn't switch workspace");
    expect(read("components/shell/brand-switcher.tsx")).toContain("Couldn't switch business");
  });
  it("learning notes show a failure with a retry", () => {
    expect(read("components/workspace/workspace.tsx")).toContain('what="learning notes"');
  });
  it("the peek title is not a heading: its content owns the h1", () => {
    expect(read("components/workspace/peek.tsx")).toContain("<p id={titleId}");
  });
  it("LoadFailed lives in components/ui and content-panels still exports it", () => {
    expect(read("components/ui/load-failed.tsx")).toContain("export function LoadFailed");
    expect(read("components/workspace/content-panels.tsx")).toContain("export { LoadFailed }");
  });
});
