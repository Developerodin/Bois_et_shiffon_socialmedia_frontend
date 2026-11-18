import type { Shoot, ShootRequest } from "@/shared";
import { ApiError, errorMessage } from "@/components/settings/api";
import { refusalOf } from "@/lib/paywall";
import { requestId } from "@/lib/net";
import { loadPlanCredits } from "@/lib/plan-credits";
import { stale } from "@/lib/signed-links";
import { fetchShared, putShared, sharedAt, sharedResponse } from "@/components/workspace/use-job";
import { photoshootApi, shootUrl, shootsUrl } from "./api";
import { prependShoot } from "./shoot";

/**
 * Generate / Try again / Variation: sends `request` with a request id. The last press that got no answer (timeout,
 * offline: request() throws those as ApiError status 0) keeps its id, so pressing again for the same request reuses
 * it and the server returns that shoot instead of charging twice. Success, or any answer from the server, clears it:
 * the next press is a new shoot. The id is recorded before sending, so two overlapping presses share it.
 * Every error is rethrown for the caller to show.
 * Same rule as the phone's startShoot (mobile src/ui/photoshoot/start.ts): keep the two in step.
 */
export function makePresser(
  send: (r: ShootRequest, requestId: string) => Promise<Shoot>,
  newId: () => string = requestId,
): (r: ShootRequest) => Promise<Shoot> {
  let unanswered: { key: string; id: string } | null = null;
  return async (r) => {
    const key = JSON.stringify(r);
    const id = unanswered?.key === key ? unanswered.id : newId();
    const mine = (unanswered = { key, id });
    try {
      const shoot = await send(r, id);
      if (unanswered === mine) unanswered = null;
      return shoot;
    } catch (e) {
      if (e instanceof ApiError && e.status > 0 && unanswered === mine) unanswered = null; // the server answered
      throw e;
    }
  };
}

// ponytail: a fixed pause, not a per-shoot lock. The presser clears its id on success, so a press right after one that
// succeeded is a new shoot and a new charge. Generate / Try again stay off this long after a success so a held Enter's
// repeat (or a click that lands just after the answer) can't press again. A deliberate press after it is a new shoot.
export const PRESS_COOLDOWN_MS = 1500;

/** The second (or later) click of a double-click: ignored, so it never presses a paid button again. */
export const isRepeatClick = (e: { detail: number }): boolean => e.detail > 1;

// One presser per brand for the page's life, like the phone's module state: leaving the studio and coming back
// still reuses an unanswered id. Ceiling: one small entry per brand pressed in this tab; nothing is evicted.
const pressers = new Map<string, (r: ShootRequest) => Promise<Shoot>>();

/** Presses Generate (or Try again, Variation) for brand `b` of workspace `w`; resolves to the queued shoot. */
export function pressShoot(w: string, b: string, r: ShootRequest): Promise<Shoot> {
  const scope = JSON.stringify([w, b]);
  let press = pressers.get(scope);
  if (!press) pressers.set(scope, (press = makePresser((req, id) => photoshootApi.create(w, b, req, id))));
  return press(r);
}

/** A shoot just created shows at once: on its own URL, and first in the list (which then polls, as it holds a RUNNING shoot). */
function showCreated(w: string, b: string, shoot: Shoot) {
  putShared(shootUrl(w, b, shoot.id), { shoot });
  const list = shootsUrl(w, b);
  const old = sharedResponse(list) as { shoots: Shoot[] } | undefined;
  // No list read yet, or one whose links have expired (putting it would date them now): read it again instead.
  // A read already out may predate the shoot, so this one waits for it and goes after.
  if (old && !stale(sharedAt(list))) putShared(list, { shoots: prependShoot(old.shoots, shoot) });
  else void fetchShared(list, true).catch(() => undefined);
}

/**
 * Generate / Try again (studio) and Variation (shoot page): presses, shows the new shoot everywhere at once, and reads
 * the balance again after the charge. Rejects with the press's error; the caller shows it with pressErrorText.
 */
export async function pressAndShow(w: string, b: string, r: ShootRequest): Promise<Shoot> {
  const shoot = await pressShoot(w, b, r);
  showCreated(w, b, shoot);
  void loadPlanCredits(w, true);
  return shoot;
}

/** What to say when a press fails: null for a 402 that opened the paywall (it says it), else the server's sentence or a generic one. */
export function pressErrorText(e: unknown): string | null {
  if (e instanceof ApiError && e.status === 402 && refusalOf(e.data)) return null;
  return errorMessage(e);
}
