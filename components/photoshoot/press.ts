import { shootRequestKey, type Shoot, type ShootRequest } from "@/shared";
import { makePresser as core, refused } from "@/lib/presser";
import { loadPlanCredits } from "@/lib/plan-credits";
import { stale } from "@/lib/signed-links";
import { fetchShared, putShared, sharedAt, sharedResponse } from "@/components/workspace/use-job";
import { photoshootApi, shootUrl, shootsUrl } from "./api";
import { prependShoot } from "./shoot";

/** Generate / Try again / Variation: the shared presser (lib/presser.ts) keyed by the request's fields, whatever their order (shootRequestKey). */
export const makePresser = (send: (r: ShootRequest, requestId: string) => Promise<Shoot>, newId?: () => string) =>
  core<ShootRequest, Shoot>(send, shootRequestKey, newId);

// ponytail: a fixed pause, not a per-shoot lock. The presser clears its id on success, so a press right after one that
// succeeded is a new shoot and a new charge. Generate / Try again stay off this long after a success so a held Enter's
// repeat (or a click that lands just after the answer) can't press again. A deliberate press after it is a new shoot.
export const PRESS_COOLDOWN_MS = 1500;

// Lifted to lib/presser.ts (reels use them too); re-exported so the photoshoot's imports stay as they were.
export { isRepeatClick, pressErrorText } from "@/lib/presser";

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

/** How long after a press with an unknown outcome the list and balance are read once more. */
export const REREAD_AFTER_UNKNOWN_MS = 15_000;

// One timer for the tab: a later unknown press replaces it rather than stacking another. Ceiling: an unknown press for
// another brand within 15 s drops the first brand's late read (its list reads again when next opened).
let rereadTimer: ReturnType<typeof setTimeout> | undefined;

/** Reads the list and the balance now, and once more later: a timed-out or 504 press may still be inside createShoot. */
function readAfterUnknown(w: string, b: string) {
  const read = () => {
    void fetchShared(shootsUrl(w, b), true).catch(() => undefined);
    void loadPlanCredits(w, true);
  };
  read();
  clearTimeout(rereadTimer);
  rereadTimer = setTimeout(read, REREAD_AFTER_UNKNOWN_MS);
}

/**
 * Generate / Try again (studio) and Variation (shoot page): presses, shows the new shoot everywhere at once, and reads
 * the balance again after the charge. A press whose outcome is unknown may still have started (and charged) a shoot,
 * so the list and the balance are read again then too, and once more 15 s later (with nothing running the list
 * doesn't poll). Rejects with the press's error; the caller shows it with pressErrorText.
 */
export async function pressAndShow(w: string, b: string, r: ShootRequest): Promise<Shoot> {
  let shoot: Shoot;
  try {
    shoot = await pressShoot(w, b, r);
  } catch (e) {
    if (!refused(e)) readAfterUnknown(w, b);
    throw e;
  }
  showCreated(w, b, shoot);
  void loadPlanCredits(w, true);
  return shoot;
}
