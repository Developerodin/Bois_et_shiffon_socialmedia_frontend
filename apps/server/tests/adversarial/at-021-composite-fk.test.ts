/**
 * AT-021 — Child insert with mismatched (workspaceId, brandId) parent.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { describe, expect, it } from "vitest";
import {
  assertChildMatchesParentScope,
  TenantScopeError,
} from "@/server/tenant/scope";

describe("AT-021 composite tenant parent match", () => {
  it("rejects child brandId that does not match parent brandId", () => {
    expect(() =>
      assertChildMatchesParentScope(
        { workspaceId: "ws-1", brandId: "brand-a" },
        { workspaceId: "ws-1", brandId: "brand-b" },
      ),
    ).toThrow(TenantScopeError);
  });

  it("allows child when parent has no brand constraint", () => {
    expect(() =>
      assertChildMatchesParentScope(
        { workspaceId: "ws-1" },
        { workspaceId: "ws-1", brandId: "brand-a" },
      ),
    ).not.toThrow();
  });
});
