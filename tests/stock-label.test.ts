import { describe, expect, it } from "vitest";
import { stockLabel } from "@/components/products/api";

describe("stockLabel", () => {
  it("names a positive count, else the in-stock flag, else a count of zero or less as out", () => {
    expect(stockLabel({ stockQuantity: 12, inStock: true })).toBe("12 in stock");
    expect(stockLabel({ stockQuantity: 0, inStock: true })).toBe("In stock");
    expect(stockLabel({ stockQuantity: -3, inStock: true })).toBe("In stock");
    expect(stockLabel({ stockQuantity: 0, inStock: false })).toBe("Out of stock");
    expect(stockLabel({ stockQuantity: 0, inStock: null })).toBe("Out of stock");
    expect(stockLabel({ stockQuantity: null, inStock: true })).toBe("In stock");
    expect(stockLabel({ stockQuantity: null, inStock: null })).toBe("Unknown");
  });

  // The Server's stockState follows the same rule; its test (apps/server/tests/product-checks.test.ts) holds the same
  // cases as states: "N in stock" or "In stock" is in, "Out of stock" is out, "Unknown" is unknown.
  it("agrees with the Server's stock states", () => {
    const table: [boolean | null, number | null, string][] = [
      [true, null, "In stock"], [true, 0, "In stock"], [true, 5, "5 in stock"], [true, -2, "In stock"],
      [false, null, "Out of stock"], [false, 0, "Out of stock"], [false, 5, "5 in stock"], [false, -2, "Out of stock"],
      [null, null, "Unknown"], [null, 0, "Out of stock"], [null, 5, "5 in stock"], [null, -2, "Out of stock"],
    ];
    for (const [inStock, stockQuantity, label] of table) expect(stockLabel({ inStock, stockQuantity }), `${inStock}/${stockQuantity}`).toBe(label);
  });
});
