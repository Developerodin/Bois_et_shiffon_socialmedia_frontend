"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftSoFar, PlanEvent, PlanStage, ReelDetail } from "@/shared";
import { ApiError, request } from "@/components/settings/api";
import { pressErrorText } from "@/components/photoshoot/press";
import { fetchShared, putShared } from "@/components/workspace/use-job";
import { NET_MESSAGE, isOffline } from "@/lib/net";
import { reelUrl, reelsApi } from "./api";
import { Gone, makeCreatePresser, makeRevisePresser, type CreateBody, type Deps, type ReviseBody } from "./plan-stream";

type OnLine = (line: unknown) => void;
type Revise = ReviseBody & { onLine: OnLine };

// One revise presser per reel for the tab's life: a message whose outcome was unknown, sent again after leaving and
// coming back, reuses its id. Ceiling: one small entry per reel revised in this tab; nothing is evicted.
const revisers = new Map<string, ReturnType<typeof makeRevisePresser<Revise>>>();

function reviser(w: string, b: string, id: string) {
  const scope = JSON.stringify([w, b, id]);
  let press = revisers.get(scope);
  if (!press) {
    const url = reelUrl(w, b, id);
    press = makeRevisePresser<Revise>({
      send: (r, requestId) => reelsApi.chat(w, b, id, { version: r.version, message: r.message, templateId: r.templateId }, requestId, r.onLine),
      // Joins a read already out, and feeds useReel.
      get: () => fetchShared(url, true) as Promise<ReelDetail>,
      put: (d) => putShared(url, d),
    });
    revisers.set(scope, press);
  }
  return press;
}

/** A 409 refusing the turn over the reel's state (stillPlanning is recovered from, idTaken retried by the presser). */
const stateRefusal = (e: unknown): e is ApiError =>
  e instanceof ApiError && e.status === 409 && e.code !== "reel.stillPlanning" && e.code !== "request.idTaken";

/** What to show for a failed send; null for a 402 (the paywall opened and says it). */
function sendErrorText(e: unknown): string | null {
  if (stateRefusal(e) && e.message.includes("changed in the meantime")) return `${e.message} Your text is still here; send again.`;
  return pressErrorText(e);
}

/**
 * Sends a reel's first plan (create) or a chat turn (revise) over the streamed plan call, with recovery
 * (plan-stream.ts). While it streams, `stage` and `draft` show the progress. One send at a time; the caller keeps the
 * person's text until a send returns the reel id / true.
 */
export function useReelStream(w: string, b: string) {
  const [stage, setStage] = useState<PlanStage | null>(null);
  const [draft, setDraft] = useState<DraftSoFar | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const latest = useRef<{ stage: PlanStage | null; draft: DraftSoFar | null }>({ stage: null, draft: null });
  const frame = useRef<number | null>(null);

  // ponytail: recovery ends when the page unmounts; the plan still lands and shows next time.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!alive.current) return;
    setStage(latest.current.stage);
    setDraft(latest.current.draft);
  }, []);

  // Progress lines: drafts flush at most once a frame; a stage change flushes at once.
  const onLine = useCallback<OnLine>((l) => {
    const line = l as PlanEvent;
    if (line.type === "stage") {
      if (line.stage === latest.current.stage) return;
      latest.current = { ...latest.current, stage: line.stage };
      flush();
    } else if (line.type === "draft") {
      latest.current = { ...latest.current, draft: { reply: line.reply, title: line.title, scenes: line.scenes } };
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const deps = useMemo<Deps>(() => ({
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    alive: () => alive.current,
  }), []);

  // One create presser per mount (and brand): the same body sent again after an unknown outcome reuses the id.
  const creator = useMemo(() => makeCreatePresser({
    send: (body, requestId) => reelsApi.create(w, b, body, requestId, onLine),
    get: (requestId) => request<ReelDetail>(reelUrl(w, b, requestId)),
  }, deps), [w, b, onLine, deps]);

  /** One send: offline first (nothing sent, no id), one at a time. Undefined when it failed or the page left. */
  const run = useCallback(async <T,>(go: () => Promise<T>, onError?: (e: unknown) => void): Promise<T | undefined> => {
    if (busy.current) return undefined;
    if (isOffline()) {
      setError(NET_MESSAGE.offline);
      return undefined;
    }
    busy.current = true;
    latest.current = { stage: null, draft: null };
    flush();
    setSending(true);
    setError(null);
    try {
      const out = await go();
      return alive.current ? out : undefined;
    } catch (e) {
      if (e instanceof Gone || !alive.current) return undefined;
      onError?.(e);
      setError(sendErrorText(e));
      return undefined;
    } finally {
      busy.current = false;
      flush();
      if (alive.current) setSending(false);
    }
  }, [flush]);

  const create = useCallback(async (body: CreateBody): Promise<string | null> => {
    const made = await run(() => creator(body));
    return made ? made.id : null;
  }, [run, creator]);

  const revise = useCallback(async (id: string, version: number, body: { message?: string; templateId?: string }): Promise<boolean> => {
    const url = reelUrl(w, b, id);
    const out = await run(() => reviser(w, b, id)({ version, ...body, deps, onLine }), (e) => {
      // Refused over the reel's state (e.g. it changed in the meantime): show the reel as it is now.
      if (stateRefusal(e)) void fetchShared(url, true).catch(() => undefined);
    });
    if (!out) return false;
    if (out.kind === "done") void fetchShared(url, true).catch(() => undefined);
    else putShared(url, out.detail);
    return true;
  }, [w, b, run, deps, onLine]);

  return { stage, draft, sending, error, create, revise };
}
