/**
 * A story's per-frame publishing progress (pure; stored in PublicationAttempt.target.progress). `i` is the 0-based frame
 * index. A frame is "publishing" from just before its media_publish call until its media id is recorded: if the job
 * stops in between, nobody knows whether it went out, so a person checks (settleStoryFrame).
 */
type FrameState = "publishing" | "published" | "not-posted";
export type FrameProgress = { i: number; state: FrameState; mediaId?: string; at?: string }[];

const DAY_MS = 86_400_000;

const isPublished = (progress: FrameProgress, i: number) => progress.some((f) => f.i === i && f.state === "published");

/** Frames still to post, in order. Refuses while a frame's outcome is unknown: posting again could post it twice. */
export function nextFramesToPublish(total: number, progress: FrameProgress): number[] {
  if (progress.some((f) => f.state === "publishing")) throw new Error("A frame's outcome is unknown; settle it first");
  return Array.from({ length: total }, (_, i) => i).filter((i) => !isPublished(progress, i));
}

/** FAILED only when nothing is out; PUBLISHED when every frame is. */
export function attemptOutcome(total: number, progress: FrameProgress): "PUBLISHED" | "PARTIAL" | "FAILED" {
  const posted = Array.from({ length: total }, (_, i) => i).filter((i) => isPublished(progress, i)).length;
  return posted === total ? "PUBLISHED" : posted === 0 ? "FAILED" : "PARTIAL";
}

/**
 * A person looked at the account: did the unconfirmed frame appear? Its time is the moment of settling (we don't know
 * the real one), so expiry is judged from then; the frame may expire a little earlier than we say.
 */
export function settleStoryFrame(progress: FrameProgress, frame: number, appeared: boolean, now = new Date()): FrameProgress {
  if (!progress.some((f) => f.i === frame && f.state === "publishing")) throw new Error(`Frame ${frame + 1} isn't waiting for a check`);
  return progress.map((f) => (f.i === frame ? (appeared ? { i: frame, state: "published", at: now.toISOString() } : { i: frame, state: "not-posted" }) : f));
}

/** How many posted frames are over 24 h old (Instagram has taken them down). */
export function expiredFrames(progress: FrameProgress, now: Date): number {
  return progress.filter((f) => f.state === "published" && f.at && now.getTime() - new Date(f.at).getTime() > DAY_MS).length;
}

/** Posts left in the account's rolling 24 h API publishing limit (`content_publishing_limit` data[0]). */
export function publishingLimitRoom(res: { config: { quota_total: number }; quota_usage: number }): number {
  return Math.max(0, res.config.quota_total - res.quota_usage);
}

/** The progress with frame `i` set to `entry` (added when it has no row yet). */
export function withFrame(progress: FrameProgress, i: number, entry: Omit<FrameProgress[number], "i">): FrameProgress {
  const next = { i, ...entry };
  return progress.some((f) => f.i === i) ? progress.map((f) => (f.i === i ? next : f)) : [...progress, next].sort((a, b) => a.i - b.i);
}

const range = (n: number) => (n === 1 ? "Frame 1 was" : `Frames 1–${n} were`);
/** "Frames 1–2 were posted; we couldn't confirm frame 3. Check the account." */
export function unconfirmedMessage(progress: FrameProgress): string {
  const frame = progress.find((f) => f.state === "publishing")!.i + 1;
  const posted = progress.filter((f) => f.state === "published").length;
  return `${posted ? `${range(posted)} posted; we` : "We"} couldn't confirm frame ${frame}. Check the account.`;
}
