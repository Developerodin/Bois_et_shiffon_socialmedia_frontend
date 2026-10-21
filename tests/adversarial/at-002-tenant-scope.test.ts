/**
 * AT-002 — Child record must not reference parent in another workspace.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { describe, expect, it } from "vitest";
import {
  assertChildMatchesParentScope,
  TenantScopeError,
} from "@/server/tenant/scope";

describe("AT-002 tenant scope on insert", () => {
  it("rejects child in a different workspace than parent", () => {
    expect(() =>
      assertChildMatchesParentScope(
        { workspaceId: "ws-a", brandId: "brand-a" },
        { workspaceId: "ws-b", brandId: "brand-a" },
      ),
    ).toThrow(TenantScopeError);
  });

  it("allows matching workspace and brand", () => {
    expect(() =>
      assertChildMatchesParentScope(
        { workspaceId: "ws-a", brandId: "brand-a" },
        { workspaceId: "ws-a", brandId: "brand-a" },
      ),
    ).not.toThrow();
  });
});
