import { requestUserId } from "@/server/auth/request-user";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { requireWorkspaceMember } from "@/server/auth/access";
import { hasUnlimitedCredits } from "@/server/services/credits";
import { activePlan, PLANS } from "@/server/services/subscriptions";

/**
 * The workspace's plan (null = none) and the plans on offer (mobile "06 No subscription"). `unlimited`: a testing
 * workspace that counts as planned. No prices yet: the app says pricing isn't available.
 */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const userId = await requestUserId(request);
  if (!userId) return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  const { workspaceId } = await context.params;
  try {
    await requireWorkspaceMember(workspaceId, userId);
    return Response.json({
      plan: await activePlan(workspaceId),
      unlimited: hasUnlimitedCredits(workspaceId),
      plans: Object.entries(PLANS).map(([id, p]) => ({ id, credits: p.credits })),
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
