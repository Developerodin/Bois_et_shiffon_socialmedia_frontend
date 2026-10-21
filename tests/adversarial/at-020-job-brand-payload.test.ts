/**
 * AT-020 — AI job payload must not mix entity ids from multiple brands.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { describe, expect, it } from "vitest";
import {
  JobValidationError,
  validateAiWorkflowPayload,
} from "@/server/jobs/claim";

describe("AT-020 AI workflow job brand isolation", () => {
  it("rejects entity refs from another brand", () => {
    expect(() =>
      validateAiWorkflowPayload({
        workspaceId: "ws-1",
        brandId: "brand-a",
        entityRefs: [
          { kind: "draft", id: "d1", brandId: "brand-a" },
          { kind: "product", id: "p1", brandId: "brand-b" },
        ],
      }),
    ).toThrow(JobValidationError);
  });

  it("accepts refs scoped to job brandId", () => {
    expect(() =>
      validateAiWorkflowPayload({
        workspaceId: "ws-1",
        brandId: "brand-a",
        entityRefs: [{ kind: "draft", id: "d1", brandId: "brand-a" }],
      }),
    ).not.toThrow();
  });
});
