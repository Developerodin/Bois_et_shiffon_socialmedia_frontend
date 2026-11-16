import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { invalid } from "@/server/api/workspace-route";
import { requestUserId } from "@/server/auth/request-user";
import { forgetPushDevice, PushDeviceInput, registerPushDevice } from "@/server/notifications/push";

const unauthorized = () => problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });

/** The phone app registers for push notifications (token + the notification texts in its language). */
export async function POST(request: Request) {
  const userId = await requestUserId(request);
  if (!userId) return unauthorized();
  const body = PushDeviceInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues[0]?.message ?? "Invalid push token");
  await registerPushDevice(userId, body.data);
  return Response.json({ ok: true });
}

/** Signing out: this phone stops getting notifications. */
export async function DELETE(request: Request) {
  const userId = await requestUserId(request);
  if (!userId) return unauthorized();
  const body = z.object({ token: z.string().min(1).max(300) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Missing token");
  await forgetPushDevice(userId, body.data.token);
  return Response.json({ ok: true });
}
