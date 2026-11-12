import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, ApiError } from "@/api/client";
import { currentBrand, type DraftSoFar, type PlanEvent, type PlanResult, type PlanStage, type ReelDetail, type ReelPlan, reels } from "@/api/endpoints";

/**
 * The reel the Reels screens are working on (R04 → R10–R13 → R03 → R05 → R07 → R08), shared across screens
 * without route params. ponytail: module state; a reel id in the route would survive a cold start too.
 */
let currentId: string | null = null;
export const openReel = (id: string | null) => void (currentId = id);
export const reelId = () => currentId;

/**
 * A chat message the scriptwriter is still working on, with what it has written so far. Module state, like the reel
 * id, so leaving R04 and coming back mid-write shows it still going; every open useReel hears when it lands.
 */
export type Live = { stage: PlanStage } & DraftSoFar;
type Inflight = { message: string; live: Live };
let inflight: Inflight | null = null;
const listeners = new Set<() => void>();
const setInflight = (next: Inflight | null) => {
  inflight = next;
  listeners.forEach((fn) => fn());
};
const EMPTY: DraftSoFar = { reply: "", title: "", scenes: [] };
const REPLY_WAIT_MS = 3 * 60_000;
const CLOCK_SKEW_MS = 60_000;

/** A dropped stream (the app went to the background, the network blinked): the server carries on, so wait for its reply. */
async function waitForReply(id: string, turnsBefore: number) {
  for (const until = Date.now() + REPLY_WAIT_MS; Date.now() < until; ) {
    await new Promise((r) => setTimeout(r, 3000));
    const d = await reels.get(id).catch(() => null);
    if (d && d.chat.length > turnsBefore) return;
  }
  throw new ApiError(0, "The reply is taking too long. Check back in a moment.");
}

/**
 * A dropped create stream: the server carries on and saves the reel, so find the one that wasn't in the list before
 * (sending the first message again would make a second reel), then wait for its reply.
 */
async function adoptCreated(known: Set<string>, sentAt: number) {
  for (const until = Date.now() + REPLY_WAIT_MS; Date.now() < until; ) {
    await new Promise((r) => setTimeout(r, 3000));
    // Only a reel made after the message was sent (phone and server clocks may differ a little); two candidates = unsure, so don't guess.
    const fresh = (await reels.list().catch(() => null))?.reels.filter((r) => !known.has(r.id) && Date.parse(r.createdAt) >= sentAt - CLOCK_SKEW_MS) ?? [];
    if (fresh.length > 1) break;
    if (fresh.length === 1) {
      currentId = fresh[0].id;
      return waitForReply(fresh[0].id, 0);
    }
  }
  throw new ApiError(0, "The reply is taking too long. Check back in a moment.");
}

/** R07 "Check again": starts the Quality check a finished render never got (reels route, action recheck). */
export async function recheckReel(id: string) {
  const b = await currentBrand();
  return api<{ status: "started" | "checking" | "none" }>(`/workspaces/${encodeURIComponent(b.workspaceId)}/brands/${encodeURIComponent(b.brandId)}/reels/${encodeURIComponent(id)}`, { body: { action: "recheck" }, workspaceId: b.workspaceId });
}

/** Loads the current reel; poll > 0 refreshes it (R05 progress, R07 checks). */
export function useReel(poll = 0) {
  const [detail, setDetail] = useState<ReelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!currentId) return;
    try {
      const d = await reels.get(currentId);
      if (mounted.current) {
        setDetail(d);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // State is only set in the fetch's callbacks, after the effect has run.
    const tick = () => {
      if (!currentId) return;
      reels.get(currentId).then(
        (d) => mounted.current && (setDetail(d), setError(null)),
        (e: unknown) => mounted.current && setError(e instanceof Error ? e.message : String(e)),
      );
    };
    tick();
    const timer = poll > 0 ? setInterval(tick, poll) : undefined;
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, [poll]);

  // Back on this screen (Back from a later one, or the reel changed elsewhere): show the reel as it is now.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void load();
      focused.current = true;
    }, [load]),
  );

  // Follow the in-flight message; when it lands, show the new plan.
  useEffect(() => {
    let was = inflight;
    const onChange = () => {
      rerender();
      if (was && !inflight) void load();
      was = inflight;
    };
    listeners.add(onChange);
    return () => void listeners.delete(onChange);
  }, [load]);

  /** Runs a change that returns a new plan version, then reloads. Errors land in `error`. */
  const change = useCallback(async (run: () => Promise<PlanResult | unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await run();
      await load();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [load]);

  const save = (plan: ReelPlan) => change(() => reels.save(currentId!, detail!.version, plan));

  /**
   * R04: the message shows at once, then the scriptwriter's progress streams in (reading → writing, the draft growing
   * scene by scene → directing). An idea starts a new reel from it; a template (R12) reshapes the plan or starts one,
   * with `message` its title. Resolves true once the new plan is saved.
   */
  const chat = async (message: string, opportunityId?: string, templateId?: string): Promise<boolean> => {
    if (inflight) return false;
    setError(null);
    setInflight({ message, live: { stage: "reading", ...EMPTY } });
    const onEvent = (e: PlanEvent) => {
      if (!inflight) return;
      const live = e.type === "stage" ? { ...inflight.live, stage: e.stage } : { ...inflight.live, reply: e.reply, title: e.title, scenes: e.scenes };
      setInflight({ ...inflight, live });
    };
    const turnsBefore = detail?.chat.length ?? 0;
    try {
      if (!currentId) {
        const before = await reels.list().catch(() => null);
        const known = new Set(before?.reels.map((r) => r.id));
        const sentAt = Date.now();
        try {
          currentId = (await reels.create({ prompt: message, opportunityId, templateId }, onEvent)).id;
        } catch (e) {
          // Without the earlier list there is nothing to tell the new reel from the old ones: report the original error.
          if (!before || !(e instanceof ApiError && e.status === 0)) throw e;
          await adoptCreated(known, sentAt);
        }
      } else {
        const id = currentId;
        await reels.chat(id, detail?.version ?? 0, message, onEvent, templateId).catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 0) return waitForReply(id, turnsBefore);
          throw e;
        });
      }
      await load(); // the finished reply replaces the streamed one in place, with no blank frame between
      return true;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setInflight(null); // every open screen reloads the reel
    }
  };

  return { id: currentId, detail, error, busy: busy || !!inflight, pending: inflight?.message ?? null, live: inflight?.live ?? null, load, save, chat, setError };
}
