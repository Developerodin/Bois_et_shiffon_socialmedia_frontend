import { Prisma, type BrandContextDoc } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

/** The five Okara-style strategy documents every agent reads (design §4.1). */
export const CONTEXT_DOC_KINDS = [
  { kind: "product-information", title: "Product information" },
  { kind: "marketing-strategy", title: "Marketing strategy" },
  { kind: "competitor-analysis", title: "Competitor analysis" },
  { kind: "brand-voice", title: "Brand voice" },
  { kind: "content-strategy", title: "Content strategy" },
] as const;

export type ContextDocKind = (typeof CONTEXT_DOC_KINDS)[number]["kind"];
export type DocSource = { url: string; title: string | null };

export class ContextDocConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextDocConflictError";
  }
}

export function isContextDocKind(kind: string): kind is ContextDocKind {
  return CONTEXT_DOC_KINDS.some((k) => k.kind === kind);
}

export function toDocDto(d: BrandContextDoc) {
  return {
    id: d.id,
    version: d.version,
    status: d.status,
    markdown: d.markdown,
    sources: d.sources as DocSource[],
    createdAt: d.createdAt.toISOString(),
    createdBy: d.createdByUserId ? ("user" as const) : ("agent" as const),
    confirmedAt: d.confirmedAt?.toISOString() ?? null,
  };
}

export async function listContextDocs(workspaceId: string, brandId: string) {
  const docs = await prisma.brandContextDoc.findMany({
    where: { workspaceId, brandId },
    orderBy: { version: "desc" },
  });
  return CONTEXT_DOC_KINDS.map(({ kind, title }) => {
    const ofKind = docs.filter((d) => d.kind === kind);
    const latest = ofKind[0] ?? null;
    const confirmed = ofKind.find((d) => d.status === "CONFIRMED") ?? null;
    return { kind, title, latest: latest && toDocDto(latest), confirmed: confirmed && toDocDto(confirmed) };
  });
}

/** Latest confirmed markdown per kind — what agents are allowed to treat as brand truth. */
export async function confirmedContext(workspaceId: string, brandId: string) {
  const docs = await prisma.brandContextDoc.findMany({
    where: { workspaceId, brandId, status: "CONFIRMED" },
  });
  return Object.fromEntries(docs.map((d) => [d.kind, d.markdown])) as Partial<Record<ContextDocKind, string>>;
}

/** Latest markdown per kind, draft or confirmed — what agents read. */
export async function latestContext(workspaceId: string, brandId: string) {
  const docs = await listContextDocs(workspaceId, brandId);
  return Object.fromEntries(docs.flatMap((d) => (d.latest ? [[d.kind, d.latest.markdown]] : []))) as Partial<Record<ContextDocKind, string>>;
}

/**
 * New DRAFT version. `baseVersion` (user edits) must equal the current latest,
 * so two people editing at once can't silently overwrite each other.
 */
export async function saveDraft(input: {
  workspaceId: string;
  brandId: string;
  kind: ContextDocKind;
  markdown: string;
  sources?: DocSource[];
  baseVersion?: number | null;
  userId?: string;
  agentRunId?: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.brandContextDoc.findFirst({
        where: { brandId: input.brandId, kind: input.kind },
        orderBy: { version: "desc" },
      });
      if (input.baseVersion !== undefined && (latest?.version ?? null) !== input.baseVersion) {
        throw new ContextDocConflictError("Document changed since you opened it");
      }
      const doc = await tx.brandContextDoc.create({
        data: {
          workspaceId: input.workspaceId,
          brandId: input.brandId,
          kind: input.kind,
          version: (latest?.version ?? 0) + 1,
          markdown: input.markdown,
          sources: (input.sources ?? latest?.sources ?? []) as Prisma.InputJsonValue,
          createdByUserId: input.userId,
          agentRunId: input.agentRunId,
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          brandId: input.brandId,
          actorUserId: input.userId,
          action: "context_doc.draft_saved",
          entityType: "BrandContextDoc",
          entityId: doc.id,
          metadata: { kind: input.kind, version: doc.version, agentRunId: input.agentRunId ?? null },
        },
      });
      return doc;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ContextDocConflictError("Another version was saved at the same time");
    }
    throw error;
  }
}

/** Confirm the latest version; the previously confirmed one becomes SUPERSEDED. */
export async function confirmDoc(input: {
  workspaceId: string;
  brandId: string;
  kind: ContextDocKind;
  version: number;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.brandContextDoc.findFirst({
      where: { workspaceId: input.workspaceId, brandId: input.brandId, kind: input.kind },
      orderBy: { version: "desc" },
    });
    if (!latest || latest.version !== input.version) {
      throw new ContextDocConflictError("Only the latest version can be confirmed");
    }
    if (latest.status === "CONFIRMED") return latest;
    await tx.brandContextDoc.updateMany({
      where: { brandId: input.brandId, kind: input.kind, status: "CONFIRMED" },
      data: { status: "SUPERSEDED" },
    });
    const doc = await tx.brandContextDoc.update({
      where: { id: latest.id },
      data: { status: "CONFIRMED", confirmedByUserId: input.userId, confirmedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        actorUserId: input.userId,
        action: "context_doc.confirmed",
        entityType: "BrandContextDoc",
        entityId: doc.id,
        metadata: { kind: input.kind, version: doc.version },
      },
    });
    return doc;
  });
}
