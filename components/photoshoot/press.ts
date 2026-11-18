import type { Shoot, ShootRequest } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { requestId } from "@/lib/net";
import { photoshootApi } from "./api";

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
