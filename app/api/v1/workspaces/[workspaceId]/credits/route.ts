import { requestUserId } from "@/server/auth/request-user";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { requireWorkspaceMember } from "@/server/auth/access";
import { creditBalance } from "@/server/services/credits";

/** The workspace's credit balance (mobile module header). Any member sees it, as R03 already shows it. */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const userId = await requestUserId(request);
  if (!userId) {
    return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  }
  const { workspaceId } = await context.params;
  try {
    await requireWorkspaceMember(workspaceId, userId);
    return Response.json({ credits: await creditBalance(workspaceId) });
  } catch (error) {
    return fromAccessError(error);
  }
}
