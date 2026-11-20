import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("error pages", () => {
  it("renders a failed shell page inline", () => {
    expect(read("app/(shell)/error.tsx")).toMatch(/inline/);
    expect(read("app/error.tsx")).toMatch(/inline=\{inline\}/);
  });
  it("global-error reloads the document with the shared button classes", () => {
    const s = read("app/global-error.tsx");
    expect(s).toContain("location.reload()");
    expect(s).toContain("buttonVariants");
  });
  it("never renders error.message or error.stack", () => {
    for (const f of ["app/error.tsx", "app/(shell)/error.tsx", "app/global-error.tsx", "components/net/error-screen.tsx"]) {
      expect(read(f)).not.toMatch(/error\.(message|stack)/);
    }
  });
});
