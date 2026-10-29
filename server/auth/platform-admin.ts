import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { problemResponse } from "@/server/api/http-error";
import { requestUserId } from "@/server/auth/request-user";
import { prisma } from "@/server/db/prisma";

/**
 * Platform-wide settings (AI models) are for platform admins only: User.isPlatformAdmin, set directly in the
 * database. No workspace role grants it, since every workspace has its own owner.
 * Returns the user id, or the 401/403 response to send.
 */
export async function platformAdmin(request: Request): Promise<string | Response> {
  const userId = await requestUserId(request);
  if (!userId) return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401, detail: "Sign in required" });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true, status: true } });
  if (!user?.isPlatformAdmin || user.status !== "ACTIVE") {
    return problemResponse({ type: "https://api.brandpilot/errors/access-denied", title: "Access denied", status: 403, detail: "Only platform admins can change AI models." });
  }
  return userId;
}

export const isPlatformAdmin = async (userId: string) =>
  !!(await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } }))?.isPlatformAdmin;

/**
 * For every /admin page: signed out → sign in; not a platform admin → a plain 404, so the console's existence isn't
 * revealed. Each page calls it (a layout alone doesn't guard the page's own data loading). Returns the user id.
 */
// cache(): the layout and the page both call it; one check (two queries) per request instead of two.
export const requirePlatformAdminPage = cache(async (): Promise<string> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isPlatformAdmin(session.user.id))) notFound();
  return session.user.id;
});
