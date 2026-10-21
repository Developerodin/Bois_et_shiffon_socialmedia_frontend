import { z } from "zod";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { acceptInvitation } from "@/server/services/accounts";

const Body = z.object({ token: z.string().min(10), name: z.string().trim().max(80).optional(), password: z.string().max(200).optional() });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Invalid request");
  try {
    await acceptInvitation(body.data);
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
