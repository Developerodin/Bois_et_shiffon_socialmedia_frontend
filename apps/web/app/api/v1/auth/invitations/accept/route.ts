import { cookies } from "next/headers";
import { z } from "zod";
import { SHELL_COOKIE_BRAND, SHELL_COOKIE_MAX_AGE, SHELL_COOKIE_WORKSPACE } from "@espanda/shared";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { acceptInvitation } from "@/server/services/accounts";

const Body = z.object({ token: z.string().min(10), name: z.string().trim().max(80).optional(), password: z.string().max(200).optional() });

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Invalid request");
  try {
    const joined = await acceptInvitation(body.data);
    // Open what they were invited to on first sign-in (not their own empty workspace).
    const cookieStore = await cookies();
    const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: SHELL_COOKIE_MAX_AGE };
    cookieStore.set(SHELL_COOKIE_WORKSPACE, joined.workspaceId, opts);
    if (joined.brandId) cookieStore.set(SHELL_COOKIE_BRAND, joined.brandId, opts);
    else cookieStore.delete(SHELL_COOKIE_BRAND);
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
