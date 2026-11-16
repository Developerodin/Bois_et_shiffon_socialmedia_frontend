import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { GoogleInput, verifyGoogleSignIn } from "@/server/services/mobile-auth";

/** Mobile app: exchange a Google ID token for a Bearer token. */
export async function POST(request: Request) {
  const body = GoogleInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Google sign-in didn't go through. Try again.");
  try {
    return Response.json(await verifyGoogleSignIn(body.data, request));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
