import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("products and campaigns dialogs", () => {
  it("both ask before dropping typed changes", () => {
    for (const f of ["components/products/products-board.tsx", "components/products/campaigns.tsx"]) {
      const s = read(f);
      expect(s).toContain("useUnsavedGuard(");
      expect(s).toContain("okToDiscard()");
    }
  });
});
