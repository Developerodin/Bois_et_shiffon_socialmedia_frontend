import { describe, expect, it } from "vitest";
import type { ChatTurn, PlanResult, ReelDetail } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { isComposerSend } from "@/components/reels/plan-step";
import {
  CHANGED_WHILE_WAITING, Gone, TOO_LONG, createWithRecovery, makeCreatePresser, makeRevisePresser, reviseWithRecovery, type Deps,
} from "@/components/reels/plan-stream";

const deps = (over: { alive?: () => boolean } = {}): Deps => {
  let t = 0;
  return { sleep: async (ms) => void (t += ms), now: () => t, alive: over.alive ?? (() => true) };
};

const detail = (version: number, chat: ChatTurn[] = [], id = "r1"): ReelDetail => ({
  item: { id, title: "T", status: "DRAFT_REVIEW", postUrl: null, scheduledFor: null },
  version, plan: null, price: null, seconds: null, sceneSeconds: [], aiDisclosure: null, caption: null,
  videoUrl: null, videoKey: null, checks: null, renders: [], chat, credits: 0, photoUrls: {},
});
const answered = (version: number, requestId: string) =>
  detail(version, [{ role: "user", text: "hi", at: "", requestId }, { role: "assistant", text: "done", at: "" }]);
const result: PlanResult = { version: 2, plan: { title: "T", presenter: "none", template: "t", voice: "v", scenes: [], caption: "", hashtags: [] }, price: 1 };

const dropped = () => Promise.reject(new ApiError(0, "The answer stopped partway. Try again."));
const stillPlanning = () => Promise.reject(new ApiError(409, "This reel is still being planned.", "reel.stillPlanning"));

/** get() answering each call in turn: a ReelDetail resolves, an ApiError rejects. The last answer repeats. */
const reads = (...answers: (ReelDetail | ApiError)[]) => {
  let calls = 0;
  const get = () => {
    const a = answers[Math.min(calls++, answers.length - 1)];
    return a instanceof ApiError ? Promise.reject(a) : Promise.resolve(a);
  };
  return { get, calls: () => calls };
};

describe("createWithRecovery", () => {
  it("create recovers by id after a dropped stream", async () => {
    const r = reads(new ApiError(404, "Reel not found"), new ApiError(404, "Reel not found"), detail(1, [], "req-1"));
    await expect(createWithRecovery(dropped, r.get, deps())).resolves.toEqual({ id: "req-1" });
    expect(r.calls()).toBe(3);
  });
  it("create gives up after three minutes", async () => {
    const r = reads(new ApiError(404, "Reel not found"));
    await expect(createWithRecovery(dropped, r.get, deps())).rejects.toMatchObject({ status: 0, message: TOO_LONG });
  });
  it("create rethrows a refusal", async () => {
    const r = reads(detail(1));
    await expect(createWithRecovery(() => Promise.reject(new ApiError(400, "no")), r.get, deps())).rejects.toMatchObject({ status: 400 });
    expect(r.calls()).toBe(0);
  });
  it("create recovers after stillPlanning too", async () => {
    const r = reads(new ApiError(0, "offline"), detail(1, [], "req-1"));
    await expect(createWithRecovery(stillPlanning, r.get, deps())).resolves.toEqual({ id: "req-1" });
  });
});

describe("reviseWithRecovery", () => {
  it("returns done when the stream finishes", async () => {
    const r = reads(detail(3));
    await expect(reviseWithRecovery(() => Promise.resolve(result), r.get, "q", 3, deps())).resolves.toEqual({ kind: "done", result });
    expect(r.calls()).toBe(0);
  });
  it("stillPlanning resolves other when the version moves without our id", async () => {
    const r = reads(detail(3), detail(4, [{ role: "user", text: "x", at: "", requestId: "someone-else" }, { role: "assistant", text: "y", at: "" }]));
    await expect(reviseWithRecovery(stillPlanning, r.get, "q", 3, deps())).resolves.toMatchObject({ kind: "other", detail: { version: 4 } });
  });
  it("stillPlanning resolves answered when our own id lands", async () => {
    const r = reads(detail(3), answered(4, "q"));
    await expect(reviseWithRecovery(stillPlanning, r.get, "q", 3, deps())).resolves.toMatchObject({ kind: "answered", detail: { version: 4 } });
  });
  it("a dropped stream resolves other when another edit moved the version", async () => {
    const r = reads(detail(4));
    await expect(reviseWithRecovery(dropped, r.get, "q", 3, deps())).resolves.toMatchObject({ kind: "other" });
  });
  it("revise recovers when the turn is answered", async () => {
    const r = reads(new ApiError(0, "offline"), answered(4, "q"));
    await expect(reviseWithRecovery(dropped, r.get, "q", 3, deps())).resolves.toMatchObject({ kind: "answered" });
    expect(r.calls()).toBe(2);
  });
  it("revise ends on 404", async () => {
    const r = reads(new ApiError(404, "Reel not found"));
    await expect(reviseWithRecovery(dropped, r.get, "q", 3, deps())).rejects.toMatchObject({ status: 404 });
    expect(r.calls()).toBe(1);
  });
  it("revise gives up after three minutes", async () => {
    const r = reads(detail(3));
    await expect(reviseWithRecovery(dropped, r.get, "q", 3, deps())).rejects.toMatchObject({ status: 0, message: TOO_LONG });
  });
  it("recovery stops when alive turns false", async () => {
    let polls = 0;
    const r = reads(detail(3));
    const get = () => (polls++, r.get());
    await expect(reviseWithRecovery(dropped, get, "q", 3, deps({ alive: () => polls < 1 }))).rejects.toBeInstanceOf(Gone);
    expect(r.calls()).toBe(1);
  });
  it("rethrows a stale-version 409 without polling", async () => {
    const r = reads(detail(4));
    const stale = () => Promise.reject(new ApiError(409, "This plan changed in the meantime. Reload and try again."));
    await expect(reviseWithRecovery(stale, r.get, "q", 3, deps())).rejects.toMatchObject({ status: 409 });
    expect(r.calls()).toBe(0);
  });
});

