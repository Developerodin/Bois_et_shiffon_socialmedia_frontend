import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { completeRegistration, RegisterVerifyInput } from "@/server/services/mobile-auth";

/** Mobile app: the emailed code checks out → the account is created with its password → Bearer token. */
export async function POST(request: Request) {
  const body = RegisterVerifyInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Enter the 6-digit code.");
  try {
    return Response.json(await completeRegistration(body.data, request));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
