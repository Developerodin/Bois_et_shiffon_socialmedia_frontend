import { prisma } from "@/server/db/prisma";

// ── Recording page visits ───────────────────────────────────────────────────

/** Not recorded: the admin console (its visits are audited instead), the API, and invitation links (live token in the path). */
const UNRECORDED = ["/admin", "/api", "/invite"];

/**
 * The path worth keeping, or null. The query and fragment are dropped: search boxes put what people typed into `?q=`,
 * and that isn't ours to keep.
 */
export function cleanPagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) return null;
  if (UNRECORDED.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return path;
}

/**
 * Write one visit. The workspace and project are kept only if the person is a member and the project is in that
 * workspace, so a client never files a row somewhere it doesn't belong. With no workspace sent (the mobile app), the
 * visit goes under the person's only workspace, or none if they have several.
 */
export async function recordPageView({ userId, platform, path, workspaceId, brandId }: { userId: string; platform: "web" | "mobile"; path: string; workspaceId?: string; brandId?: string }) {
  let ws: string | null = null;
  if (workspaceId) {
    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
    ws = member ? workspaceId : null;
  } else {
    const mine = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true }, take: 2 });
    ws = mine.length === 1 ? mine[0].workspaceId : null;
  }
  const brand = ws && brandId ? await prisma.brand.findFirst({ where: { id: brandId, workspaceId: ws }, select: { id: true } }) : null;
  await prisma.pageView.create({ data: { userId, platform, path, workspaceId: ws, brandId: brand ? brandId! : null } });
}
