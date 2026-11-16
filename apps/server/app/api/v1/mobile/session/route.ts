import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { CodeInput, verifyEmailCode } from "@/server/services/mobile-auth";

/** Mobile app: exchange an emailed code for a Bearer token (sent as `Authorization: Bearer …`). */
export async function POST(request: Request) {
  const body = CodeInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Enter your email and the 6-digit code.");
  try {
    return Response.json(await verifyEmailCode(body.data, request));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
