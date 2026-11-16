import { z } from "zod";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { resetPassword } from "@/server/services/accounts";

export async function POST(request: Request) {
  const body = z.object({ token: z.string().min(10), password: z.string().max(200) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Invalid request");
  try {
    await resetPassword(body.data.token, body.data.password);
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
