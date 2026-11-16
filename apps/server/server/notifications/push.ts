import { z } from "zod";
import { prisma } from "@/server/db/prisma";

/**
 * Push notifications to the phone app, through Expo's push service (it hands Android to Firebase and iOS to Apple).
 * The app registers each phone with the notification texts already in its language; we only fill in {title}.
 * ponytail: one send per finished render, no queue or retry; a missed notification still leaves the reel in the
 * app's Results list. Expo's receipts (delivery confirmations) aren't read; add them if delivery needs proving.
 */
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

const Message = z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(200) });
/** What the app sends when it registers: its token and the two notifications, worded in its language. */
export const PushDeviceInput = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/),
  platform: z.enum(["android", "ios"]),
  messages: z.object({ ready: Message, failed: Message }),
});
type Messages = z.infer<typeof PushDeviceInput>["messages"];

/** A phone signs in: it's now this person's (a phone that changed hands moves to them). */
export async function registerPushDevice(userId: string, input: z.infer<typeof PushDeviceInput>) {
  await prisma.pushDevice.upsert({
    where: { token: input.token },
    create: { userId, token: input.token, platform: input.platform, messages: input.messages },
    update: { userId, platform: input.platform, messages: input.messages },
  });
}

/** Signing out: this phone stops getting this person's notifications. */
export async function forgetPushDevice(userId: string, token: string) {
  await prisma.pushDevice.deleteMany({ where: { userId, token } });
}

/**
 * "Your reel is ready" / "couldn't be made" to every phone of the person who started the render. Never throws: a
 * notification that can't be sent must not fail or retry the render. Phones Expo says no longer exist are dropped.
 */
export async function notifyReelFinished(userId: string, reel: { itemId: string; title: string; ok: boolean }) {
  try {
    const devices = await prisma.pushDevice.findMany({ where: { userId } });
    if (!devices.length) return;
    const fill = (s: string) => s.replace("{title}", reel.title).slice(0, 200);
    const sent = devices.map((d) => {
      const m = (d.messages as Messages)[reel.ok ? "ready" : "failed"];
      return { to: d.token, title: fill(m.title), body: fill(m.body), sound: "default", channelId: "reels", data: { reelId: reel.itemId, ok: reel.ok } };
    });
    const res = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(sent),
      signal: AbortSignal.timeout(15_000),
    });
    const tickets = ((await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] }).data ?? [];
    const gone = tickets.flatMap((t, i) => (t.details?.error === "DeviceNotRegistered" ? [devices[i].token] : []));
    if (gone.length) await prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
  } catch (e) {
    console.warn("[push] couldn't send the reel notification:", e instanceof Error ? e.message : e);
  }
}
