import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { passwordSignIn, PasswordSignInInput } from "@/server/services/mobile-auth";

/** Mobile app: email + password sign-in → Bearer token. */
export async function POST(request: Request) {
  const body = PasswordSignInInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Enter your email and password.");
  try {
    return Response.json(await passwordSignIn(body.data, request));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
