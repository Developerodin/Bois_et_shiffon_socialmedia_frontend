import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { PhoneCodeInput, verifyPhoneCode } from "@/server/services/mobile-auth";

/** Mobile app: a texted code → Bearer token, or { needsEmail, phoneTicket } for a new number. */
export async function POST(request: Request) {
  const body = PhoneCodeInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Enter your number and the 6-digit code.");
  try {
    return Response.json(await verifyPhoneCode(body.data, request));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
