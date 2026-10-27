import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { PhoneInput, sendPhoneCode } from "@/server/services/mobile-auth";

/** Mobile app: text a 6-digit sign-in code (Twilio Verify). */
export async function POST(request: Request) {
  const body = PhoneInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Enter a valid mobile number.");
  try {
    await sendPhoneCode(body.data, request);
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