describe("the presser around send + recovery", () => {
  const ids = () => {
    let n = 0;
    return () => `id-${++n}`;
  };

  it("late keeps the id, and the same create body after late reuses it", async () => {
    const sent: string[] = [];
    let late = true;
    const press = makeCreatePresser({
      send: (_body, id) => (sent.push(id), late ? dropped() : Promise.resolve({ id })),
      get: () => Promise.reject(new ApiError(404, "Reel not found")),
    }, deps(), ids());
    await expect(press({ prompt: "a" })).rejects.toMatchObject({ status: 0, message: TOO_LONG });
    late = false;
    await expect(press({ prompt: "a" })).resolves.toEqual({ id: "id-1" });
    expect(sent).toEqual(["id-1", "id-1"]);
  });
  it("a different prompt → new id", async () => {
    const sent: string[] = [];
    const press = makeCreatePresser({
      send: (_body, id) => (sent.push(id), dropped()),
      get: () => Promise.reject(new ApiError(404, "Reel not found")),
    }, deps(), ids());
    await expect(press({ prompt: "a" })).rejects.toMatchObject({ message: TOO_LONG });
    await expect(press({ prompt: "b" })).rejects.toMatchObject({ message: TOO_LONG });
    expect(sent).toEqual(["id-1", "id-2"]);
  });
  it("other keeps the id and shows the moved reel", async () => {
    const sent: string[] = [];
    const put: ReelDetail[] = [];
    let moved = true;
    const press = makeRevisePresser({
      send: (_r, id) => (sent.push(id), moved ? dropped() : Promise.resolve(result)),
      get: () => Promise.resolve(detail(4)),
      put: (d) => put.push(d),
    }, ids());
    await expect(press({ version: 3, message: "shorter", deps: deps() })).rejects.toMatchObject({ status: 0, message: CHANGED_WHILE_WAITING });
    expect(put.map((d) => d.version)).toEqual([4]);
    moved = false;
    await expect(press({ version: 4, message: "shorter", deps: deps() })).resolves.toEqual({ kind: "done", result });
    expect(sent).toEqual(["id-1", "id-1"]);
  });
  it("a stale-version refusal clears the revise id", async () => {
    const sent: string[] = [];
    let stale = true;
    const press = makeRevisePresser({
      send: (_r, id) => (sent.push(id), stale ? Promise.reject(new ApiError(409, "This plan changed in the meantime.")) : Promise.resolve(result)),
      get: () => Promise.resolve(detail(4)),
      put: () => undefined,
    }, ids());
    await expect(press({ version: 3, message: "shorter", deps: deps() })).rejects.toMatchObject({ status: 409 });
    stale = false;
    await press({ version: 4, message: "shorter", deps: deps() });
    expect(sent).toEqual(["id-1", "id-2"]);
  });
  it("presses of one presenter share an id; a presenter press and a message of its name differ", async () => {
    const sent: string[] = [];
    const press = makeRevisePresser({
      send: (_r, id) => (sent.push(id), dropped()),
      get: () => Promise.resolve(detail(1)),
      put: () => undefined,
    }, ids());
    await press({ version: 1, presenterId: "p1", message: "Use Ana", deps: deps() }).catch(() => undefined);
    await press({ version: 1, presenterId: "p1", message: "Use Ana again", deps: deps() }).catch(() => undefined);
    await press({ version: 1, message: "p1", deps: deps() }).catch(() => undefined);
    await press({ version: 1, message: "Use Ana", deps: deps() }).catch(() => undefined);
    expect(sent[0]).toBe(sent[1]);
    expect(sent[2]).not.toBe(sent[0]);
    expect(sent[3]).not.toBe(sent[0]);
  });
});

describe("isComposerSend", () => {
  it("a presenter send leaves the composer and the pending bubble alone", () => {
    expect(isComposerSend({ kind: "presenter", presenterId: "p1", message: "Use Ana" })).toBe(false);
    expect(isComposerSend({ kind: "message", message: "hi" })).toBe(true);
    expect(isComposerSend({ kind: "template", templateId: "t" })).toBe(true);
  });
});
