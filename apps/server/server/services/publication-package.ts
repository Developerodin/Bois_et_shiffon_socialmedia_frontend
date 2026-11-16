/**
 * Stage 0 stub — sealed PublicationPackage lifecycle (Screen 8.3).
 * @see docs/DATA_MODEL.md PublicationPackage, ApprovalDecision
 */

export type PublicationPackageId = string;

export type PublicationPackageStub = {
  id: PublicationPackageId;
  workspaceId: string;
  brandId: string;
  contentDraftId: string;
  packageHash: string;
  sealedAt: Date | null;
};

export type SealPackageInput = {
  workspaceId: string;
  brandId: string;
  contentDraftId: string;
};

/**
 * TODO(Screen 8): Compute packageHash from media, variant URLs, snapshots (DEC-016).
 */
export async function sealPublicationPackage(
  input: SealPackageInput,
): Promise<PublicationPackageStub> {
  void input;
  throw new Error("PublicationPackage seal not implemented — Screen 8");
}

/**
 * TODO(Screen 9): Publish service asserts valid package + matching ApprovalDecision.
 */
export async function assertPublishablePackage(
  packageId: PublicationPackageId,
): Promise<void> {
  void packageId;
  throw new Error("PublicationPackage publish guard not implemented — Screen 9");
}
