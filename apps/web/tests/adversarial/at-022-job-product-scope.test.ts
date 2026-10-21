/**
 * AT-022 — Job brandId must match product brand.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { describe, expect, it } from "vitest";
import {
  JobValidationError,
  validateJobProductScope,
} from "@/server/jobs/claim";

describe("AT-022 job product brand match", () => {
  it("rejects product from another brand", () => {
    expect(() =>
      validateJobProductScope({
        workspaceId: "ws-1",
        brandId: "brand-a",
        productId: "prod-1",
        productBrandId: "brand-b",
      }),
    ).toThrow(JobValidationError);
  });

  it("allows product in the same brand", () => {
    expect(() =>
      validateJobProductScope({
        workspaceId: "ws-1",
        brandId: "brand-a",
        productId: "prod-1",
        productBrandId: "brand-a",
      }),
    ).not.toThrow();
  });
});
