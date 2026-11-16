import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse } from "@/server/api/workspace-route";
import { previewInvitation } from "@/server/services/accounts";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return Response.json(await previewInvitation((await context.params).token));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
