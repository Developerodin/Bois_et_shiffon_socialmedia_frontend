import { answeredTurn, type PlanResult, type ReelDetail } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { makePresser } from "@/lib/presser";

/**
 * A plan is written over a streamed call (NDJSON). When the stream drops (status 0) or the server says another turn is
 * still being written (409 reel.stillPlanning), the turn may still land: poll the reel until we can tell, and never send
 * it twice (the presser keeps the request id for a resend).
 */
export const RECOVER_EVERY_MS = 3000;
// Longer than the server's 150 s in-flight marker: a send waits up to 120 s (SLOW_MS), then recovery up to 180 s.
export const RECOVER_CAP_MS = 180_000;
export type Deps = { sleep: (ms: number) => Promise<void>; now: () => number; alive: () => boolean };
export const TOO_LONG = "The reply is taking too long. Check back in a moment.";
export const CHANGED_WHILE_WAITING = "This reel changed while yours was waiting. Your text is still here; send again.";

/** Thrown when the page left mid-recovery; the hook ignores it. */
export class Gone extends Error {}

const recoverable = (e: unknown) => e instanceof ApiError && (e.status === 0 || (e.status === 409 && e.code === "reel.stillPlanning"));
const noAnswer = (e: unknown) => e instanceof ApiError && e.status === 0;

/** Reads every RECOVER_EVERY_MS until `check` returns a value; `notYet` errors from get are skipped. */
async function poll<D, T>(get: () => Promise<D>, check: (d: D) => T | null, notYet: (e: unknown) => boolean, deps: Deps): Promise<T> {
  const start = deps.now();
  for (;;) {
    await deps.sleep(RECOVER_EVERY_MS);
    if (!deps.alive()) throw new Gone();
    if (deps.now() - start > RECOVER_CAP_MS) throw new ApiError(0, TOO_LONG);
    try {
      const found = check(await get());
      if (found !== null) return found;
    } catch (e) {
      if (!notYet(e)) throw e;
    }
  }
}

/** Create: on ApiError(0) or 409 reel.stillPlanning, polls get() (GET /reels/{requestId}); 404 or status 0 = not yet. At the cap throws ApiError(0, TOO_LONG). */
export async function createWithRecovery(send: () => Promise<{ id: string }>, get: () => Promise<ReelDetail>, deps: Deps): Promise<{ id: string }> {
  try {
    return await send();
  } catch (e) {
    if (!recoverable(e)) throw e;
  }
  return poll(get, (d) => ({ id: d.item.id }), (e) => noAnswer(e) || (e instanceof ApiError && e.status === 404), deps);
}

export type ReviseOutcome =
  | { kind: "done"; result: PlanResult } // the stream finished
  | { kind: "answered"; detail: ReelDetail } // our requestId has its reply
  | { kind: "other"; detail: ReelDetail }; // the version moved without our turn: ours didn't run

/** Revise: on ApiError(0) or stillPlanning, polls until our turn is answered, or the version moved past sentVersion without it. Only status 0 from get is "not yet". */
export async function reviseWithRecovery(send: () => Promise<PlanResult>, get: () => Promise<ReelDetail>, requestId: string, sentVersion: number, deps: Deps): Promise<ReviseOutcome> {
  try {
    return { kind: "done", result: await send() };
  } catch (e) {
    if (!recoverable(e)) throw e;
  }
  return poll<ReelDetail, ReviseOutcome>(get, (detail) => {
    if (answeredTurn(detail.chat, requestId) !== null) return { kind: "answered", detail };
    return detail.version > sentVersion ? { kind: "other", detail } : null;
  }, noAnswer, deps);
}

export type CreateBody = { prompt?: string; opportunityId?: string; templateId?: string };

/**
 * One create presser (lib/presser.ts) whose send runs the whole send + recovery, so the id is settled once, on the final
 * outcome. Same body after an unknown outcome → same id; the server returns the reel made under it instead of a second.
 */
export const makeCreatePresser = (
  api: { send: (body: CreateBody, requestId: string) => Promise<{ id: string }>; get: (requestId: string) => Promise<ReelDetail> },
  deps: Deps,
  newId?: () => string,
) => makePresser<CreateBody, { id: string }>(
  (body, id) => createWithRecovery(() => api.send(body, id), () => api.get(id), deps),
  (b) => JSON.stringify({ prompt: b.prompt, opportunityId: b.opportunityId, templateId: b.templateId }),
  newId,
);

export type ReviseBody = { version: number; message?: string; templateId?: string; deps: Deps };

/**
 * One revise presser per reel, keyed by the message (or the template picked). `done` and `answered` are success.
 * `other` shows the moved reel (put) and throws a status-0 error, which keeps the id: ours was never stored, so the
 * resend runs.
 */
export const makeRevisePresser = <R extends ReviseBody>(
  api: { send: (r: R, requestId: string) => Promise<PlanResult>; get: () => Promise<ReelDetail>; put: (d: ReelDetail) => void },
  newId?: () => string,
) => makePresser<R, Exclude<ReviseOutcome, { kind: "other" }>>(
  async (r, id) => {
    const out = await reviseWithRecovery(() => api.send(r, id), api.get, id, r.version, r.deps);
    if (out.kind !== "other") return out;
    api.put(out.detail);
    throw new ApiError(0, CHANGED_WHILE_WAITING);
  },
  (r) => r.message ?? `template:${r.templateId}`,
  newId,
);
