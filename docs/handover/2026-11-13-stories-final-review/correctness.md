# Final branch review: correctness and money (702b5d0..HEAD)

Lens: credits, frame-by-frame publishing, save/render/version pipeline, job queue, state transitions across web, phone
and agents, and data loss. Read-only review. I read the server code in full (stories/*, publishing.ts, manual-post.ts,
credits.ts, engine.ts, creator/brief/quality, runner.ts, content routes, package route) and the phone and web callers
of the story actions. I ran `npx vitest run tests/stories-{publish,save,create,by-hand}.test.ts`: 150/150 pass.

## Verdict

**Ready to merge after one Important fix.** I found no Critical defect. The publishing path holds up under the
scenarios I traced:

- No double post: a frame is recorded "publishing" before its call, and every write is guarded on the attempt still
  being PUBLISHING.
- A lost job is settled from the recorded progress, under a row lock.
- Post the rest can't be created twice or re-run.
- Cancelling a Post the rest goes back to PARTIAL.
- Settle works frame by frame.
- By hand and Schedule can't both be booked, and the package and "I posted it" both need the approval to hold.

The 5-credit charge is idempotent per request id. Refunds are idempotent by charge id. Fix it reuses a charge that
still stands, or charges a fresh `:retry:n` once.

## Important

### I1. A duplicated story is picked up by the Brief writer and rewritten by the Creator

- **Where:** `apps/web/server/stories/service.ts:370` (with `apps/web/server/agents/definitions/brief.ts:38` and
  `apps/web/server/agents/definitions/creator.ts:75`).
- **What happens:** `duplicateStory` creates the copy as `status: "PLANNED"` with a v1 holding the person's text. The
  Brief writer takes every `PLANNED`, non-studio item (`brief.ts:38`). It overwrites `brief` and `productIds` and moves
  the copy to `BRIEF_READY` (`brief.ts:100-103`). The Creator then treats a `BRIEF_READY` item that already has a
  version as a rewrite: `writeStory` keeps the pictures and writes new text, saving v2 as the agent.
- **Scenario:**
  1. A person duplicates last week's story to re-run it, keeping its frames and text, and doesn't edit it yet.
  2. Someone taps "Generate calendar", which runs the Planner, then the Brief writer, then the Creator with
     `chain: true`.
  3. The copy gets an AI brief and AI-rewritten frame text as v2. The phone editor and the card show only the latest
     version, so the person's text is gone from view.
  4. If the person was editing the copy on the phone at the time, their save (base v1) is refused as `story.stale`.
- **Cost:** It also uses one of the Brief writer's 8 slots per run, plus a top-tier Creator call, and may queue a clip
  render.
- **Fix:** Create duplicates in a status the writer agents skip. `DRAFT_REVIEW` with no check would make Quality check
  the copy, so not that one. Alternatively, make the Brief writer and Creator skip story items that already have a
  version while in `PLANNED` or `BRIEF_READY`.

## Minor

### M1. A paid story can be delivered and then refunded, or written for free

- **Where:** `apps/web/server/agents/engine.ts:225-226`, `apps/web/server/jobs/runner.ts:65-69` and
  `apps/web/server/agents/definitions/creator.ts:74-78`.
- **Case (a), the run is re-run after the story is saved:** The Creator job is cut off after `writeStory` committed v1
  but before the run was marked SUCCEEDED. This can happen at the function time limit, in a crash, or when the job
  stops after SUCCEEDED but before `completeJob` on its last attempt.
  - The re-run finds the item in `DRAFT_REVIEW` with nothing to do, and throws `NothingToDoError`. That error is not
    retried, so the job counts as exhausted and `onAgentRunFailure` refunds the 5 credits.
  - The reclaim path for a job past `maxAttempts` refunds as well. It calls `onFailure(exhausted)` without checking
    `run.status`.
  - Either way, the person keeps the story and gets the credits back.
- **Case (b), the Generate calendar chain writes the story:** That chain's Creator run (no `itemId`) also takes paid
  "New story" items that are still `BRIEF_READY`.
  - If it saves first, the paid run is refused as stale and refunds.
  - If a paid write was refused and refunded, or the run failed, the story stays `BRIEF_READY`. The next chain run
    then writes it free.
- **Effect:** Credits leak only. Nobody is charged twice.
- **Fix:** In `onAgentRunFailure`, don't refund when the run is SUCCEEDED, and for a story run, when the item already
  has an agent version from that run. In the chain Creator, skip stories whose brief has a `requestId`.

### M2. Editing an approved by-hand story after its package was downloaded blocks "I posted it"

- **Where:** `apps/web/server/services/manual-post.ts:91-95` and `apps/web/server/stories/service.ts:208`.
- **What happens:** `EDITABLE` includes APPROVED. A phone edit makes v(n+1), sets the story to `DRAFT_REVIEW` and
  clears `byHand`.
- **Scenario:**
  1. Person A downloads the zip at 10:00 and posts v(n) on Instagram at 10:05.
  2. Person B edits the text at 10:03.
  3. A's "I posted it" now gets 409 `story.notApproved`, and the due card has gone.
  4. The story shows as a draft awaiting approval of content that was never posted. If v(n+1) is later approved and
     scheduled, a second, different story goes out.
- **Note:** Nothing records that a package was handed out; the only trace is the `content.package.download` audit
  event.
- **Fix:** Either refuse edits while `byHand` is on (as SCHEDULED does), or let "I posted it" accept the last approved
  version when a package was downloaded for it.

### M3. A retried final render step never starts Quality

- **Where:** `apps/web/server/stories/service.ts:251`.
- **What happens:** When the job dies after `createStoryVersion` committed but before `startAgentRun(quality)`, the
  retry sees its own `renderId` and returns. The version stays in `DRAFT_REVIEW` with no check.
- **Effect:** No scheduled agent runs Quality (only Scout is daily), and the Creator leaves unchecked edits alone. The
  story waits until someone taps "Try again", where the rewrite route's `unchecked` branch starts Quality.
- **Fix:** In that early-return branch, call `startAgentRun(quality)` (it de-duplicates).

### M4. An agent's failed clip render shows on the phone as the person's render error

- **Where:** `apps/web/server/stories/service.ts:293-303`.
- **What happens:** `storyRenderState` matches on `itemId` and `baseVersion >= latest` without looking at
  `payload.actor`.
- **Scenario:** A Creator rewrite of a story that keeps a clip queues a render. If ffmpeg fails twice, the phone
  editor shows "The clip couldn't be rendered. Try again" on a story the person never saved. While that job is pending,
  the editor is also read-only ("Preparing frames").
- **Effect:** No data loss, but it is misleading.
- **Fix:** Filter by `actor.kind === "person"` for the error, or label agent renders.

## Checked and found sound (no finding)

- **Double tap on "New story":** the advisory lock plus `storyForRequest` mean one charge and one item.
- **A reused request id:** after a delete or a refund, it is refused with `story.requestUsed`.
- **Fix it:**
  - With a run in flight, it joins the run through the engine's de-duplication and pays nothing extra.
  - A double tap pays once, because `:retry:n` is idempotent.
  - `failStoryStart` refunds the exact charge.
- **Lost or overlapping story publish job:**
  - A worker still running after `storyJobLost` (or after the 10-minute `releaseState` sweep) can't save progress or
    finish.
  - `onPublished` keeps the frame in memory first, so a failed save still reports PARTIAL with that frame.
- **Partly posted stories:**
  - Post the rest sends only frames not yet published, re-checks the seal and product gate, and keeps PARTIAL
    (item stays SCHEDULED) on any refusal before sending.
  - Cancelling it returns PARTIAL.
  - `markDone` and `postRest` can each act once per PARTIAL attempt.
- **Settling frames:** `settleFrame` → FAILED only when no frame is out, and only then does the item return to
  APPROVED, so a reschedule can't re-post frames that are out. The generic posted / not-posted actions are refused for
  stories.
- **Render pipeline:**
  - Approval during a render refuses the version (`statusAtSave`).
  - A stale base is refused.
  - A scheduled or published item refuses the version.
  - The idempotency keys per step stop a step from being queued twice.
  - Refusals aren't retried.
- **Uploads:** the purge keeps any upload a version body names, duplicates included.
