import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { EmailInput, emailNextStep } from "@/server/services/mobile-auth";

/** Mobile app, email-first sign-in: { next: "password" | "code" | "register" } for this email. */
export async function POST(request: Request) {
  const body = EmailInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Enter a valid email address.");
  try {
    return Response.json(await emailNextStep(body.data, request));
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
