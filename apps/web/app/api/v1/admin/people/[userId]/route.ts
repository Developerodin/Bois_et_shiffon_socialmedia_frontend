import type { AdminPerson } from "@espanda/shared";
import { adminOnly, notFoundResponse, wire } from "@/server/api/admin-route";
import { personDetail, platformLogs } from "@/server/services/platform-admin";

/** Platform admin → one person across the platform: every workspace and project they're in, and their latest audit entries. Opening them is recorded by POST .../visit. */
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const { userId } = await context.params;
  const p = await personDetail(userId);
  if (!p) return notFoundResponse();
  const audit = (await platformLogs({ kind: "audit", actorIds: [userId] })).rows.slice(0, 15);
  return Response.json(wire({ ...p, audit }) satisfies AdminPerson);
}
