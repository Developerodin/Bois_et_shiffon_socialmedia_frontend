import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { emailConfigured } from "@/server/email/outbox";
import { RegisterInput, startRegistration } from "@/server/services/mobile-auth";

/** Mobile app: start an email + password account; emails a 6-digit code to prove the address. */
export async function POST(request: Request) {
  const body = RegisterInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Enter your email and a password.");
  if (!emailConfigured()) return Response.json({ ok: false, emailConfigured: false }, { status: 503 });
  try {
    await startRegistration(body.data, request);
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
