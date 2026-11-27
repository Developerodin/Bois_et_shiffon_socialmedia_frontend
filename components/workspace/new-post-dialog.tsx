"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Plus } from "lucide-react";
import { LibraryPicker } from "@/components/library/library-picker";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { composeChoices, isWrittenChannel, postedByHand } from "@/lib/new-post";
import { workspaceIdOf } from "@/lib/plan-credits";
import { nowLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CAPTION_LIMITS, CONTENT_GOALS, CONTENT_GOAL_LABELS, captionMaxFor, writtenPostProblem, type ContentGoal, type LibraryPhoto } from "@/shared";

const DIRECTION_MAX = 500;

/**
 * "New post" for people who can create content. Instagram posts and carousels: a product photo, a goal and a note,
 * then the Creator drafts it. Facebook, Pinterest, Threads, LinkedIn and X: the person writes it (within the channel's
 * limits, shared with the server) and it goes to the check. A Reel or a story points to where those are made.
 * With `open`/`onOpenChange` (the top bar's quick create) the caller opens it and no "New post" button shows.
 * `at` (a datetime-local value; the calendar's empty day) adds a date and time field set to it, and the post is made on
 * that date; cleared, or without `at`, the post is made undated as before.
 * `filter`: the calendar's channel filter (a channel or a group); the dialog offers that channel's choices and starts on
 * the first. Without it, every channel. `reelsOn`: the Reels pages are on, so a Reel links to them.
 */
