import { requestUserId } from "@/server/auth/request-user";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { requireWorkspaceMember } from "@/server/auth/access";
import { prisma } from "@/server/db/prisma";
import { listAccessibleBrands } from "@/server/services/brands";
import { creditBalance } from "@/server/services/credits";

/** What a ledger line was for, in words the app translates (mobile Business M11). */
type Kind = "reel" | "calendar" | "agent" | "audit" | "refund" | "added";
const kindOf = (reason: string): Kind =>
  reason === "reel-render" ? "reel"
  : reason === "agent-run:planner" ? "calendar"
  : reason.startsWith("agent-run:") ? "agent"
  : reason === "site-audit" ? "audit"
  : reason === "refund" ? "refund"
  : "added"; // initial-grant, manual-grant, top-up

/**
 * The workspace's credit balance (mobile module headers). Any member sees it, as R03 already shows it.
 * `?history=1` adds the last 20 ledger lines (Business M11), each reel charge or refund named after its reel.
 */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const userId = await requestUserId(request);
  if (!userId) {
    return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  }
  const { workspaceId } = await context.params;
  try {
    await requireWorkspaceMember(workspaceId, userId);
    const credits = await creditBalance(workspaceId);
    if (new URL(request.url).searchParams.get("history") !== "1") return Response.json({ credits });

    // Zero lines are bookkeeping (a charge in a workspace with unlimited credits): not shown.
    const rows = await prisma.creditEntry.findMany({ where: { workspaceId, delta: { not: 0 } }, orderBy: { createdAt: "desc" }, take: 20 });
    // A reel's charge and its refund carry the render's chargeId as refId.
    // Named only for businesses this person can open (a member with one project's grant sees the others' lines unnamed).
    const brandIds = (await listAccessibleBrands(workspaceId, userId)).map((b) => b.id);
    const renders = await prisma.reelRender.findMany({
      where: { workspaceId, brandId: { in: brandIds }, chargeId: { in: rows.flatMap((r) => (r.refId ? [r.refId] : [])) } },
      select: { chargeId: true, item: { select: { title: true } } },
    });
    const reelTitle = new Map(renders.map((r) => [r.chargeId, r.item.title]));
    return Response.json({
      credits,
      history: rows.map((r) => ({ id: r.id, kind: kindOf(r.reason), delta: r.delta, at: r.createdAt, name: (r.refId && reelTitle.get(r.refId)) || null })),
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
