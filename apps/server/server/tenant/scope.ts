export class TenantScopeError extends Error {
  readonly code = "TENANT_SCOPE_MISMATCH";

  constructor(message = "Tenant scope mismatch") {
    super(message);
    this.name = "TenantScopeError";
  }
}

export type TenantScope = {
  workspaceId: string;
  brandId?: string;
};

/**
 * AT-002 / AT-021 — child records must align with parent workspace (and brand when set).
 */
export function assertChildMatchesParentScope(
  parent: TenantScope,
  child: TenantScope,
) {
  if (parent.workspaceId !== child.workspaceId) {
    throw new TenantScopeError("Child workspaceId does not match parent");
  }
  if (
    parent.brandId &&
    child.brandId &&
    parent.brandId !== child.brandId
  ) {
    throw new TenantScopeError("Child brandId does not match parent");
  }
}
