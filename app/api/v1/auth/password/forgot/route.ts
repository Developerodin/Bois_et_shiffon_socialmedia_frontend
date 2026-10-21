import { z } from "zod";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse } from "@/server/api/workspace-route";
import { clientIp } from "@/server/auth/rate-limit";
import { kickRunner } from "@/server/jobs/runner";
import { requestPasswordReset } from "@/server/services/accounts";

export async function POST(request: Request) {
  const body = z.object({ email: z.string().trim().email() }).safeParse(await request.json().catch(() => null));
  // Same 202 for malformed and unknown emails: no account enumeration.
  if (!body.success) return Response.json({ ok: true }, { status: 202 });
  try {
    await requestPasswordReset(body.data.email, clientIp(request));
    kickRunner();
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
