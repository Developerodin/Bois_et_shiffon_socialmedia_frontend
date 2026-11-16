/**
 * Job payload validation (AT-020, AT-022). Claiming lives in queue.ts.
 */

export type BrandScopedJobPayload = {
  workspaceId: string;
  brandId: string;
  entityRefs?: Array<{ kind: string; id: string; brandId: string }>;
  productId?: string;
  productBrandId?: string;
};

export class JobValidationError extends Error {
  readonly code = "JOB_VALIDATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "JobValidationError";
  }
}

/**
 * AT-020 — reject payloads that reference multiple brands before provider call.
 */
export function validateAiWorkflowPayload(payload: BrandScopedJobPayload) {
  const refs = payload.entityRefs ?? [];
  for (const ref of refs) {
    if (ref.brandId !== payload.brandId) {
      throw new JobValidationError(
        "Job payload references entities from multiple brands",
      );
    }
  }
}

/**
 * AT-022 — product must belong to job brandId.
 */
export function validateJobProductScope(payload: BrandScopedJobPayload) {
  if (!payload.productId) {
    return;
  }
  if (payload.productBrandId && payload.productBrandId !== payload.brandId) {
    throw new JobValidationError(
      "Job productId does not belong to job brandId",
    );
  }
}
