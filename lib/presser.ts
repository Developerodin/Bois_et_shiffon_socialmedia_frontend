import { shouldKeepRequestId } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { requestId } from "@/lib/net";

/** The server answered a press with a refusal, so it charged nothing (see shouldKeepRequestId, shared/photoshoot.ts). */
const refused = (e: unknown): boolean => e instanceof ApiError && !shouldKeepRequestId(e.status);

/** The server already used (and refunded) this id: a kept id after a 5xx whose job the server had failed. */
const idTaken = (e: unknown): boolean => e instanceof ApiError && e.status === 409 && e.code === "request.idTaken";

/**
 * A paid press with a request id. The last press whose outcome is unknown keeps its id: no answer (timeout, offline,
 * a gateway page: request() throws those as ApiError status 0) or a server error (5xx, maybe after the charge).
 * Pressing again for the same request (same `keyOf`) reuses it and the server returns that job instead of charging
 * twice. Success, or a refusal (4xx), clears it: the next press is new. The id is recorded before sending, so two
 * overlapping presses share it. A 409 `request.idTaken` (the kept id's try was refunded) is retried once, silently,
 * with a new id; never twice, so it can't loop. Every other error is rethrown for the caller to show.
 * Same rule as the phone's startShoot (mobile src/ui/photoshoot/start.ts): keep the two in step.
 */
export function makePresser<R, T>(
  send: (r: R, requestId: string) => Promise<T>,
  keyOf: (r: R) => string,
  newId: () => string = requestId,
): (r: R) => Promise<T> {
  let unanswered: { key: string; id: string } | null = null;
  const press = async (r: R, retried: boolean): Promise<T> => {
    const key = keyOf(r);
    const id = !retried && unanswered?.key === key ? unanswered.id : newId();
    const mine = (unanswered = { key, id });
    try {
      const out = await send(r, id);
      if (unanswered === mine) unanswered = null;
      return out;
    } catch (e) {
      if (refused(e) && unanswered === mine) unanswered = null;
      if (!retried && idTaken(e)) return press(r, true);
      throw e;
    }
  };
  return (r) => press(r, false);
}
