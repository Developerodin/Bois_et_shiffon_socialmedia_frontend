import { AppState } from "react-native";
import { ApiError } from "@/api/client";
import { reels } from "@/api/endpoints";
import { enablePush } from "@/ui/push";

/**
 * Renders started on this phone, followed until they're done or have failed, whatever screen is open: the root's
 * ReadyBanner says so. Each look also nudges the render along on the server (the reel detail route kicks due jobs).
 * ponytail: in memory, so a render isn't followed after the app restarts or one started on another device; push
 * notifications cover those (ui/push.ts). A reel this business can't read (deleted, or no longer allowed) is dropped,
 * and switching business or signing out drops them all (reads use the current business): push covers those too.
 */
export type RenderFinished = { id: string; title: string; ok: boolean };
const POLL_MS = 10_000;
const watching = new Set<string>();
const listeners = new Set<(f: RenderFinished) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function stopIfIdle() {
  if (!watching.size && timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function look() {
  for (const id of [...watching]) {
    const d = await reels.get(id).catch((e: unknown) => {
      // Gone or not this business's: it will never be readable, so stop asking. Other errors are a blip: ask again.
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) watching.delete(id);
      return null;
    });
    const step = d?.renders[0]?.step;
    if (!d || (step !== "DONE" && step !== "FAILED")) continue;
    watching.delete(id);
    listeners.forEach((fn) => fn({ id, title: d.item.title, ok: step === "DONE" }));
  }
  stopIfIdle();
}

/** Switching business, signing out, or an expired sign-in: stop following every render. */
export function forgetRenders() {
  watching.clear();
  stopIfIdle();
}

// Back in the app after a while: look at once rather than up to 10 s later.
AppState.addEventListener("change", (s) => s === "active" && watching.size > 0 && void look());

/** "Make video" / "Try again": starts the render, then follows it. The first time also asks to send notifications. */
export async function startRender(id: string, version: number) {
  void enablePush();
  const r = await reels.render(id, version);
  watching.add(id);
  timer ??= setInterval(() => void look(), POLL_MS);
  return r;
}

export const onRenderFinished = (fn: (f: RenderFinished) => void) => (listeners.add(fn), () => void listeners.delete(fn));
