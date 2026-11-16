import { adminOnly, notFoundResponse } from "@/server/api/admin-route";
import { prisma } from "@/server/db/prisma";
import { recordPersonView } from "@/server/services/platform-admin";

/** Platform admin → record that they opened this person's page, in the audit log. */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const { userId } = await context.params;
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) return notFoundResponse();
  await recordPersonView(userId, admin);
  return Response.json({ ok: true });
}