export function NewPostDialog({ base, canCreate, onCreated, open: openProp, onOpenChange, at, filter, reelsOn = false }: { base: string; canCreate: boolean; onCreated: (id: string) => void; open?: boolean; onOpenChange?: (o: boolean) => void; at?: string; filter?: string; reelsOn?: boolean }) {
  const workspaceId = workspaceIdOf(base);
  const brandId = base.split("/brands/")[1];
  const choices = composeChoices(filter);
  const startChannel = choices[0]!.channel;
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [channel, setChannel] = useState(startChannel);
  const [goal, setGoal] = useState<ContentGoal>("newArrival");
  const [photo, setPhoto] = useState<LibraryPhoto | null>(null);
  const [direction, setDirection] = useState("");
  const [text, setText] = useState("");
  const [pinTitle, setPinTitle] = useState("");
  const [pinLink, setPinLink] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One id per opening: a double click or a retry after a dropped answer returns the same post instead of a second one.
  const [requestId, setRequestId] = useState("");
  const controlled = openProp !== undefined;
  const shown = controlled ? openProp : open;

  function reset() {
    setChannel(startChannel);
    setGoal("newArrival");
    setPhoto(null);
    setDirection("");
    setText("");
    setPinTitle("");
    setPinLink("");
    setWhen(at ?? "");
    setError("");
    setRequestId(crypto.randomUUID());
  }
  // Opened by the caller: start fresh, as the button does.
  useEffect(() => {
    if (controlled && openProp) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset reads `at` and `startChannel`, listed; it is remade each render
  }, [controlled, openProp, at, startChannel]);

  if (!canCreate || !workspaceId || !brandId) return null;

  const choice = choices.find((c) => c.channel === channel) ?? choices[0]!;
  const written = isWrittenChannel(choice.channel) ? choice.channel : null;
  const pin = choice.channel === "PINTEREST_PIN";
  const textMax = captionMaxFor(choice.channel);
  // The server's own check (shared/content-limits.ts): what still stops the post, said under the form.
  const problem = written ? writtenPostProblem(written, { text, pinTitle, pinLink, photos: photo ? 1 : 0 }) : photo ? null : "Choose a photo to draft the post.";
  const creates = choice.kind === "ai" || choice.kind === "written";

  function change(next: boolean) {
    if (next) reset();
    if (controlled) onOpenChange?.(next);
    else setOpen(next);
  }

  async function submit() {
    if (!creates || problem || busy) return;
    setBusy(true);
    setError("");
    const scheduledFor = at && when ? { scheduledFor: new Date(when).toISOString() } : {};
    const body = written
      ? { channel: written, text: text.trim(), ...(pin ? { pinTitle: pinTitle.trim(), ...(pinLink.trim() ? { pinLink: pinLink.trim() } : {}) } : {}), photoKeys: photo ? [photo.key] : [], ...scheduledFor, requestId }
      : { channel: choice.channel, goal, product: { title: photo!.title.trim() || "Product", photoKey: photo!.key }, ...(direction.trim() ? { direction: direction.trim() } : {}), ...scheduledFor, requestId };
    try {
      const { id } = await request<{ id: string }>(`${base}/content`, { method: "POST", body: JSON.stringify(body) });
      change(false);
      onCreated(id);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? "You've made 60 posts today. Try again tomorrow." : errorMessage(e, "Couldn't start the post. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const count = (n: number, max: number, id: string) => (
    <span id={id} className={cn("text-xs font-normal tabular-nums", n > max ? "text-destructive" : "text-muted-foreground")}>
      {n}/{max}
    </span>
  );
  const imageField = (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <span>
        {choice.kind === "ai" ? "Product photo" : "Image"}
        {written && !pin && <span className="font-normal text-muted-foreground"> (optional, one)</span>}
      </span>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed library preview */}
        {photo && <img src={photo.url} alt={photo.title} className="size-14 rounded-md border border-border object-cover" />}
        <Button type="button" size="sm" variant="secondary" onClick={() => setPicking(true)}>
          {photo ? "Change" : "Choose"} {choice.kind === "ai" ? "photo" : "image"}
        </Button>
        {photo && written && !pin && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPhoto(null)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {controlled ? null : (
        <Button size="sm" onClick={() => change(true)}>
          <Plus aria-hidden="true" />
          New post
        </Button>
      )}
      <Dialog open={shown} onOpenChange={(o) => !busy && change(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{choice.kind === "ai" ? "New product post" : choice.kind === "written" ? `New ${choice.label} post` : `New ${choice.label}`}</DialogTitle>
            <DialogDescription>
              {choice.kind === "ai"
                ? "Pick a photo and what the post is for. We’ll draft it, then you review it."
                : choice.kind === "written"
                  ? "Write it here. It goes to the quality check, then to approval."
                  : "This one is made in its own place."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {choices.length > 1 && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Channel
                <select
                  value={choice.channel}
                  onChange={(e) => {
                    setChannel(e.target.value);
                    // New post's request ids are shared across channels: a new channel is a new request, never a retry.
                    setRequestId(crypto.randomUUID());
                    setError("");
                  }}
                  className={selectClass}
                >
                  {choices.map((c) => <option key={c.channel} value={c.channel}>{c.label}</option>)}
                </select>
              </label>
            )}
            {choice.kind === "reel" &&
              (reelsOn ? (
                <div className="flex flex-col items-start gap-2 text-sm">
                  <p>Reels are planned, voiced and rendered in Reels.</p>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href="/reels" onClick={() => change(false)}>Open Reels</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Reels are made in Reels, which isn&rsquo;t turned on for this workspace.</p>
              ))}
            {choice.kind === "story" && <p className="text-sm text-muted-foreground">Stories are made in the mobile app; they show on this calendar once made.</p>}
            {choice.kind === "ai" && (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Goal
                  <select value={goal} onChange={(e) => setGoal(e.target.value as ContentGoal)} className={selectClass}>
                    {CONTENT_GOALS.map((g) => <option key={g} value={g}>{CONTENT_GOAL_LABELS[g]}</option>)}
                  </select>
                </label>
                {imageField}
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  <label htmlFor="new-post-direction">
                    Direction <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea id="new-post-direction" value={direction} maxLength={DIRECTION_MAX} onChange={(e) => setDirection(e.target.value)} placeholder="Anything the writer should know" aria-describedby="direction-count" />
                  <span id="direction-count" className="self-end text-xs font-normal text-muted-foreground">{direction.length}/{DIRECTION_MAX}</span>
                </div>
              </>
            )}
            {written && (
              <>
                {postedByHand(written) && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">Published by hand.</span> We can&rsquo;t post to {choice.label} for you: plan and approve it here, then post it on {choice.label} yourself and record it on the post.
                  </p>
                )}
                {pin && (
                  <div className="flex flex-col gap-1.5 text-sm font-medium">
                    <span className="flex justify-between">
                      <label htmlFor="new-post-pin-title">Pin title</label>
                      {count(pinTitle.trim().length, CAPTION_LIMITS.pinTitleMax, "pin-title-count")}
                    </span>
                    <Input id="new-post-pin-title" value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} aria-describedby="pin-title-count" className="h-11" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  <span className="flex justify-between">
                    <label htmlFor="new-post-text">{pin ? "Description" : "Text"}</label>
                    {count(text.trim().length, textMax, "text-count")}
                  </span>
                  <Textarea id="new-post-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} aria-describedby="text-count" />
                </div>
                {pin && (
                  <div className="flex flex-col gap-1.5 text-sm font-medium">
                    <label htmlFor="new-post-pin-link">
                      Link <span className="font-normal text-muted-foreground">(where the pin leads)</span>
                    </label>
                    <Input id="new-post-pin-link" type="url" inputMode="url" placeholder="https://" value={pinLink} onChange={(e) => setPinLink(e.target.value)} className="h-11" aria-describedby="pin-link-help" />
                    <p id="pin-link-help" className="text-xs font-normal text-muted-foreground">Leave empty to lead to the brand&rsquo;s website. The board is planned on the post or chosen when it&rsquo;s scheduled.</p>
                  </div>
                )}
                {imageField}
              </>
            )}
            {creates && at !== undefined && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Date and time
                <Input type="datetime-local" value={when} min={nowLocalInput()} onChange={(e) => setWhen(e.target.value)} className="h-11 w-fit" />
              </label>
            )}
            {creates && problem && <p id="new-post-problem" className="text-xs text-muted-foreground">{problem}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {creates && <p className="text-sm text-muted-foreground">Cost: included in your plan</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>
              {creates ? "Cancel" : "Close"}
            </Button>
            {creates && (
              <Button type="button" disabled={!!problem || busy} aria-describedby={problem ? "new-post-problem" : undefined} onClick={() => void submit()}>
                {busy && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {choice.kind === "ai" ? (busy ? "Drafting…" : "Draft post") : busy ? "Saving…" : "Create post"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LibraryPicker workspaceId={workspaceId} brandId={brandId} open={picking} onOpenChange={setPicking} selectedKey={photo?.key ?? null} canUpload title={choice.kind === "ai" ? "Choose the product photo" : "Choose the image"} onUse={setPhoto} />
    </>
  );
}
