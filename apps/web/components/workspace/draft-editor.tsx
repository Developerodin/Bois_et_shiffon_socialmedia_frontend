"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CAPTION_LIMITS } from "@espanda/shared";
import type { ContentItem } from "@/components/workspace/content-panels";

type Body = NonNullable<ContentItem["latest"]>["body"];
const EMPTY: Body = { hook: "", caption: "", hashtags: [], slides: [], script: [], pinTitle: "", altText: "" };
// Limits shared with server/content/rules.ts; the publish limits for Threads and Pinterest are 500.
const CAPTION_MAX: Record<string, number> = { THREADS_POST: CAPTION_LIMITS.threadsMax, PINTEREST_PIN: 500 };
const HASHTAGS_MAX = CAPTION_LIMITS.hashtagsMax;
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * Edit the draft by hand. Saving makes a new version that goes back to the Quality check;
 * any approval of the old version stops holding, and the editor can't approve their own version.
 */
export function DraftEditor(props: { url: string; item: ContentItem; onSaved: () => void; onCancel: () => void }) {
  // A story's frames are made on the phone; the web shows them read-only.
  if (props.item.channel === "INSTAGRAM_STORY") {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">Stories are edited on the phone.</p>
        <Button type="button" variant="ghost" onClick={props.onCancel}>Close</Button>
      </div>
    );
  }
  return <TextDraftEditor {...props} />;
}

function TextDraftEditor({ url, item, onSaved, onCancel }: { url: string; item: ContentItem; onSaved: () => void; onCancel: () => void }) {
  const start = item.latest?.body ?? EMPTY;
  // The version this edit is based on, fixed when the editor opens: the item prop refreshes every few
  // seconds, and sending the fresh version would silently overwrite someone else's newer save.
  const [baseVersion] = useState(item.latest?.version ?? 0);
  const [hook, setHook] = useState(start.hook ?? "");
  const [caption, setCaption] = useState(start.caption ?? "");
  const [hashtags, setHashtags] = useState((start.hashtags ?? []).join(" "));
  const [slides, setSlides] = useState((start.slides ?? []).join("\n"));
  const [script, setScript] = useState((start.script ?? []).join("\n"));
  const [pinTitle, setPinTitle] = useState(start.pinTitle ?? "");
  const [altText, setAltText] = useState(start.altText ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const ch = item.channel;
  const captionMax = CAPTION_MAX[ch] ?? CAPTION_LIMITS.captionMax;
  const body: Body = {
    hook,
    caption,
    hashtags: hashtags.split(/[\s,]+/).filter(Boolean),
    slides: lines(slides),
    script: lines(script),
    pinTitle,
    altText,
  };
  // Hashtags are added under the caption when it posts (server/services/publishing.ts postText), so they count too.
  const tagText = body.hashtags.map((h) => `#${h.replace(/^#*/, "")}`).join(" ");
  const postLength = caption.trim().length + (tagText ? tagText.length + 2 : 0);
  const dirty = JSON.stringify(body) !== JSON.stringify({ ...EMPTY, ...start, hashtags: start.hashtags ?? [], slides: start.slides ?? [], script: start.script ?? [] });

  // Leaving the page with unsaved text asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!caption.trim()) {
      setError("Write a caption first.");
      captionRef.current?.focus();
      return;
    }
    if (body.hashtags.length > HASHTAGS_MAX) {
      setError(`Use ${HASHTAGS_MAX} hashtags at most.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await request(url, { method: "POST", body: JSON.stringify({ action: "edit", version: baseVersion, body }) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const field = "flex flex-col gap-1.5";
  const label = "text-sm font-medium";
  const count = (n: number, max: number) => (
    <span className={cn("text-xs tabular-nums", n > max ? "text-destructive" : "text-muted-foreground")}>
      {n}/{max}
    </span>
  );

  return (
    <form onSubmit={save} className="mt-3 flex flex-col gap-4" aria-label="Edit draft">
      {(item.status === "AWAITING_APPROVAL" || item.status === "APPROVED") && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Saving makes v{baseVersion + 1}. It goes back to the quality check and needs a fresh approval.
        </p>
      )}
      {ch === "PINTEREST_PIN" && (
        <div className={field}>
          <span className="flex justify-between"><label htmlFor="ed-pin" className={label}>Pin title</label>{count(pinTitle.length, 100)}</span>
          <Input id="ed-pin" value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} className="h-11" />
        </div>
      )}
      {ch !== "PINTEREST_PIN" && ch !== "THREADS_POST" && (
        <div className={field}>
          <label htmlFor="ed-hook" className={label}>Hook <span className="font-normal text-muted-foreground">(the line that stops the scroll)</span></label>
          <Input id="ed-hook" value={hook} onChange={(e) => setHook(e.target.value)} className="h-11" />
        </div>
      )}
      <div className={field}>
        <span className="flex justify-between"><label htmlFor="ed-caption" className={label}>{ch === "PINTEREST_PIN" ? "Description" : "Caption"}</label>{count(postLength, captionMax)}</span>
        <Textarea id="ed-caption" ref={captionRef} value={caption} onChange={(e) => setCaption(e.target.value)} rows={8} aria-invalid={!caption.trim() && Boolean(error)} />
      </div>
      <div className={field}>
        <span className="flex justify-between"><label htmlFor="ed-tags" className={label}>Hashtags <span className="font-normal text-muted-foreground">(separate with spaces, {HASHTAGS_MAX} at most)</span></label>{count(body.hashtags.length, HASHTAGS_MAX)}</span>
        <Input id="ed-tags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} className="h-11" placeholder="#boismassif #artdevivre" />
      </div>
      {ch === "INSTAGRAM_CAROUSEL" && (
        <div className={field}>
          <label htmlFor="ed-slides" className={label}>Slides <span className="font-normal text-muted-foreground">(one per line)</span></label>
          <Textarea id="ed-slides" value={slides} onChange={(e) => setSlides(e.target.value)} rows={6} />
        </div>
      )}
      {ch === "INSTAGRAM_REEL" && (
        <div className={field}>
          <label htmlFor="ed-script" className={label}>Script <span className="font-normal text-muted-foreground">(one beat per line)</span></label>
          <Textarea id="ed-script" value={script} onChange={(e) => setScript(e.target.value)} rows={6} />
        </div>
      )}
      {ch !== "THREADS_POST" && (
        <div className={field}>
          <label htmlFor="ed-alt" className={label}>Image description <span className="font-normal text-muted-foreground">(alt text)</span></label>
          <Textarea id="ed-alt" value={altText} onChange={(e) => setAltText(e.target.value)} rows={2} />
        </div>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : `Save as v${baseVersion + 1}`}</Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => (dirty && !discarding ? setDiscarding(true) : onCancel())}
        >
          {discarding ? "Discard changes" : "Cancel"}
        </Button>
        {discarding && <span className="text-xs text-muted-foreground">Click again to throw away your edits.</span>}
      </div>
      <p className="text-xs text-muted-foreground">Someone else with approval rights signs off your version.</p>
    </form>
  );
}
