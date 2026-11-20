import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("products and campaigns", () => {
  const products = read("components/products/products-board.tsx");
  const campaigns = read("components/products/campaigns.tsx");
  it("row buttons name the product, and Edit shows progress in the row", () => {
    expect(products).toContain("aria-label={`Edit ${p.title}`}");
    expect(products).toContain("aria-label={`Delete ${p.title}`}");
    expect(products).toContain("Loader2");
    expect(products).toContain("const ProductRow = memo(");
  });
  it("campaign buttons name the campaign", () => {
    expect(campaigns).toContain("aria-label={`Edit ${c.name}`}");
    expect(campaigns).toContain("aria-label={`Withdraw ${c.name}`}");
  });
  it("both dialogs ask before dropping typed changes", () => {
    for (const s of [products, campaigns]) {
      expect(s).toContain("useUnsavedGuard(");
      expect(s).toContain("okToDiscard()");
      expect(s).toContain("!open && close()");
    }
  });
});
