import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { emailConfigured } from "@/server/email/outbox";
import { kickRunner } from "@/server/jobs/runner";
import { EmailInput, sendEmailCode } from "@/server/services/mobile-auth";

// Queued email runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

/** Mobile app: email a 6-digit sign-in code. Same 202 for every valid email: no account enumeration. */
export async function POST(request: Request) {
  if (!emailConfigured()) return Response.json({ ok: false, emailConfigured: false }, { status: 503 });
  const body = EmailInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Enter a valid email address.");
  try {
    await sendEmailCode(body.data, request);
    kickRunner();
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
