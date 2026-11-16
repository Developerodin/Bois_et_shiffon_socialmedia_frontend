import type { CheckResult } from "@/server/content/rules";
import { FRAME_MAX_BYTES, STORY_LIMITS, type StoryBody } from "@/server/stories/body";
import { textFits } from "@/server/stories/render";

/** Story check rows about the frames' media, not their text: the Creator can't fix these, so it doesn't rewrite for them. */
export const STORY_MEDIA_CHECKS = ["Frames", "Frame files", "Asset rights"] as const;
const [FRAMES, FRAME_FILES, ASSET_RIGHTS] = STORY_MEDIA_CHECKS;

const MAX_CLIP_SECONDS = STORY_LIMITS.clipSeconds + 0.5; // the window plus encoder slack

const row = (check: string, ok: boolean, okNote: string, badNote: string, bad: CheckResult["status"] = "blocker"): CheckResult =>
  ({ check, status: ok ? "pass" : bad, note: ok ? okNote : badNote });

/** Story-only rules; the shared text, product and offer rows are added by the Quality agent. */
export function checkStory(body: StoryBody): CheckResult[] {
  const { frames } = body;
  const [min, max] = STORY_LIMITS.frames;
  const unrendered = frames.flatMap((f, i) => (f.renderedKey && f.file ? [] : [i + 1]));
  const framesOk = frames.length >= min && frames.length <= max && !unrendered.length;
  const framesBad = frames.length < min || frames.length > max
    ? `A story needs ${min} to ${max} frames; this one has ${frames.length}.`
    : `Frame ${unrendered.join(", ")} has no picture yet.`;

  const fileProblems = frames.flatMap((f, i) => {
    if (!f.file) return [];
    const clip = f.mediaKind === "video" || f.file.durationSec != null;
    const p: string[] = [];
    if (f.file.width !== 1080 || f.file.height !== 1920) p.push(`is ${f.file.width}×${f.file.height}, not 1080×1920`);
    if (f.file.bytes > FRAME_MAX_BYTES) p.push("is over 8 MB");
    if (clip && (f.file.durationSec ?? 0) > MAX_CLIP_SECONDS) p.push(`runs ${f.file.durationSec}s, over ${MAX_CLIP_SECONDS}s`);
    return p.length ? [`Frame ${i + 1} ${p.join(" and ")}`] : [];
  });

  const unfit = frames.flatMap((f, i) => {
    const r = textFits(f, i === frames.length - 1, body.cta);
    return r.fits ? [] : [`Frame ${i + 1} (${r.field})`];
  });

  const missing = !body.link.trim() ? ["link"] : [];
  if (!body.cta.trim()) missing.push("CTA");

  const rights = frames.map((f, i) => {
    const r = f.rights;
    const who = !r ? null : r.kind === "owned" ? "Brand's own" : `Confirmed by ${r.name.trim() || "a team member"}`;
    return who ? `Frame ${i + 1}: ${who}` : null;
  });
  const noRights = rights.flatMap((r, i) => (r ? [] : [i + 1]));

  return [
    row(FRAMES, framesOk, `${frames.length} frames, all rendered.`, framesBad),
    row(FRAME_FILES, !fileProblems.length, "Every frame file is 1080×1920 and within the size limits.", `${fileProblems.join("; ")}.`),
    row("Text fits", !unfit.length, "All text fits its frame.", `Text doesn't fit: ${unfit.join(", ")}.`),
    row("Link and CTA", !missing.length, "Link and CTA are set.", `No ${missing.join(" or ")} set.`, "warn"),
    row(ASSET_RIGHTS, !noRights.length, rights.join("; "), `Frame ${noRights.join(", ")} has no rights confirmation.`),
    { check: "Visual review", status: "warn", note: "Not checked: the photos and clips weren't reviewed by AI." },
  ];
}
